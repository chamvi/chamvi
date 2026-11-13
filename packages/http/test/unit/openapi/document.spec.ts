/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isObject } from 'smob';
import { describe, expect, it } from 'vitest';
import type { IConnectionHandle } from '@chamvi/core';
import { parseCollectionQuery, parseKvListQuery } from '../../../src/agents/helpers.ts';
import { parseRunListQuery } from '../../../src/runs/helpers.ts';
import {
    ADMIN_TOKEN,
    approvalIdOf,
    call,
    createRunTestApp,
    createTestApp,
} from '../../utils/app.ts';

type Schema = Record<string, any>;

type Operation = {
    description?: string;
    tags?: string[];
    security?: Record<string, string[]>[];
    parameters?: {
        name: string;
        in: string;
        description?: string;
        required?: boolean
    }[];
    requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema }> };
    responses: Record<string, { description?: string; content?: Record<string, { schema?: Schema }> }>;
};

type Document = {
    openapi: string;
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema>; securitySchemes: Record<string, Schema> };
};

const FILE = fileURLToPath(new URL('../../../dist/swagger.json', import.meta.url));

/** The route table of `@chamvi/http`: `[path, method, tag]`; `/healthz` and `/readyz` are the public ones. */
const ROUTES: [string, string, string][] = [
    ['/healthz', 'get', 'health'],
    ['/readyz', 'get', 'health'],
    ['/me', 'get', 'me'],
    ['/authorization/check', 'post', 'authorization'],
    ['/agents', 'get', 'agent'],
    ['/schedules', 'get', 'schedule'],
    ['/agents/{name}/state/kv', 'get', 'agent'],
    ['/agents/{name}/state/kv/{key}', 'get', 'agent'],
    ['/agents/{name}/state/kv/{key}', 'patch', 'agent'],
    ['/agents/{name}/state/collections/{collection}', 'get', 'agent'],
    ['/agents/{name}/runs', 'post', 'run'],
    ['/runs', 'get', 'run'],
    ['/runs/{id}', 'get', 'run'],
    ['/runs/{id}/stream', 'get', 'run'],
    ['/runs/{id}/artifacts', 'get', 'run'],
    ['/runs/{id}/artifacts/{artifactId}', 'get', 'run'],
    ['/runs/{id}/cancel', 'post', 'run'],
    ['/runs/{id}/approve', 'post', 'run'],
    ['/connections', 'get', 'connection'],
    ['/connections/{name}', 'get', 'connection'],
    ['/connections/{name}', 'delete', 'connection'],
    ['/connections/{name}/events', 'get', 'connection'],
    ['/connections/{name}/reset', 'post', 'connection'],
    ['/connection-types', 'get', 'connection-type'],
    ['/ui-pages', 'get', 'ui-page'],
    ['/connection-types/{type}/connections', 'post', 'connection-type'],
    ['/connections/{name}/config', 'get', 'connection'],
    ['/connections/{name}/config', 'put', 'connection'],
    ['/connections/{name}/test', 'post', 'connection'],
];

const PUBLIC_PATHS = new Set(['/healthz', '/readyz']);

const SCHEMAS = '#/components/schemas/';

/**
 * The routes that answer a success status other than 200, `[path, method,
 * status, body schema]`: the one list. The handler sets the status at
 * runtime, `@DStatus` documents it; the drift check below sends a real
 * request for each entry.
 */
const SUCCESS_STATUSES: [string, string, '201' | '202', Schema][] = [
    ['/agents/{name}/runs', 'post', '202', { $ref: `${SCHEMAS}StartRunView` }],
    ['/runs/{id}/cancel', 'post', '202', { $ref: `${SCHEMAS}CancelRunView` }],
    ['/runs/{id}/approve', 'post', '202', { $ref: `${SCHEMAS}ApproveRunView` }],
    ['/connections/{name}/reset', 'post', '202', { $ref: `${SCHEMAS}ConnectionView` }],
    ['/connection-types/{type}/connections', 'post', '201', {
        allOf: [
            { $ref: `${SCHEMAS}ConnectionSettingsView` },
            {
                properties: { name: { type: 'string' } },
                required: ['name'],
                type: 'object',
            },
        ],
    }],
];

