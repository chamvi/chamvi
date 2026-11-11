/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Engine, createMemoryStore } from '@chamvi/core';
import { createHttpApp, staticTokens } from '@chamvi/http';
import { mockEmbeddingModel } from '@chamvi/test-kit';
import type { App } from 'routup';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { IKnowledge, KnowledgeOptions } from '@chamvi/knowledge';
import {
    CHUNKER_VERSION,
    KNOWLEDGE_READ_PERMISSION,
    KNOWLEDGE_ROUTE_PATH,
    KNOWLEDGE_WRITE_PERMISSION,
    contentHash,
    createKnowledge,
    knowledgeCollection,
    knowledgeRoutes,
} from '@chamvi/knowledge';
import type { IndexerSetup } from '../../utils/indexer.ts';
import { createIndexerSetup, mapSource } from '../../utils/indexer.ts';

const WRITER = 'writer-token-0123456789';
const READER = 'reader-token-0123456789';
const NOBODY = 'nobody-token-0123456789';

const started: IKnowledge[] = [];

afterEach(async () => {
    await Promise.all(started.splice(0).map((knowledge) => knowledge.stop()));
});

type Fixture = {
    app: App;
    setup: IndexerSetup;
    knowledge: IKnowledge;
    send(method: string, path: string, options?: {
        token?: string | null;
        body?: unknown;
        raw?: string | Uint8Array<ArrayBuffer>;
    }): Promise<Response>;
};

function createFixture(extra: Partial<KnowledgeOptions> = {}): Fixture {
    const setup = createIndexerSetup();
    const knowledge = createKnowledge(setup.options({
        embeddingModel: mockEmbeddingModel(),
        collections: [knowledgeCollection('docs', { model: mockEmbeddingModel(), sources: [mapSource(new Map([['a', 'Alpha text.']]))] })],
        ...extra,
    }));

    started.push(knowledge);

    const engine = new Engine({
        store: createMemoryStore({ clock: setup.clock }),
        agents: [],
        clock: setup.clock,
    });
    const app = createHttpApp({
        engine,
        auth: staticTokens({
            tokens: [
                {
                    value: WRITER,
                    id: 'writer',
                    permissions: [{ permission: { name: KNOWLEDGE_READ_PERMISSION } }, { permission: { name: KNOWLEDGE_WRITE_PERMISSION } }],
                },
                {
                    value: READER,
                    id: 'reader',
                    permissions: [{ permission: { name: KNOWLEDGE_READ_PERMISSION } }],
                },
                {
                    value: NOBODY,
                    id: 'nobody',
                    permissions: [],
                },
            ],
        }),
        rateLimit: false,
        routes: knowledgeRoutes(knowledge),
    });

    return {
        app,
        setup,
        knowledge,
        send: (method, path, options = {}) => {
            const headers = new Headers();
            const token = options.token === undefined ? WRITER : options.token;

            if (token !== null) {
                headers.set('authorization', `Bearer ${token}`);
            }

            let body: string | Uint8Array<ArrayBuffer> | undefined;

            if (options.raw !== undefined || options.body !== undefined) {
                headers.set('content-type', 'application/json');
                body = options.raw ?? JSON.stringify(options.body);
            }

            return app.fetch(new Request(`http://test${path}`, {
                method,
                headers,
                body,
            }));
        },
    };
}

async function saveDeclared(setup: IndexerSetup, name: string): Promise<void> {
    const at = setup.clock.now();

    await setup.repository.saveCollection({
        name,
        kind: 'declared',
        trusted: true,
        generation: 1,
        model: 'mock-provider/mock-model-id',
        chunker: CHUNKER_VERSION,
        status: 'ready',
        createdAt: at,
        updatedAt: at,
    });
}

const base = `${KNOWLEDGE_ROUTE_PATH}/collections`;

