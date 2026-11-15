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