/** The responses of the routes outside `SUCCESS_STATUSES` that document more than a 200 (and the default). */
const OTHER_RESPONSES: Record<string, string[]> = { 'get /readyz': ['200', '503', 'default'] };

/**
 * Components no path reaches that stay on purpose, with the reason; every
 * other component must be reachable from `paths`.
 */
const UNREFERENCED_SCHEMAS = new Set<string>([
    // the fetch `Response` the SSE, download and readiness handlers return: trapi resolves a method's
    // return type even where a handler response (`@DProduces`, `@DDescription`) replaces it
    'Response',
]);

const BODY_ROUTES: [string, string][] = [
    ['/authorization/check', 'post'],
    ['/agents/{name}/state/kv/{key}', 'patch'],
    ['/agents/{name}/runs', 'post'],
    ['/runs/{id}/approve', 'post'],
    ['/connection-types/{type}/connections', 'post'],
    ['/connections/{name}/config', 'put'],
];

/**
 * Schema locations (`<component>.<property path>`) whose value is open on
 * purpose, so the open-object or empty schema is the honest description.
 */
const OPEN_VALUES = new Set<string>([
    // a run's payload: validated against the agent's subscription schema, which the document does not know
    'StartRunRequestBody.payload',
    'RunView.trigger.payload',
    // what a run or a step produced, and a step's input and error: whatever the model or the tool returned
    'RunView.output',
    'Step.input',
    'Step.output',
    'Step.error',
    // agent state: kv values and document fields are any JSON the agent stored
    'KvEntry.value',
    'KvView.value',
    'KvWriteBody.value',
    'StateDocumentView{}',
    // connection settings: field values typed by the connection type's field kinds
    'ConnectionCreateBody.settings{}',
    'ConnectionSaveBody.settings{}',
    'ConnectionSettingsView.settings{}',
]);

const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options']);

function load(): Document | undefined {
    if (!existsSync(FILE)) {
        if (process.env.CI) {
            throw new Error(`${FILE} is missing: build @chamvi/http first.`);
        }

        process.stderr.write(`[openapi] ${FILE} is missing, skipping the document spec (run the build first).\n`);

        return undefined;
    }

    return JSON.parse(readFileSync(FILE, 'utf8')) as Document;
}

const document = load();

function refName(schema: Schema): string | undefined {
    const ref = schema.$ref;

    return typeof ref === 'string' && ref.startsWith('#/components/schemas/') ?
        ref.slice('#/components/schemas/'.length) :
        undefined;
}

function resolve(doc: Document, schema: Schema): Schema {
    let current = schema;
    const seen = new Set<string>();

    for (let name = refName(current); name && !seen.has(name); name = refName(current)) {
        seen.add(name);
        current = doc.components.schemas[name] ?? {};
    }

    return current;
}

/**
 * An open fallback, descriptions aside: `{}`, or a schema of nothing but
 * `type: 'object'`, `additionalProperties: true` and empty `properties`
 * (trapi writes `unknown` as `{ additionalProperties: true }`).
 */
function isFallback(schema: Schema): boolean {
    return Object.entries(schema).every(([key, value]) => {
        switch (key) {
            case 'description':
                return true;
            case 'type':
                return value === 'object';
            case 'additionalProperties':
                return value === true;
            case 'properties':
                return isObject(value) && Object.keys(value).length === 0;
            default:
                return false;
        }
    });
}

/**
 * Every fallback reachable from `schema`, labelled `<component>.<path>`
 * from the nearest named component (or `root` for an inline one).
 */
function findFallbacks(doc: Document, schema: Schema, label: string, out: Set<string>, visited: Set<string>): void {
    const name = refName(schema);

    if (name) {
        if (visited.has(name)) {
            return;
        }

        visited.add(name);
        findFallbacks(doc, doc.components.schemas[name] ?? {}, name, out, visited);

        return;
    }

    if (isFallback(schema)) {
        out.add(label);

        return;
    }

    for (const key of ['anyOf', 'oneOf', 'allOf']) {
        if (Array.isArray(schema[key])) {
            for (const member of schema[key]) {
                findFallbacks(doc, member, label, out, visited);
            }
        }
    }

    if (isObject(schema.properties)) {
        for (const [property, child] of Object.entries(schema.properties)) {
            findFallbacks(doc, child as Schema, `${label}.${property}`, out, visited);
        }
    }

    if (isObject(schema.items)) {
        findFallbacks(doc, schema.items, `${label}[]`, out, visited);
    }

    if (isObject(schema.additionalProperties)) {
        findFallbacks(doc, schema.additionalProperties, `${label}{}`, out, visited);
    }
}