describe('knowledgeRoutes', () => {
    it('serves under /knowledge with the two permissions', () => {
        expect(KNOWLEDGE_ROUTE_PATH).toBe('/knowledge');
        expect(KNOWLEDGE_READ_PERMISSION).toBe('knowledge:read');
        expect(KNOWLEDGE_WRITE_PERMISSION).toBe('knowledge:write');
    });

    it('answers 401 without a token and 403 with knowledge:read on a write', async () => {
        const { send } = createFixture();

        const anonymous = await send('GET', base, { token: null });

        expect(anonymous.status).toBe(401);
        expect(anonymous.headers.get('www-authenticate')).toMatch(/^Bearer/);
        expect((await send('GET', base, { token: NOBODY })).status).toBe(403);
        expect((await send('POST', base, { token: READER, body: { name: 'notes' } })).status).toBe(403);
        expect((await send('PUT', `${base}/notes/documents/a`, { token: READER, body: { content: 'x' } })).status).toBe(403);
        expect((await send('DELETE', `${base}/notes`, { token: READER })).status).toBe(403);
        expect((await send('GET', base, { token: READER })).status).toBe(200);
    });

    it('GET /knowledge/collections lists the collection views', async () => {
        const { send, setup } = createFixture();

        await saveDeclared(setup, 'docs');
        await send('POST', base, { body: { name: 'notes' } });

        const response = await send('GET', base);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            data: [
                {
                    name: 'docs',
                    kind: 'declared',
                    trusted: true,
                    status: 'ready',
                    model: 'mock-provider/mock-model-id',
                    generation: 1,
                    updatedAt: setup.clock.now().toISOString(),
                },
                {
                    name: 'notes',
                    kind: 'managed',
                    trusted: false,
                    status: 'ready',
                    model: 'mock-provider/mock-model-id',
                    generation: 1,
                    updatedAt: setup.clock.now().toISOString(),
                },
            ],
        });
    });

    it('POST /knowledge/collections creates a managed collection (201), refusing a bad name (400) and a taken one (409)', async () => {
        const { send } = createFixture();

        const created = await send('POST', base, { body: { name: 'notes' } });

        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({
            name: 'notes',
            kind: 'managed',
            trusted: false,
            status: 'ready',
        });
        expect((await send('POST', base, { body: { name: 'Bad Name' } })).status).toBe(400);
        expect((await send('POST', base, { body: {} })).status).toBe(400);
        expect((await send('POST', base, { body: { name: 'notes' } })).status).toBe(409);
        expect((await send('POST', base, { body: { name: 'docs' } })).status).toBe(409);
    });

    it('POST /knowledge/collections answers 409 without a default embedding model', async () => {
        const { send } = createFixture({ embeddingModel: undefined });
        const response = await send('POST', base, { body: { name: 'notes' } });

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'invalid_run_state' });
    });

    it('GET /knowledge/collections/:c answers the view, or 404', async () => {
        const { send } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        const response = await send('GET', `${base}/notes`);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ name: 'notes', kind: 'managed' });
        expect((await send('GET', `${base}/missing`)).status).toBe(404);
    });

    it('GET of a managed collection at another model reports it stale', async () => {
        const { send, setup } = createFixture();
        const at = setup.clock.now();

        await setup.repository.saveCollection({
            name: 'notes',
            kind: 'managed',
            trusted: false,
            generation: 1,
            model: 'other/model',
            chunker: CHUNKER_VERSION,
            status: 'ready',
            syncedAt: at,
            createdAt: at,
            updatedAt: at,
        });

        expect(await (await send('GET', `${base}/notes`)).json()).toMatchObject({
            status: 'stale',
            model: 'other/model',
            syncedAt: at.toISOString(),
        });
    });

    it('DELETE /knowledge/collections/:c answers 204, 404 or 409 for a declared one', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        const deleted = await send('DELETE', `${base}/notes`);

        expect(deleted.status).toBe(204);
        expect(await deleted.text()).toBe('');
        expect(await setup.repository.findOneCollection('notes')).toBeUndefined();
        expect((await send('DELETE', `${base}/notes`)).status).toBe(404);
        expect((await send('DELETE', `${base}/docs`)).status).toBe(409);
    });

    it('POST /knowledge/collections/:c/sync answers 202, 404 when not indexed here, 409 before start', async () => {
        const { send, knowledge } = createFixture();

        expect((await send('POST', `${base}/docs/sync`)).status).toBe(409);

        knowledge.start();

        const response = await send('POST', `${base}/docs/sync`);

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ name: 'docs' });
        expect((await send('POST', `${base}/missing/sync`)).status).toBe(404);
    });

    it('PUT /knowledge/collections/:c/documents/:id answers 202 pending, then 200 when unchanged', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        const put = await send('PUT', `${base}/notes/documents/a`, {
            body: {
                content: 'Alpha text.',
                title: 'Alpha',
                source: 'https://example.test/a',
                metadata: { lang: 'en' },
            },
        });

        expect(put.status).toBe(202);
        expect(await put.json()).toEqual({ status: 'pending' });
        expect(await setup.repository.findOneDocument('notes', 'a')).toMatchObject({
            content: 'Alpha text.',
            title: 'Alpha',
            source: 'https://example.test/a',
            metadata: { lang: 'en' },
            status: 'pending',
        });

        const again = await send('PUT', `${base}/notes/documents/a`, {
            body: {
                content: 'Alpha text.',
                title: 'Alpha',
                source: 'https://example.test/a',
                metadata: { lang: 'en' },
            },
        });

        expect(again.status).toBe(200);
        expect(await again.json()).toEqual({ status: 'pending' });
    });

    it('PUT answers 400 for invalid input, 404 for a missing and 409 for a declared collection', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });
        await saveDeclared(setup, 'other');

        expect((await send('PUT', `${base}/notes/documents/a`, { body: { content: '' } })).status).toBe(400);
        expect((await send('PUT', `${base}/notes/documents/a`, { body: { content: 1 } })).status).toBe(400);
        expect((await send('PUT', `${base}/notes/documents/a`, { body: { content: 'x', title: 2 } })).status).toBe(400);
        expect((await send('PUT', `${base}/missing/documents/a`, { body: { content: 'x' } })).status).toBe(404);
        expect((await send('PUT', `${base}/other/documents/a`, { body: { content: 'x' } })).status).toBe(409);
    });

    it('refuses a body that is no JSON object', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        for (const raw of ['[]', '"text"', 'null', '{"content":', '']) {
            const response = await send('PUT', `${base}/notes/documents/a`, { raw });

            expect(response.status).toBe(400);
        }

        expect((await send('POST', base, { raw: '[1]' })).status).toBe(400);

        // invalid UTF-8 inside a JSON string is refused, never stored as U+FFFD
        const invalid = new Uint8Array([...new TextEncoder().encode('{"content":"a'), 0xFF, ...new TextEncoder().encode('b"}')]);
        const response = await send('PUT', `${base}/notes/documents/a`, { raw: invalid });

        expect(response.status).toBe(400);
        expect(await setup.repository.findOneDocument('notes', 'a')).toBeUndefined();
    });

    it('GET /knowledge/collections/:c/documents/:id answers the view with content, or 404', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });
        await send('PUT', `${base}/notes/documents/a`, { body: { content: 'Alpha text.', title: 'Alpha' } });

        const response = await send('GET', `${base}/notes/documents/a`, { token: READER });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: 'a',
            title: 'Alpha',
            status: 'pending',
            hash: contentHash('Alpha text.'),
            content: 'Alpha text.',
            updatedAt: setup.clock.now().toISOString(),
        });
        expect((await send('GET', `${base}/notes/documents/b`)).status).toBe(404);
        expect((await send('GET', `${base}/missing/documents/a`)).status).toBe(404);
    });

    it('DELETE /knowledge/collections/:c/documents/:id answers 204, 404 or 409 when not managed', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });
        await saveDeclared(setup, 'other');
        await send('PUT', `${base}/notes/documents/a`, { body: { content: 'Alpha text.' } });

        expect((await send('DELETE', `${base}/notes/documents/a`)).status).toBe(204);
        expect(await setup.repository.findOneDocument('notes', 'a')).toBeUndefined();
        expect((await send('DELETE', `${base}/notes/documents/a`)).status).toBe(404);
        expect((await send('DELETE', `${base}/missing/documents/a`)).status).toBe(404);
        expect((await send('DELETE', `${base}/other/documents/a`)).status).toBe(409);
    });

    it('GET /knowledge/collections/:c/documents pages documents and filters by status', async () => {
        const { send, setup } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        for (const id of ['c', 'a', 'b', 'd']) {
            await send('PUT', `${base}/notes/documents/${id}`, { body: { content: `Text ${id}.`, metadata: { id } } });
        }

        await setup.repository.updateDocument('notes', 'b', { hash: contentHash('Text b.') }, { status: 'ready', generation: 1 });

        const first = await send('GET', `${base}/notes/documents?page[limit]=2&page[offset]=1`);

        expect(first.status).toBe(200);

        const page = await first.json() as { data: Array<Record<string, unknown>>; meta: unknown };

        expect(page.meta).toEqual({
            total: 4, 
            limit: 2, 
            offset: 1, 
        });
        expect(page.data.map((document) => document.id)).toEqual(['b', 'c']);
        expect(page.data[0]).toEqual({
            id: 'b',
            metadata: { id: 'b' },
            status: 'ready',
            hash: contentHash('Text b.'),
            updatedAt: setup.clock.now().toISOString(),
        });

        const pending = await (await send('GET', `${base}/notes/documents?filter[status]=pending`)).json() as {
            data: Array<{ id: string }>;
            meta: unknown
        };

        expect(pending.meta).toEqual({
            total: 3, 
            limit: 50, 
            offset: 0, 
        });
        expect(pending.data.map((document) => document.id)).toEqual(['a', 'c', 'd']);

        for (const query of ['page[limit]=0', 'page[limit]=101', 'page[limit]=x', 'page[offset]=-1', 'page[offset]=1.5', 'filter[status]=done']) {
            expect((await send('GET', `${base}/notes/documents?${query}`)).status).toBe(400);
        }

        expect((await send('GET', `${base}/missing/documents`)).status).toBe(404);
    });

    it('round-trips an id with "/", a space and "ü" through the encoded segment', async () => {
        const { send, setup } = createFixture();
        const id = 'guides/getting started/über';
        const path = `${base}/notes/documents/${encodeURIComponent(id)}`;

        await send('POST', base, { body: { name: 'notes' } });

        expect((await send('PUT', path, { body: { content: 'Hello.' } })).status).toBe(202);
        expect(await setup.repository.findDocumentIds('notes')).toEqual([id]);
        expect(await (await send('GET', path)).json()).toMatchObject({ id, content: 'Hello.' });

        const list = await (await send('GET', `${base}/notes/documents`)).json() as { data: Array<{ id: string }> };

        expect(list.data.map((document) => document.id)).toEqual([id]);
        expect((await send('DELETE', path)).status).toBe(204);
        expect(await setup.repository.findDocumentIds('notes')).toEqual([]);
    });

    it('refuses an id over 255 characters, an empty one and one with %00', async () => {
        const { send } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        for (const segment of ['a'.repeat(256), '', 'a%00b']) {
            for (const method of ['GET', 'PUT', 'DELETE']) {
                const response = await send(method, `${base}/notes/documents/${segment}`, method === 'PUT' ? { body: { content: 'x' } } : {});

                expect(response.status).toBe(400);
            }
        }

        expect((await send('PUT', `${base}/notes/documents/${'a'.repeat(255)}`, { body: { content: 'x' } })).status).toBe(202);
    });

    it('answers 400 for a segment that does not decode and 404 for any other path', async () => {
        const { send } = createFixture();

        await send('POST', base, { body: { name: 'notes' } });

        expect((await send('GET', `${base}/notes/documents/%E0%A4%A`)).status).toBe(400);

        for (const [method, path] of [
            ['GET', KNOWLEDGE_ROUTE_PATH],
            ['GET', `${KNOWLEDGE_ROUTE_PATH}/other`],
            ['GET', `${base}/notes/other`],
            ['GET', `${base}/notes/documents/a/b`],
            ['POST', `${base}/notes`],
            ['POST', `${base}/notes/documents`],
            ['PUT', `${base}/notes`],
            ['DELETE', base],
        ] as const) {
            expect((await send(method, path, method === 'POST' || method === 'PUT' ? { body: {} } : {})).status).toBe(404);
        }
    });

    it('a PUT makes the document searchable once the background pass ran', async () => {
        const {
            send, 
            setup, 
            knowledge, 
        } = createFixture();

        knowledge.start();
        await send('POST', base, { body: { name: 'notes' } });
        await send('PUT', `${base}/notes/documents/a`, { body: { content: 'Alpha text.' } });

        await vi.waitFor(async () => {
            expect(await setup.repository.findOneDocument('notes', 'a')).toMatchObject({ status: 'ready' });
        });

        expect(await (await send('GET', `${base}/notes/documents/a`)).json()).toMatchObject({ status: 'ready' });
    });
});
