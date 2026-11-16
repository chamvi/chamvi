/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import {
    afterAll,
    describe,
    expect,
    it,
} from 'vitest';
import { mergeOpenApiDocuments } from '../../../src/openapi/merge.ts';
import type { HttpAppOptions } from '@chamvi/http';
import { createTestApp } from '../../utils/app.ts';

const DIRECTORY = mkdtempSync(join(tmpdir(), 'chamvi-openapi-merge-'));

afterAll(() => {
    rmSync(DIRECTORY, { recursive: true, force: true });
});

const OK = { responses: { 200: { description: 'ok' } } };

function base(): Record<string, unknown> {
    return {
        openapi: '3.2.0',
        info: { title: '@chamvi/http', version: '1.0.0' },
        servers: [{ url: '/' }],
        paths: { '/runs': { get: OK } },
        components: {
            schemas: { ErrorResponse: { type: 'object', properties: { code: { type: 'string' } } } },
            securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
        },
    };
}

function notesGet(): Record<string, unknown> {
    return {
        openapi: '3.2.0',
        info: { title: 'notes', version: '0.1.0' },
        servers: [{ url: 'https://elsewhere.test' }],
        tags: [{ name: 'notes', description: 'Notes.' }],
        paths: { '/notes': { get: { ...OK, tags: ['notes'] } } },
        components: {
            schemas: { Note: { type: 'object', properties: { id: { type: 'string' } } } },
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                },
            },
        },
    };
}

function notesDelete(): Record<string, unknown> {
    return {
        openapi: '3.2.0',
        info: { title: 'notes-delete', version: '0.1.0' },
        tags: [{ name: 'notes', description: 'Other words.' }, { name: 'admin' }],
        paths: { '/notes': { delete: OK } },
        components: {
            // the same definition, keys in another order
            schemas: { Note: { properties: { id: { type: 'string' } }, type: 'object' } },
        },
    };
}

function refusal(run: () => unknown): string {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);

        return (error as Error).message;
    }

    throw new Error('expected a refusal');
}