function operations(doc: Document): [string, string, Operation][] {
    const output: [string, string, Operation][] = [];

    for (const [path, item] of Object.entries(doc.paths)) {
        for (const [method, operation] of Object.entries(item)) {
            if (METHODS.has(method)) {
                output.push([path, method, operation]);
            }
        }
    }

    return output;
}

function contentSchemas(content: Record<string, { schema?: Schema }> | undefined): Schema[] {
    return Object.values(content ?? {}).flatMap((media) => (media.schema ? [media.schema] : []));
}

function parameterNames(operation: Operation, location: string): string[] {
    return (operation.parameters ?? []).filter((parameter) => parameter.in === location).map((parameter) => parameter.name);
}

function responseSchema(doc: Document, operation: Operation, status: string): Schema {
    const schema = operation.responses[status]?.content?.['application/json']?.schema;

    expect(schema, `${status} response schema`).toBeDefined();

    return resolve(doc, schema as Schema);
}

/** Every component name a `$ref` in `value` reaches, transitively through the components. */
function collectRefs(doc: Document, value: unknown, out: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectRefs(doc, item, out);
        }

        return;
    }

    if (!isObject(value)) {
        return;
    }

    const name = refName(value as Schema);

    if (name && !out.has(name)) {
        out.add(name);
        collectRefs(doc, doc.components.schemas[name], out);
    }

    for (const child of Object.values(value)) {
        collectRefs(doc, child, out);
    }
}

