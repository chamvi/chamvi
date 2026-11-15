/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { OPENAPI_OPERATION_METHODS, OPENAPI_QUERY_METHOD } from './constants.ts';
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

function objectField(document: JsonObject, index: number, key: string): JsonObject | undefined {
    const value = document[key];

    if (value === undefined) {
        return undefined;
    }

    if (!isObject(value)) {
        throw new InvalidAgentDefinitionError(`The OpenAPI document at index ${index} of openapi.documents has "${key}" that is no JSON object.`);
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
        throw new InvalidAgentDefinitionError(`The OpenAPI document at index ${index} of openapi.documents has "tags" ` +
            'that is no array of tags with a name.');
    }

    return value as JsonObject[];
}

/**
 * Builds the merge on copies: every path item, component group and the
 * tag list of the result is a new object or array, the entries in it are
 * the inputs' (never written to).
 */
class OpenApiMerge {
    readonly paths: Record<string, JsonObject> = {};

    readonly components: Record<string, JsonObject> = {};

    readonly tags: JsonObject[] = [];

    private readonly methods: ReadonlySet<string>;

    private readonly operationOrigins = new Map<string, Origin>();

    private readonly componentOrigins = new Map<string, Origin>();

    private readonly tagNames = new Set<string>();

    constructor(base: JsonObject | undefined) {
        this.methods = operationMethods(base);
    }

    add(document: JsonObject, index: number, origin: Origin): void {
        for (const [path, item] of Object.entries(objectField(document, index, 'paths') ?? {})) {
            if (!isObject(item)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" of openapi.documents is no JSON object.`);
            }

            this.addPathItem(path, item, origin);
        }

        for (const [group, entries] of Object.entries(objectField(document, index, 'components') ?? {})) {
            if (!isObject(entries)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI component group "${group}" of openapi.documents is no JSON object.`);
            }

            this.addComponents(group, entries, origin);
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

    private addPathItem(path: string, item: JsonObject, origin: Origin): void {
        const target = this.paths[path] ?? {};

        this.paths[path] = target;

        for (const [key, value] of Object.entries(item)) {
            if (this.methods.has(key)) {
                const operation = `${key.toUpperCase()} ${path}`;
                const previous = this.operationOrigins.get(operation);

                if (previous === 'base') {
                    throw new InvalidAgentDefinitionError(`The OpenAPI path "${operation}" is already in ${BASE_NAME}.`);
                }

                if (previous === 'contributed') {
                    throw new InvalidAgentDefinitionError(`The OpenAPI path "${operation}" is contributed twice.`);
                }

                this.operationOrigins.set(operation, origin);
                target[key] = value;

                continue;
            }

            if (!Object.hasOwn(target, key)) {
                target[key] = value;
            } else if (canonicalJson(target[key]) !== canonicalJson(value)) {
                throw new InvalidAgentDefinitionError(`The OpenAPI path "${path}" has a different "${key}" in two documents.`);
            }
        }
    }

    private addComponents(group: string, entries: JsonObject, origin: Origin): void {
        const target = this.components[group] ?? {};

        this.components[group] = target;

        for (const [name, definition] of Object.entries(entries)) {
            const component = `${group}/${name}`;
            const previous = this.componentOrigins.get(component);

            if (previous === undefined) {
                this.componentOrigins.set(component, origin);
                target[name] = definition;

                continue;
            }

            if (canonicalJson(target[name]) === canonicalJson(definition)) {
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
 * input is written to. Paths merge per path and method; a method already
 * there is refused. Another path-item field (`parameters`, `summary`, ...)
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

    if (base.paths !== undefined || Object.keys(merge.paths).length > 0) {
        result.paths = merge.paths;
    }

    if (base.components !== undefined || Object.keys(merge.components).length > 0) {
        result.components = merge.components;
    }

    if (base.tags !== undefined || merge.tags.length > 0) {
        result.tags = merge.tags;
    }

    return result;
}