describe('mergeOpenApiDocuments', () => {
    it('merges paths per method, tags by name and the component groups; info and servers stay the base\'s', () => {
        const merged = mergeOpenApiDocuments(base(), [notesGet(), notesDelete()])!;

        expect(merged.info).toEqual(base().info);
        expect(merged.servers).toEqual([{ url: '/' }]);
        expect(merged.openapi).toBe('3.2.0');
        expect(merged.paths).toEqual({
            '/runs': { get: OK },
            '/notes': { get: { ...OK, tags: ['notes'] }, delete: OK },
        });
        // the first description wins
        expect(merged.tags).toEqual([{ name: 'notes', description: 'Notes.' }, { name: 'admin' }]);
        expect(merged.components).toEqual({
            schemas: {
                ErrorResponse: { type: 'object', properties: { code: { type: 'string' } } },
                Note: { type: 'object', properties: { id: { type: 'string' } } },
            },
            securitySchemes: {
                bearer: { type: 'http', scheme: 'bearer' },
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                },
            },
        });
    });

    it('merges the other component groups like schemas', () => {
        const parameter = {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
        };
        const merged = mergeOpenApiDocuments(base(), [
            { components: { parameters: { id: parameter }, responses: { NotFound: { description: 'gone' } } } },
            { components: { parameters: { id: { ...parameter } } } },
        ])!;

        expect(merged.components).toMatchObject({
            parameters: { id: parameter },
            responses: { NotFound: { description: 'gone' } },
        });
        expect(refusal(() => mergeOpenApiDocuments(base(), [
            { components: { parameters: { id: parameter } } },
            { components: { parameters: { id: { ...parameter, required: false } } } },
        ]))).toBe('The OpenAPI component "parameters/id" is contributed twice with different definitions.');
    });

    it('merges a document without paths or components as empty', () => {
        const merged = mergeOpenApiDocuments(base(), [{ openapi: '3.2.0', info: { title: 'x', version: '1' } }, {}])!;

        expect(merged).toEqual(base());
    });

    it('returns the base unchanged in content without documents', () => {
        expect(JSON.stringify(mergeOpenApiDocuments(base(), []))).toBe(JSON.stringify(base()));
    });

    it.each([
        ['null', null],
        ['an array', []],
        ['a string', 'openapi'],
    ])('refuses a document that is %s', (_name, document) => {
        expect(refusal(() => mergeOpenApiDocuments(base(), [notesGet(), document])))
            .toBe('The OpenAPI document at index 1 of openapi.documents is no JSON object.');
        expect(refusal(() => mergeOpenApiDocuments(undefined, [document])))
            .toBe('The OpenAPI document at index 0 of openapi.documents is no JSON object.');
    });

    it.each([
        ['paths', { paths: [] }, 'The OpenAPI document at index 0 of openapi.documents has "paths" that is no JSON object.'],
        ['a path item', { paths: { '/notes': 'x' } }, 'The OpenAPI path "/notes" of openapi.documents is no JSON object.'],
        ['components', { components: 'x' }, 'The OpenAPI document at index 0 of openapi.documents has "components" that is no JSON object.'],
        ['a component group', { components: { schemas: [] } }, 'The OpenAPI component group "schemas" of openapi.documents is no JSON object.'],
        ['tags', { tags: {} }, 'The OpenAPI document at index 0 of openapi.documents has "tags" that is no array of tags with a name.'],
        ['a tag', { tags: [{ description: 'x' }] }, 'The OpenAPI document at index 0 of openapi.documents has "tags" that is no array of tags with a name.'],
    ])('refuses %s of the wrong shape', (_name, document, message) => {
        expect(refusal(() => mergeOpenApiDocuments(base(), [document]))).toBe(message);
    });

    it('refuses an operation already in chamvi\'s document', () => {
        expect(refusal(() => mergeOpenApiDocuments(base(), [{ paths: { '/runs': { get: OK } } }])))
            .toBe('The OpenAPI path "GET /runs" is already in the document of @chamvi/http.');
    });

    it('takes another method of a path of chamvi\'s document', () => {
        const merged = mergeOpenApiDocuments(base(), [{ paths: { '/runs': { patch: OK } } }])!;

        expect(merged.paths).toEqual({ '/runs': { get: OK, patch: OK } });
    });

    it('refuses an operation contributed twice, also without the base', () => {
        const message = 'The OpenAPI path "GET /notes" is contributed twice.';

        expect(refusal(() => mergeOpenApiDocuments(base(), [notesGet(), notesGet()]))).toBe(message);
        expect(refusal(() => mergeOpenApiDocuments(undefined, [notesGet(), notesGet()]))).toBe(message);
    });

    it('compares paths case-sensitively, as written', () => {
        const merged = mergeOpenApiDocuments(base(), [{ paths: { '/Runs': { get: OK } } }])!;

        expect(Object.keys(merged.paths as object)).toEqual(['/runs', '/Runs']);
    });

    it('counts query as a method of a 3.2 document only', () => {
        const query = { paths: { '/notes': { query: OK } } };

        expect(refusal(() => mergeOpenApiDocuments(base(), [query, query])))
            .toBe('The OpenAPI path "QUERY /notes" is contributed twice.');
        expect(refusal(() => mergeOpenApiDocuments(undefined, [query, query])))
            .toBe('The OpenAPI path "QUERY /notes" is contributed twice.');

        // in 3.1 `query` is no operation: an identical field is kept once
        const merged = mergeOpenApiDocuments({ ...base(), openapi: '3.1.0' }, [query, query])!;

        expect((merged.paths as Record<string, unknown>)['/notes']).toEqual({ query: OK });
    });

    it('keeps an identical path-item field once and refuses a different one', () => {
        const parameters = [{
            name: 'id',
            in: 'path',
            required: true,
        }];
        const merged = mergeOpenApiDocuments(base(), [
            { paths: { '/notes/{id}': { parameters, get: OK } } },
            {
                paths: {
                    '/notes/{id}': {
                        parameters: [{
                            required: true,
                            in: 'path',
                            name: 'id',
                        }],
                        delete: OK,
                    },
                },
            },
        ])!;

        expect((merged.paths as Record<string, unknown>)['/notes/{id}']).toEqual({
            parameters,
            get: OK,
            delete: OK,
        });
        expect(refusal(() => mergeOpenApiDocuments(base(), [
            { paths: { '/notes/{id}': { summary: 'A note.', get: OK } } },
            { paths: { '/notes/{id}': { summary: 'Another.', delete: OK } } },
        ]))).toBe('The OpenAPI path "/notes/{id}" has a different "summary" in two documents.');
        expect(refusal(() => mergeOpenApiDocuments(base(), [{ paths: { '/runs': { summary: 'Runs.' } } }, { paths: { '/runs': { summary: 'Other.' } } }])))
            .toBe('The OpenAPI path "/runs" has a different "summary" in two documents.');
    });

    it('keeps a schema with an identical definition once and refuses a different one', () => {
        const merged = mergeOpenApiDocuments(base(), [notesGet(), notesDelete()])!;

        expect(Object.keys((merged.components as { schemas: object }).schemas)).toEqual(['ErrorResponse', 'Note']);

        const other = { components: { schemas: { Note: { type: 'string' } } } };

        expect(refusal(() => mergeOpenApiDocuments(base(), [notesGet(), other])))
            .toBe('The OpenAPI component "schemas/Note" is contributed twice with different definitions.');
        expect(refusal(() => mergeOpenApiDocuments(undefined, [notesGet(), other])))
            .toBe('The OpenAPI component "schemas/Note" is contributed twice with different definitions.');
    });

    it('keeps the base\'s ErrorResponse redefined identically and refuses a different one', () => {
        const same = { components: { schemas: { ErrorResponse: { properties: { code: { type: 'string' } }, type: 'object' } } } };

        expect((mergeOpenApiDocuments(base(), [same])!.components as { schemas: object }).schemas)
            .toEqual((base().components as { schemas: object }).schemas);

        const different = { components: { schemas: { ErrorResponse: { type: 'object' } } } };

        expect(refusal(() => mergeOpenApiDocuments(base(), [different])))
            .toBe('The OpenAPI component "schemas/ErrorResponse" differs from the one in the document of @chamvi/http.');
    });

    it('validates the documents against each other and returns undefined without a base', () => {
        expect(mergeOpenApiDocuments(undefined, [notesGet(), notesDelete()])).toBeUndefined();
    });

    it('names chamvi\'s own document in a refusal of its shape', () => {
        expect(refusal(() => mergeOpenApiDocuments({ ...base(), paths: [] }, [])))
            .toBe('The OpenAPI document of @chamvi/http has "paths" that is no JSON object.');
    });

    describe('with path templates of one shape', () => {
        function idParameter(name: string): Record<string, unknown> {
            return {
                name,
                in: 'path',
                required: true,
                schema: { type: 'string' },
            };
        }

        function notesById(name: string, method: string): Record<string, unknown> {
            return {
                openapi: '3.2.0',
                info: { title: `notes-${method}`, version: '0.1.0' },
                paths: { [`/notes/{${name}}`]: { [method]: { ...OK, parameters: [idParameter(name)] } } },
            };
        }

        it('merges identical templates per method', () => {
            const merged = mergeOpenApiDocuments(base(), [notesById('id', 'get'), notesById('id', 'delete')])!;

            expect(merged.paths).toEqual({
                '/runs': { get: OK },
                '/notes/{id}': {
                    get: { ...OK, parameters: [idParameter('id')] },
                    delete: { ...OK, parameters: [idParameter('id')] },
                },
            });
        });

        it('refuses other parameter names between contributed documents, also without the base', () => {
            const message = 'The OpenAPI path "/notes/{noteId}" has the shape of "/notes/{id}" with other parameter names: use one template.';

            expect(refusal(() => mergeOpenApiDocuments(base(), [notesById('id', 'get'), notesById('noteId', 'delete')]))).toBe(message);
            expect(refusal(() => mergeOpenApiDocuments(undefined, [notesById('id', 'get'), notesById('noteId', 'delete')]))).toBe(message);
        });

        it('refuses other parameter names than a path of chamvi\'s document', () => {
            const withRun = { ...base(), paths: { '/runs/{id}': { get: { ...OK, parameters: [idParameter('id')] } } } };

            expect(refusal(() => mergeOpenApiDocuments(withRun, [{ paths: { '/runs/{runId}': { patch: { ...OK, parameters: [idParameter('runId')] } } } }])))
                .toBe('The OpenAPI path "/runs/{runId}" has the shape of "/runs/{id}" with other parameter names: use one template.');
        });
    });

    it('reads method keys case-insensitively', () => {
        expect(refusal(() => mergeOpenApiDocuments(base(), [{ paths: { '/runs': { GET: OK } } }])))
            .toBe('The OpenAPI path "GET /runs" is already in the document of @chamvi/http.');
        expect(refusal(() => mergeOpenApiDocuments(undefined, [
            { paths: { '/notes': { get: OK } } },
            { paths: { '/notes': { Get: OK } } },
        ]))).toBe('The OpenAPI path "GET /notes" is contributed twice.');

        const merged = mergeOpenApiDocuments(base(), [{ paths: { '/notes': { PATCH: OK } } }])!;

        expect((merged.paths as Record<string, unknown>)['/notes']).toEqual({ patch: OK });
    });

    describe('with additionalOperations', () => {
        function extra(method: string, path = '/notes'): Record<string, unknown> {
            return { paths: { [path]: { additionalOperations: { [method]: OK } } } };
        }

        it('merges them per method, keeping the capitalization as written', () => {
            const merged = mergeOpenApiDocuments(base(), [extra('COPY'), extra('MOVE'), { paths: { '/notes': { get: OK } } }])!;

            expect((merged.paths as Record<string, unknown>)['/notes']).toEqual({ additionalOperations: { COPY: OK, MOVE: OK }, get: OK });
        });

        it('refuses a method contributed twice, compared case-insensitively, also without the base', () => {
            expect(refusal(() => mergeOpenApiDocuments(base(), [extra('COPY'), extra('COPY')])))
                .toBe('The OpenAPI path "COPY /notes" is contributed twice.');
            expect(refusal(() => mergeOpenApiDocuments(undefined, [extra('COPY'), extra('copy')])))
                .toBe('The OpenAPI path "COPY /notes" is contributed twice.');
            expect(refusal(() => mergeOpenApiDocuments(undefined, [{ paths: { '/notes': { additionalOperations: { COPY: OK, Copy: OK } } } }])))
                .toBe('The OpenAPI path "COPY /notes" is contributed twice.');
        });

        it('refuses a method already in chamvi\'s document', () => {
            const withCopy = { ...base(), paths: { '/runs': { get: OK, additionalOperations: { COPY: OK } } } };

            expect(refusal(() => mergeOpenApiDocuments(withCopy, [extra('COPY', '/runs')])))
                .toBe('The OpenAPI path "COPY /runs" is already in the document of @chamvi/http.');
        });

        it('refuses a method that has a fixed field, as OpenAPI 3.2 requires', () => {
            expect(refusal(() => mergeOpenApiDocuments(base(), [extra('POST')])))
                .toBe('The OpenAPI path "/notes" has "POST" in additionalOperations: use its fixed field "post".');
            expect(refusal(() => mergeOpenApiDocuments(undefined, [extra('Query')])))
                .toBe('The OpenAPI path "/notes" has "Query" in additionalOperations: use its fixed field "query".');
        });

        it('refuses additionalOperations that is no JSON object', () => {
            expect(refusal(() => mergeOpenApiDocuments(base(), [{ paths: { '/notes': { additionalOperations: [] } } }])))
                .toBe('The OpenAPI path "/notes" has "additionalOperations" that is no JSON object.');
        });

        it.each(['__proto__', 'constructor', 'prototype'])('refuses the method name %s without touching Object.prototype', (key) => {
            const json = `{"paths":{"/notes":{"additionalOperations":{"${key}":{"polluted":true}}}}}`;

            expect(refusal(() => mergeOpenApiDocuments(base(), [JSON.parse(json)])))
                .toBe(`The OpenAPI document at index 0 of openapi.documents uses the reserved name "${key}" as an additional operation.`);
            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        });
    });

    describe('with reserved keys', () => {
        const PROTOTYPE_KEYS = Object.getOwnPropertyNames(Object.prototype).toSorted();

        function assertUnpolluted(): void {
            const probe: Record<string, unknown> = {};

            expect(probe.polluted).toBeUndefined();
            expect(probe.x).toBeUndefined();
            expect(probe.get).toBeUndefined();
            expect((Object as unknown as Record<string, unknown>).polluted).toBeUndefined();
            expect(Object.getOwnPropertyNames(Object.prototype).toSorted()).toEqual(PROTOTYPE_KEYS);
            expect(Object.prototype.toString.call([])).toBe('[object Array]');
        }

        it.each([
            ['a path', '{"paths":{"__proto__":{"polluted":true,"get":{}}}}', '__proto__', 'a path'],
            ['a path constructor', '{"paths":{"constructor":{"polluted":true}}}', 'constructor', 'a path'],
            ['a path-item field', '{"paths":{"/notes":{"__proto__":{"polluted":true}}}}', '__proto__', 'a path-item field'],
            ['a component group', '{"components":{"__proto__":{"x":{"type":"string"}}}}', '__proto__', 'a component group'],
            ['a component group toString', '{"components":{"toString":{"x":{"type":"string"}}}}', 'toString', undefined],
            ['a component name', '{"components":{"schemas":{"__proto__":{"polluted":true}}}}', '__proto__', 'a component name'],
            ['a component name prototype', '{"components":{"schemas":{"prototype":{"type":"string"}}}}', 'prototype', 'a component name'],
        ])('refuses %s without touching Object.prototype, also without the base', (_name, json, key, where) => {
            for (const run of [
                () => mergeOpenApiDocuments(base(), [JSON.parse(json)]),
                () => mergeOpenApiDocuments(undefined, [JSON.parse(json)]),
            ]) {
                if (where === undefined) {
                    run();
                } else {
                    expect(refusal(run)).toBe(`The OpenAPI document at index 0 of openapi.documents uses the reserved name "${key}" as ${where}.`);
                }

                assertUnpolluted();
            }
        });

        it('keeps a component group named like an Object.prototype method as an ordinary name', () => {
            const merged = mergeOpenApiDocuments(base(), [JSON.parse('{"components":{"toString":{"x":{"type":"string"}}}}')])!;

            expect((merged.components as Record<string, unknown>).toString).toEqual({ x: { type: 'string' } });
            expect(Object.getPrototypeOf(merged.components)).toBe(Object.prototype);
        });

        it('compares definitions holding a __proto__ key by that key too', () => {
            const one = JSON.parse('{"components":{"schemas":{"Note":{"type":"object","__proto__":{"a":1}}}}}');
            const two = JSON.parse('{"components":{"schemas":{"Note":{"type":"object","__proto__":{"a":2}}}}}');

            expect(refusal(() => mergeOpenApiDocuments(undefined, [one, two])))
                .toBe('The OpenAPI component "schemas/Note" is contributed twice with different definitions.');
            assertUnpolluted();
        });

        it('refuses a reserved key through createHttpApp', () => {
            expect(() => createTestApp({ openapi: { documents: [JSON.parse('{"paths":{"__proto__":{"polluted":true}}}')] } }))
                .toThrow(InvalidAgentDefinitionError);
            assertUnpolluted();
        });
    });

    it('mutates neither a contributed document nor the base', () => {
        const documents = [notesGet(), notesDelete(), { paths: { '/runs': { patch: OK } } }];
        const before = structuredClone(documents);
        const original = base();
        const snapshot = structuredClone(original);

        mergeOpenApiDocuments(original, documents);
        mergeOpenApiDocuments(undefined, documents);

        expect(documents).toEqual(before);
        expect(original).toEqual(snapshot);
    });
});