describe.skipIf(!document)('the generated openapi document', () => {
    const doc = document as Document;

    it('is openapi 3.2', () => {
        expect(doc.openapi.startsWith('3.2')).toBe(true);
    });

    it('holds exactly the route table, each operation with its path variables and tag', () => {
        for (const [path, method, tag] of ROUTES) {
            const operation = doc.paths[path]?.[method];

            expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();

            const variables = Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => match[1]);

            expect(parameterNames(operation as Operation, 'path').toSorted()).toEqual(variables.toSorted());
            expect(operation?.tags, `${method.toUpperCase()} ${path} tags`).toEqual([tag]);
        }

        const listed = operations(doc).map(([path, method]) => `${method} ${path}`).toSorted();

        expect(listed).toEqual(ROUTES.map(([path, method]) => `${method} ${path}`).toSorted());
        expect(Object.keys(doc.paths).filter((path) => path.startsWith('/mcp') || path.startsWith('/channels'))).toEqual([]);
    });

    it('gives each body route a named request schema', () => {
        for (const [path, method] of BODY_ROUTES) {
            const schema = doc.paths[path]?.[method]?.requestBody?.content?.['application/json']?.schema;

            expect(schema, `${method.toUpperCase()} ${path} request body`).toBeDefined();
            expect(Object.keys(resolve(doc, schema as Schema).properties ?? {}).length, `${method.toUpperCase()} ${path}`).toBeGreaterThan(0);
        }
    });

    it('falls back to an open schema only where the value is open', () => {
        const found = new Set<string>();

        for (const [path, method, operation] of operations(doc)) {
            const label = `${method.toUpperCase()} ${path}`;
            const schemas = [
                ...contentSchemas(operation.requestBody?.content),
                ...Object.values(operation.responses).flatMap((response) => contentSchemas(response.content)),
            ];

            for (const schema of schemas) {
                findFallbacks(doc, schema, label, found, new Set());
            }
        }

        expect([...found].filter((label) => !OPEN_VALUES.has(label)).toSorted()).toEqual([]);
        expect([...OPEN_VALUES].filter((label) => !found.has(label)).toSorted()).toEqual([]);
    });

    it('declares the error response and the bearer scheme', () => {
        const error = doc.components.schemas.ErrorResponse;

        expect(error).toBeDefined();
        expect(Object.keys(error?.properties ?? {}).toSorted()).toEqual(['code', 'issues', 'message', 'status']);
        expect(doc.components.securitySchemes.bearer).toEqual({ type: 'http', scheme: 'bearer' });

        for (const [path, method, operation] of operations(doc)) {
            expect(operation.responses.default, `${method.toUpperCase()} ${path} default`).toBeDefined();
        }
    });

    it('requires the bearer token everywhere but on the health routes', () => {
        for (const [path, method, operation] of operations(doc)) {
            if (PUBLIC_PATHS.has(path)) {
                expect(operation.security, `${method.toUpperCase()} ${path}`).toBeUndefined();
            } else {
                expect(operation.security, `${method.toUpperCase()} ${path}`).toEqual([{ bearer: [] }]);
            }
        }
    });

    it('documents the real success status of the 201 and 202 routes, without a 200', () => {
        for (const [path, method, status, schema] of SUCCESS_STATUSES) {
            const operation = doc.paths[path]?.[method] as Operation;
            const label = `${method.toUpperCase()} ${path}`;

            expect(Object.keys(operation.responses).toSorted(), label).toEqual([status, 'default']);
            expect(operation.responses[status]?.content, label).toEqual({ 'application/json': { schema } });
            expect(operation.responses[status]?.description, label).toMatch(status === '201' ? /^Created/ : /^Accepted/);
        }
    });

    it('documents a 200 on every other route', () => {
        const special = new Set(SUCCESS_STATUSES.map(([path, method]) => `${method} ${path}`));

        for (const [path, method, operation] of operations(doc)) {
            const key = `${method} ${path}`;

            if (!special.has(key)) {
                expect(Object.keys(operation.responses).toSorted(), key).toEqual(OTHER_RESPONSES[key] ?? ['200', 'default']);
            }
        }
    });

    it('holds no schema that no path reaches', () => {
        const reachable = new Set<string>();

        collectRefs(doc, doc.paths, reachable);

        const unreferenced = Object.keys(doc.components.schemas).filter((name) => !reachable.has(name));

        expect(unreferenced.toSorted()).toEqual([...UNREFERENCED_SCHEMAS].toSorted());
        expect([...reachable].filter((name) => !doc.components.schemas[name]), 'dangling refs').toEqual([]);
    });

    it('documents the readiness 200 and 503 bodies', () => {
        const operation = doc.paths['/readyz']?.get as Operation;

        expect(Object.keys(responseSchema(doc, operation, '200').properties ?? {})).toEqual(['status']);
        expect(Object.keys(responseSchema(doc, operation, '503').properties ?? {}).toSorted()).toEqual(['reason', 'status']);
    });

    it('declares the bodies of the raw responses', () => {
        for (const path of ['/runs/{id}/stream', '/connections/{name}/events']) {
            expect(doc.paths[path]?.get?.responses['200']?.content, path).toEqual({ 'text/event-stream': { schema: { type: 'string' } } });
        }

        const download = doc.paths['/runs/{id}/artifacts/{artifactId}']?.get?.responses['200'];

        expect(download?.content).toEqual({ 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } });
        expect(download?.description).toContain('stored media type');
    });

    it('gives a connection read one schema, not a oneOf every body matches twice', () => {
        const schema = doc.paths['/connections/{name}']?.get?.responses['200']?.content?.['application/json']?.schema;

        expect(schema).toEqual({ $ref: '#/components/schemas/ConnectionDetailView' });
    });

    it('marks the start body and its idempotency header optional', () => {
        const operation = doc.paths['/agents/{name}/runs']?.post as Operation;
        const header = operation.parameters?.find((parameter) => parameter.in === 'header' && parameter.name === 'idempotency-key');

        expect(operation.requestBody?.required).not.toBe(true);
        expect(header?.required).toBe(false);
    });

    it('marks the check body optional: without one every chamvi permission is asked', () => {
        const operation = doc.paths['/authorization/check']?.post as Operation;

        expect(operation.requestBody?.content?.['application/json']?.schema).toBeDefined();
        expect(operation.requestBody?.required).not.toBe(true);
    });

    it('documents the resume parameters of the run stream', () => {
        const parameters = (doc.paths['/runs/{id}/stream']?.get as Operation).parameters ?? [];
        const after = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'after');
        const lastEventId = parameters.find((parameter) => parameter.in === 'header' && parameter.name === 'Last-Event-ID');

        expect(parameters.filter((parameter) => parameter.in !== 'path').map((parameter) => `${parameter.in}:${parameter.name}`).toSorted())
            .toEqual(['header:Last-Event-ID', 'query:after']);
        expect(after?.required).toBe(false);
        expect((after as { schema?: Schema } | undefined)?.schema).toMatchObject({ type: 'integer', minimum: 0 });
        expect(after?.description).toMatch(/400/);
        expect(lastEventId?.required).toBe(false);
        expect((lastEventId as { schema?: Schema } | undefined)?.schema).toMatchObject({ type: 'string' });
        expect(lastEventId?.description).toMatch(/wins over `after`/);
    });

    it('can be inlined into the ui shell unescaped', () => {
        // @routup/swagger-ui writes the document into a <script> with String.replace, unescaped
        // (routup/plugins#855): nothing may close the script or open a comment, no replacement pattern expand
        const content = JSON.stringify(doc);

        expect(content).not.toMatch(/<\/script/i);
        expect(content).not.toContain('<!--');

        for (const pattern of ['$&', '$`', '$\'', '$$']) {
            expect(content, pattern).not.toContain(pattern);
        }
    });

    it('speaks to API consumers in its descriptions', () => {
        const texts: string[] = [];
        const collect = (value: unknown): void => {
            if (Array.isArray(value)) {
                value.forEach(collect);

                return;
            }

            if (!isObject(value)) {
                return;
            }

            for (const [key, child] of Object.entries(value)) {
                if ((key === 'description' || key === 'summary') && typeof child === 'string') {
                    texts.push(child);
                } else {
                    collect(child);
                }
            }
        };

        collect(doc.paths);
        collect(doc.components);

        // route syntax of the router (`/runs/:id`), internal type, store and service names, the router's etag path
        expect(texts.filter((text) => /\/:[a-z]|\bStartRunBody\b|\bstore\.|Service\b|\betag\b/i.test(text))).toEqual([]);
        expect((doc as unknown as { info: { description: string } }).info.description).not.toMatch(/webhooks and MCP/i);
    });

    it('documents only query examples the route parses', () => {
        const parsers: [string, (params: URLSearchParams) => unknown, boolean][] = [
            ['/runs', (params) => parseRunListQuery(params), true],
            ['/agents/{name}/state/kv', (params) => parseKvListQuery(params), false],
            ['/agents/{name}/state/collections/{collection}', (params) => parseCollectionQuery(params), true],
        ];

        for (const [path, parse, documented] of parsers) {
            const operation = doc.paths[path]?.get as Operation;
            const texts: string[] = [operation.description ?? '', ...(operation.parameters ?? []).map((parameter) => parameter.description ?? '')];
            // a backticked query string; placeholders (`filter[<field>]=value`, `filter[...]`) carry `<` or `...` and are skipped
            const examples = texts
                .flatMap((text) => Array.from(text.matchAll(/`([^`]+)`/g), (match) => match[1] as string))
                .filter((example) => /^(?:filter|sort|page)(?:\[[^\]]*\])?=/.test(example))
                .filter((example) => !example.includes('<') && !example.includes('...'));

            if (documented) {
                expect(examples.length, path).toBeGreaterThan(0);
            }

            for (const example of examples) {
                expect(() => parse(new URLSearchParams(example)), `${path} ${example}`).not.toThrow();
            }
        }
    });

    it('gives every parameter a schema', () => {
        for (const [path, method, operation] of operations(doc)) {
            for (const parameter of operation.parameters ?? []) {
                const label = `${method.toUpperCase()} ${path} ${parameter.in}:${parameter.name}`;

                expect(isFallback(resolve(doc, (parameter as { schema?: Schema }).schema ?? {})), label).toBe(false);
            }
        }

        const header = doc.paths['/agents/{name}/runs']?.post?.parameters?.find((parameter) => parameter.in === 'header');

        expect(header?.name).toBe('idempotency-key');
        expect(header?.required).toBe(false);
        expect((header as { schema?: Schema } | undefined)?.schema).toMatchObject({ type: 'string' });
        expect(JSON.stringify((header as { schema?: Schema } | undefined)?.schema)).not.toContain('null');
    });

    it('names the package and its version', () => {
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8')) as { version: string };

        expect((doc as unknown as { info: { title: string; version: string } }).info).toMatchObject({ title: '@chamvi/http', version: pkg.version });
    });

    it('lists the query parameters of the three list routes', () => {
        expect(parameterNames(doc.paths['/runs']?.get as Operation, 'query').toSorted())
            .toEqual(['filter[agent]', 'filter[parent]', 'filter[status]', 'filter[waiting]', 'page[limit]', 'page[offset]', 'sort']);
        expect(parameterNames(doc.paths['/agents/{name}/state/kv']?.get as Operation, 'query').toSorted())
            .toEqual(['page[limit]', 'page[offset]']);
        expect(parameterNames(doc.paths['/agents/{name}/state/collections/{collection}']?.get as Operation, 'query').toSorted())
            .toEqual(['filter[<field>]', 'page[limit]']);

        const runs = (doc.paths['/runs']?.get as Operation).parameters ?? [];
        const schemaOf = (name: string) => (runs.find((parameter) => parameter.name === name) as { schema?: Schema } | undefined)?.schema;

        expect(schemaOf('sort')).toMatchObject({ type: 'string', enum: ['createdAt', '-createdAt'] });
        expect(schemaOf('filter[waiting]')).toMatchObject({ type: 'string', enum: ['approval', 'dispatch'] });
    });
});

/**
 * The drift check: each `SUCCESS_STATUSES` entry answered by a real request
 * through the test app, so the documented status and the one the handler
 * sets cannot part. Entries without a probe here name the spec that sends it.
 */
describe('the documented success statuses', () => {
    const probes: Record<string, () => Promise<Response>> = {
        'post /agents/{name}/runs': async () => {
            const { app } = createRunTestApp();

            return call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN });
        },
        'post /runs/{id}/cancel': async () => {
            const { app } = createRunTestApp();
            const started = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN });
            const { runId } = await started.json() as { runId: string };

            return call(app, 'POST', `/runs/${runId}/cancel`, { token: ADMIN_TOKEN });
        },
        'post /runs/{id}/approve': async () => {
            const {
                app,
                engine,
                store,
            } = createRunTestApp();
            const started = await call(app, 'POST', '/agents/gate/runs', { token: ADMIN_TOKEN });
            const { runId } = await started.json() as { runId: string };

            await engine.start();
            await engine.idle();

            const response = await call(app, 'POST', `/runs/${runId}/approve`, {
                token: ADMIN_TOKEN,
                body: { approvalId: await approvalIdOf(store, runId), approved: false },
            });

            await engine.idle();
            await engine.drain();

            return response;
        },
        'post /connections/{name}/reset': async () => {
            const handle: IConnectionHandle = {
                name: 'alpha',
                type: 'whatsapp',
                status: () => 'pairing',
                widgets: () => [],
                subscribe: () => () => {},
                actions: { reset: async () => undefined },
            };
            const { app } = createTestApp({ connections: () => [handle] });

            return call(app, 'POST', '/connections/alpha/reset', { token: ADMIN_TOKEN });
        },
    };
    // a create needs a keyring and a declared connection type: `test/unit/connections/config.spec.ts` asserts its 201
    const elsewhere = new Set(['post /connection-types/{type}/connections']);

    it('probes every entry or names the spec that does', () => {
        const keys = SUCCESS_STATUSES.map(([path, method]) => `${method} ${path}`);

        expect(keys.filter((key) => !probes[key] && !elsewhere.has(key))).toEqual([]);
    });

    for (const [path, method, status] of SUCCESS_STATUSES) {
        const probe = probes[`${method} ${path}`];

        it.skipIf(!probe)(`${method.toUpperCase()} ${path} answers ${status}`, async () => {
            expect((await (probe as () => Promise<Response>)()).status).toBe(Number(status));
        });
    }
});
