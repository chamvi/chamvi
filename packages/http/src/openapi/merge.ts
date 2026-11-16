/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import {
    OPENAPI_ADDITIONAL_OPERATIONS,
    OPENAPI_OPERATION_METHODS,
    OPENAPI_QUERY_METHOD,
    OPENAPI_RESERVED_KEYS,
} from './constants.ts';
import { canonicalJson } from './helpers.ts';

type JsonObject = Record<string, unknown>;

/** Where a merged entry came from: chamvi's own document or a contributed one. */
type Origin = 'base' | 'contributed';

const BASE_NAME = 'the document of @chamvi/http';

/** The operation keys of a document of this version: `query` from OpenAPI 3.2 on (no base: chamvi's 3.2). */
function operationMethods(base: JsonObject | undefined): ReadonlySet<string> {
    const version = base ? base.openapi : '3.2.0';
    const match = typeof version === 'string' ? /^3\.(\d+)\./.exec(version) : null;
    const methods = new Set(OPENAPI_OPERATION_METHODS);

    if (match && Number(match[1]) >= 2) {
        methods.add(OPENAPI_QUERY_METHOD);
    }

    return methods;
}

/** The document's name in a refusal: chamvi's own (index -1) or a contributed one. */
function documentName(index: number): string {
    return index < 0 ?
        'The OpenAPI document of @chamvi/http' :
        `The OpenAPI document at index ${index} of openapi.documents`;
}

/** `path` with every parameter name blanked: `/n/{id}` and `/n/{noteId}` are one path. */
function pathTemplateKey(path: string): string {
    return path.replace(/\{[^}]*\}/g, '{}');
}

/** The own entries of `object`, refusing a key that would reach `Object.prototype` (named, never the content). */
function entriesOf(object: JsonObject, index: number, what: string): [string, unknown][] {
    const entries = Object.entries(object);

    for (const [key] of entries) {
        if (OPENAPI_RESERVED_KEYS.includes(key)) {
            throw new InvalidAgentDefinitionError(`${documentName(index)} uses the reserved name "${key}" as ${what}.`);
        }
    }

    return entries;
}

function objectField(document: JsonObject, index: number, key: string): JsonObject | undefined {
    const value = document[key];

    if (value === undefined) {
        return undefined;
    }

    if (!isObject(value)) {
        throw new InvalidAgentDefinitionError(`${documentName(index)} has "${key}" that is no JSON object.`);
    }

    return value;
}

function tagsField(document: JsonObject, index: number): JsonObject[] {
    const value = document.tags;

    if (value === undefined) {
        return [];
    }

    const unnamed = !Array.isArray(value) || value.some((tag) => !isObject(tag) || typeof tag.name !== 'string');

    if (unnamed) {
        throw new InvalidAgentDefinitionError(`${documentName(index)} has "tags" that is no array of tags with a name.`);
    }

    return value as JsonObject[];
}

/** A plain object of `map`'s entries, in order; every own key stays an own property. */
function toObject<T>(map: Map<string, T>): Record<string, T> {
    return Object.fromEntries(map);
}

/**
 * Builds the merge in maps, never on plain objects a key could reach
 * `Object.prototype` through; every path item, component group and the
 * tag list of the result is new, the entries in it are the inputs' (never
 * written to).
 */
class OpenApiMerge {
    /** By path as written: its fields (`additionalOperations` a map). */
    private readonly paths = new Map<string, Map<string, unknown>>();

    /** By path template with blanked parameter names: the path of that shape merged first. */
    private readonly templates = new Map<string, string>();

    private readonly components = new Map<string, Map<string, unknown>>();

    readonly tags: JsonObject[] = [];

    private readonly methods: ReadonlySet<string>;

    private readonly operationOrigins = new Map<string, Origin>();

    private readonly componentOrigins = new Map<string, Origin>();

    private readonly tagNames = new Set<string>();

    constructor(base: JsonObject | undefined) {
        this.methods = operationMethods(base);
    }

    get pathCount(): number {
        return this.paths.size;
    }

    get componentCount(): number {
        return this.components.size;
    }

    add(document: JsonObject, index: number, origin: Origin): void {
        for (const [path, item] of entriesOf(objectField(document, index, 'paths') ?? {}, index, 'a path')) {
            if (!isObject(item)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" of openapi.documents is no JSON object.`);
            }

            this.addPathItem(path, entriesOf(item, index, 'a path-item field'), index, origin);
        }

        for (const [group, entries] of entriesOf(objectField(document, index, 'components') ?? {}, index, 'a component group')) {
            if (!isObject(entries)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI component group "${group}" of openapi.documents is no JSON object.`);
            }

            this.addComponents(group, entriesOf(entries, index, 'a component name'), origin);
        }

        for (const tag of tagsField(document, index)) {
            const name = tag.name as string;

            // tags only describe: the first description wins
            if (!this.tagNames.has(name)) {
                this.tagNames.add(name);
                this.tags.push(tag);
            }
        }
    }

    /** The merged paths, `additionalOperations` as a plain object again. */
    pathsObject(): JsonObject {
        return Object.fromEntries(Array.from(this.paths, ([path, fields]) => [
            path,
            Object.fromEntries(Array.from(fields, ([key, value]) => [key, value instanceof Map ? toObject(value) : value])),
        ]));
    }

    componentsObject(): JsonObject {
        return Object.fromEntries(Array.from(this.components, ([group, entries]) => [group, toObject(entries)]));
    }

    private addPathItem(path: string, entries: [string, unknown][], index: number, origin: Origin): void {
        const template = pathTemplateKey(path);
        const first = this.templates.get(template);

        // one shape under two parameter names would leave an operation with a
        // path parameter its template does not declare: an invalid document
        if (first !== undefined && first !== path) {
            throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" has the shape of "${first}" with other parameter names: use one template.`);
        }

        let target = this.paths.get(path);

        if (!target) {
            target = new Map<string, unknown>();
            this.templates.set(template, path);
            this.paths.set(path, target);
        }

        for (const [key, value] of entries) {
            const method = key.toLowerCase();

            if (this.methods.has(method)) {
                this.claimOperation(path, method, origin);
                target.set(method, value);

                continue;
            }

            if (key === OPENAPI_ADDITIONAL_OPERATIONS) {
                this.addAdditionalOperations(path, target, value, index, origin);

                continue;
            }

            if (!target.has(key)) {
                target.set(key, value);
            } else if (canonicalJson(target.get(key)) !== canonicalJson(value)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" has a different "${key}" in two documents.`);
            }
        }
    }