describe('createHttpApp({ openapi: { documents } })', () => {
    const DOCUMENT_PATH = join(DIRECTORY, 'swagger.json');

    writeFileSync(DOCUMENT_PATH, JSON.stringify(base()));

    function setup(openapi: HttpAppOptions['openapi']) {
        const errors: unknown[] = [];
        const { app } = createTestApp({
            openapi,
            onError: (error) => {
                errors.push(error);
            },
        });

        return { app, errors };
    }

    it('serves the merged document', async () => {
        const { app, errors } = setup({ documentPath: DOCUMENT_PATH, documents: [notesGet()] });
        const response = await app.fetch(new Request('http://test/openapi.json'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(mergeOpenApiDocuments(base(), [notesGet()]));
        expect(errors).toEqual([]);
    });

    it('throws at construction on a collision with chamvi\'s document', () => {
        expect(() => setup({ documentPath: DOCUMENT_PATH, documents: [{ paths: { '/runs': { get: OK } } }] }))
            .toThrow('The OpenAPI path "GET /runs" is already in the document of @chamvi/http.');
    });

    it('ignores the documents with openapi: false', () => {
        expect(() => setup(false)).not.toThrow();
    });

    it('refuses documents that are no array', () => {
        expect(() => setup({ documentPath: DOCUMENT_PATH, documents: {} as object[] }))
            .toThrow('openapi.documents must be an array of OpenAPI documents.');
    });

    describe('with a missing base document', () => {
        const missing = join(DIRECTORY, 'missing.json');

        it('still throws at construction on two colliding contributed documents', () => {
            expect(() => setup({ documentPath: missing, documents: [notesGet(), notesGet()] }))
                .toThrow('The OpenAPI path "GET /notes" is contributed twice.');
        });

        it('only reports the missing base for a single valid one', async () => {
            const { app, errors } = setup({ documentPath: missing, documents: [notesGet()] });

            expect((await app.fetch(new Request('http://test/openapi.json'))).status).toBe(404);
            expect(errors).toHaveLength(1);
            expect((errors[0] as Error).message).toContain(missing);
        });
    });
});