    /** OpenAPI 3.2's map of further methods: merged per method like the fixed ones, the keys as written. */
    private addAdditionalOperations(path: string, target: Map<string, unknown>, value: unknown, index: number, origin: Origin): void {
        if (!isObject(value)) {
            throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" has "${OPENAPI_ADDITIONAL_OPERATIONS}" that is no JSON object.`);
        }

        let operations = target.get(OPENAPI_ADDITIONAL_OPERATIONS) as Map<string, unknown> | undefined;

        if (!operations) {
            operations = new Map<string, unknown>();
            target.set(OPENAPI_ADDITIONAL_OPERATIONS, operations);
        }

        for (const [key, operation] of entriesOf(value, index, 'an additional operation')) {
            const method = key.toLowerCase();

            // the map MUST NOT hold a method that has a fixed field (OpenAPI 3.2, Path Item Object)
            if (this.methods.has(method)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" has "${key}" in ${OPENAPI_ADDITIONAL_OPERATIONS}: use its fixed field "${method}".`);
            }

            this.claimOperation(path, method, origin);
            operations.set(key, operation);
        }
    }

    /** Records `method` (lowercase) on `path`, refusing one already there. */
    private claimOperation(path: string, method: string, origin: Origin): void {
        const id = `${method} ${path}`;
        const previous = this.operationOrigins.get(id);
        const operation = `${method.toUpperCase()} ${path}`;

        if (previous === 'base') {
            throw new InvalidAgentDefinitionError(`The OpenAPI path "${operation}" is already in ${BASE_NAME}.`);
        }

        if (previous === 'contributed') {
            throw new InvalidAgentDefinitionError(`The OpenAPI path "${operation}" is contributed twice.`);
        }

        this.operationOrigins.set(id, origin);
    }

    private addComponents(group: string, entries: [string, unknown][], origin: Origin): void {
        const target = this.components.get(group) ?? new Map<string, unknown>();

        this.components.set(group, target);

        for (const [name, definition] of entries) {
            const component = `${group}/${name}`;
            const previous = this.componentOrigins.get(component);

            if (previous === undefined) {
                this.componentOrigins.set(component, origin);
                target.set(name, definition);

                continue;
            }

            if (canonicalJson(target.get(name)) === canonicalJson(definition)) {
                continue;
            }

            throw new InvalidAgentDefinitionError(previous === 'base' ?
                `The OpenAPI component "${component}" differs from the one in ${BASE_NAME}.` :
                `The OpenAPI component "${component}" is contributed twice with different definitions.`);
        }
    }
}

/**
 * `base` (chamvi's document) with the `paths`, `tags` and `components`
 * groups of the contributed `documents` merged in, as a new object; no
 * input is written to. Paths merge per path and method (case-insensitive,
 * written lowercase), the methods of `additionalOperations` too (compared
 * case-insensitively, written as given; one with a fixed field refused); a
 * method already there is refused, as is a path of the shape of another
 * with other parameter names (`/n/{id}`, `/n/{noteId}`). A path, path-item
 * field, additional operation, component group or component name
 * `__proto__`, `constructor` or `prototype` is refused. Another path-item field (`parameters`, `summary`, ...)
 * keeps its first value, a different one is refused. A component (any
 * group: `schemas`, `securitySchemes`, `parameters`, ...) of a name already
 * there is kept once when its definition is identical (canonical JSON) and
 * refused otherwise. Tags merge by name, the first one wins, also with
 * another description: tags describe, they are no contract. Every other
 * top-level key of a contributed document (`info`, `servers`, `openapi`,
 * `security`, ...) is ignored.
 *
 * Without `base` the documents are only checked against each other and the
 * answer is `undefined`. Every refusal is an `InvalidAgentDefinitionError`.
 */
export function mergeOpenApiDocuments(
    base: Record<string, unknown> | undefined,
    documents: readonly unknown[],
): Record<string, unknown> | undefined {
    const merge = new OpenApiMerge(base);

    if (base) {
        merge.add(base, -1, 'base');
    }

    documents.forEach((document, index) => {
        if (!isObject(document)) {
            throw new InvalidAgentDefinitionError(`The OpenAPI document at index ${index} of openapi.documents is no JSON object.`);
        }

        merge.add(document, index, 'contributed');
    });

    if (!base) {
        return undefined;
    }

    const result: Record<string, unknown> = { ...base };

    if (base.paths !== undefined || merge.pathCount > 0) {
        result.paths = merge.pathsObject();
    }

    if (base.components !== undefined || merge.componentCount > 0) {
        result.components = merge.componentsObject();
    }

    if (base.tags !== undefined || merge.tags.length > 0) {
        result.tags = merge.tags;
    }

    return result;
}
