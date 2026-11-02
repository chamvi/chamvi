/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    RepositoryNotFoundError,
    ValidationError,
} from '@chamvi/core';
import { mockEmbeddingModel } from '@chamvi/test-kit';
import type { EmbeddingModel } from 'ai';
import { APICallError } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
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
    KNOWLEDGE_MANAGED_POLL_MS,
    MANAGED_CONTENT_MAX_CHARS,
    contentHash,
    createKnowledge,
    knowledgeCollection,
} from '@chamvi/knowledge';
import type { IndexerSetup } from '../../utils/indexer.ts';
import {
    createIndexerSetup,
    embeddingResolver,
    gatedModel,
    mapSource,
    waitForCollection,
} from '../../utils/indexer.ts';

const started: IKnowledge[] = [];

afterEach(async () => {
    await Promise.all(started.splice(0).map((knowledge) => knowledge.stop()));
});

function create(setup: IndexerSetup, extra: Partial<KnowledgeOptions> = {}): IKnowledge {
    const knowledge = createKnowledge(setup.options(extra));

    started.push(knowledge);

    return knowledge;
}

async function vectorOf(text: string): Promise<number[]> {
    const [vector] = (await mockEmbeddingModel().doEmbed({ values: [text] })).embeddings;

    return vector!;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
}

async function waitForDocument(setup: IndexerSetup, collection: string, id: string, status: string, hash?: string) {
    await vi.waitFor(async () => {
        const document = await setup.repository.findOneDocument(collection, id);

        expect(document).toMatchObject({ status, ...(hash === undefined ? {} : { hash }) });
    });

    return (await setup.repository.findOneDocument(collection, id))!;
}

/** An embedding model rejecting a text with "reject" (400), "busy" (429) or "boom" (500). */
function rejectingModel(): EmbeddingModel {
    const inner = mockEmbeddingModel();

    return new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: null,
        supportsParallelCalls: true,
        doEmbed: async (call) => {
            for (const [text, statusCode] of [['reject', 400], ['busy', 429], ['boom', 500]] as const) {
                const matched = call.values.some((value) => value.includes(text));

                if (matched) {
                    throw new APICallError({
                        message: `The provider refused the input (${statusCode}).`,
                        url: 'https://embeddings.test/v1',
                        requestBodyValues: {},
                        statusCode,
                    });
                }
            }

            return inner.doEmbed(call);
        },
    });
}

describe('managed collections', () => {
    it('createCollection makes an untrusted managed collection at the default model', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });
        const created = await knowledge.createCollection('notes');

        expect(created).toMatchObject({
            name: 'notes',
            kind: 'managed',
            trusted: false,
            generation: 1,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'ready',
        });
        expect(await setup.repository.findOneCollection('notes')).toEqual(created);
        expect(knowledge.view(created)).toEqual(created);
    });

    it('createCollection refuses a declared, orphaned or existing name, and without a default model', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, {
            embeddingModel: mockEmbeddingModel(),
            collections: [knowledgeCollection('docs', { model: mockEmbeddingModel(), sources: [mapSource(new Map())] })],
        });
        const at = setup.clock.now();

        await setup.repository.saveCollection({
            name: 'old',
            kind: 'declared',
            trusted: true,
            generation: 1,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'orphaned',
            createdAt: at,
            updatedAt: at,
        });
        await knowledge.createCollection('notes');

        await expect(knowledge.createCollection('docs')).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(knowledge.createCollection('old')).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(knowledge.createCollection('notes')).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(knowledge.createCollection('Not A Name')).rejects.toBeInstanceOf(ValidationError);

        const without = create(setup);

        await expect(without.createCollection('wiki')).rejects.toThrow(new InvalidRunStateError(
            'Managed collections need an embedding model: set CHAMVI_KNOWLEDGE_MODEL or knowledgeModule({ embeddingModel }).',
        ));
        expect(await setup.repository.findOneCollection('wiki')).toBeUndefined();
    });

    it('refuses an embeddingModel that does not resolve', () => {
        const setup = createIndexerSetup();

        expect(() => createKnowledge(setup.options({ embeddingModel: 'mock/a' }))).toThrow(InvalidAgentDefinitionError);
        expect(() => createKnowledge(setup.options({
            embeddingModel: 'mock/missing',
            models: embeddingResolver({}),
        }))).toThrow(InvalidAgentDefinitionError);
        expect(() => createKnowledge(setup.options({ embeddingModel: 42 as unknown as string }))).toThrow(InvalidAgentDefinitionError);
    });

    it('putDocument answers pending, then the background pass makes it ready and searchable', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });

        await knowledge.createCollection('notes');
        knowledge.start();

        const text = 'Our refund policy allows returns within thirty days.';

        expect(await knowledge.putDocument('notes', {
            id: 'refunds',
            content: text,
            title: 'Refunds',
            source: 'crm/refunds',
            metadata: { team: 'billing' },
        })).toEqual({ status: 'pending', changed: true });

        const document = await waitForDocument(setup, 'notes', 'refunds', 'ready');

        expect(document).toMatchObject({
            hash: contentHash(text),
            generation: 1,
            metadata: { team: 'billing' },
        });
        expect(document.error).toBeUndefined();

        const [match] = await setup.repository.search('notes', 1, await vectorOf('refund policy'), { topK: 1 });

        expect(match).toMatchObject({
            document: 'refunds',
            text,
            title: 'Refunds',
            source: 'crm/refunds',
        });
        expect(setup.errors).toEqual([]);
    });

    it('putDocument with unchanged content answers changed false and embeds nothing', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();

        const input = {
            id: 'refunds',
            content: 'Refunds within thirty days.',
            title: 'Refunds',
        };

        await knowledge.putDocument('notes', input);
        await waitForDocument(setup, 'notes', 'refunds', 'ready');

        const calls = model.calls.length;

        expect(await knowledge.putDocument('notes', input)).toEqual({ status: 'ready', changed: false });

        // new metadata only: stored, nothing to embed (chunks carry title and source only)
        expect(await knowledge.putDocument('notes', { ...input, metadata: { v: 2 } })).toEqual({ status: 'ready', changed: true });
        expect(await setup.repository.findOneDocument('notes', 'refunds')).toMatchObject({ status: 'ready', metadata: { v: 2 } });

        knowledge.sync('notes');
        await settle();

        expect(model.calls).toHaveLength(calls);
    });

    it('a PUT during the embedding of the previous content ends ready with the new content', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel();
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();

        const before = 'Kubernetes pods are scheduled onto nodes.';
        const after = 'Invoices are sent on the first day of each month.';

        await knowledge.putDocument('notes', { id: 'doc', content: before });
        await expect.poll(() => model.started.length).toBe(1);

        expect(await knowledge.putDocument('notes', { id: 'doc', content: after })).toEqual({ status: 'pending', changed: true });

        model.open(0);
        await settle();

        // the old content is never marked ready under the new hash
        expect(await setup.repository.findOneDocument('notes', 'doc')).toMatchObject({ status: 'pending', hash: contentHash(after) });

        model.open(1);

        await waitForDocument(setup, 'notes', 'doc', 'ready', contentHash(after));

        const matches = await setup.repository.search('notes', 1, await vectorOf(after), { topK: 10 });

        expect(matches.map((match) => match.text)).toEqual([after]);
        expect(setup.errors).toEqual([]);
    });

    it('a same-content PUT with a new title during the ready write leaves it pending and re-embeds the new title', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });
        const { repository } = setup;
        const replace = repository.replaceChunks.bind(repository);
        let put: unknown;

        await knowledge.createCollection('notes');

        // the PUT lands between the chunks of the old title and the ready write
        repository.replaceChunks = async (collection, document, generation, chunks) => {
            await replace(collection, document, generation, chunks);

            if (put === undefined && chunks.length > 0) {
                put = await knowledge.putDocument('notes', {
                    id: 'a', 
                    content: 'Alpha.', 
                    title: 'New title', 
                });
            }
        };

        knowledge.start();
        await knowledge.putDocument('notes', {
            id: 'a', 
            content: 'Alpha.', 
            title: 'Old title', 
        });

        await vi.waitFor(() => {
            expect(put).toEqual({ status: 'pending', changed: true });
        });

        // the next round embeds the new title; ready is never written for the old one
        await vi.waitFor(async () => {
            const matches = await repository.search('notes', 1, await vectorOf('Alpha.'), { topK: 10 });

            expect(matches.map((match) => match.title)).toEqual(['New title']);
        });
        expect(await waitForDocument(setup, 'notes', 'a', 'ready')).toMatchObject({ title: 'New title' });
        expect(setup.errors).toEqual([]);
    });

    it('a collection deleted during its pass stays deleted', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel();
        const knowledge = create(setup, { embeddingModel: model });
        // another replica deletes it: this instance's pass is not aborted
        const other = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });
        await expect.poll(() => model.started.length).toBe(1);

        expect(await other.deleteCollection('notes')).toBe(true);

        model.open(0);
        await settle();

        expect(await setup.repository.findOneCollection('notes')).toBeUndefined();
        expect(await setup.repository.findOneDocument('notes', 'doc')).toBeUndefined();
        expect(await setup.repository.search('notes', 1, await vectorOf('refunds'), { topK: 10 })).toEqual([]);
        expect(setup.errors).toEqual([]);

        // the poll stops this instance's loop: a sync() then finds none
        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);
        await settle();

        expect(() => knowledge.sync('notes')).toThrow(ValidationError);
        expect(await setup.repository.findOneCollection('notes')).toBeUndefined();
    });

    it('a collection deleted here stops its loop at once', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel();
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });
        await expect.poll(() => model.started.length).toBe(1);

        expect(await knowledge.deleteCollection('notes')).toBe(true);
        expect(() => knowledge.sync('notes')).toThrow(ValidationError);
        await settle();

        expect(await setup.repository.findOneCollection('notes')).toBeUndefined();
        expect(setup.errors).toEqual([]);
    });

    it('a collection deleted during its pass can be created again at once', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel();
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });
        await expect.poll(() => model.started.length).toBe(1);

        expect(await knowledge.deleteCollection('notes')).toBe(true);
        await expect(knowledge.createCollection('notes')).resolves.toMatchObject({ name: 'notes', kind: 'managed' });
        expect(setup.errors).toEqual([]);
    });

    it('a document the provider rejects with a 400 is failed with the error; a 500 fails the pass and the document stays pending', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: rejectingModel() });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'a', content: 'Please reject this text.' });
        await knowledge.putDocument('notes', { id: 'b', content: 'Refunds within thirty days.' });

        const failed = await waitForDocument(setup, 'notes', 'a', 'failed');

        expect(failed.error).toBe('The provider refused the input (400).');
        await waitForDocument(setup, 'notes', 'b', 'ready');
        expect(setup.errors).toEqual([]);

        await knowledge.putDocument('notes', { id: 'c', content: 'This one goes boom.' });

        await vi.waitFor(() => {
            expect(setup.errors).toHaveLength(1);
        });
        expect(setup.errors[0]).toMatchObject({ collection: 'notes' });
        expect(APICallError.isInstance(setup.errors[0]!.error)).toBe(true);
        expect(await setup.repository.findOneDocument('notes', 'c')).toMatchObject({ status: 'pending' });
        expect((await setup.repository.findOneDocument('notes', 'c'))?.error).toBeUndefined();

        // a later PUT of fixed content clears the failure
        await knowledge.putDocument('notes', { id: 'a', content: 'A fixed text.' });
        await knowledge.deleteDocument('notes', 'c');
        // the loop backs off before its next pass
        setup.clock.advance(5_000);

        const fixed = await waitForDocument(setup, 'notes', 'a', 'ready');

        expect(fixed.error).toBeUndefined();
    });

    it('a 429 is no verdict on the document: it stays pending and the pass backs off', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: rejectingModel() });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'a', content: 'The provider is busy.' });

        await vi.waitFor(() => {
            expect(setup.errors).toHaveLength(1);
        });
        expect(APICallError.isInstance(setup.errors[0]!.error)).toBe(true);

        const document = await setup.repository.findOneDocument('notes', 'a');

        expect(document).toMatchObject({ status: 'pending' });
        expect(document?.error).toBeUndefined();

        // a managed record stores no failure: the loop backs off on its own (KNOWLEDGE_RETRY_MS first)
        expect((await setup.repository.findOneCollection('notes'))?.error).toBeUndefined();
        setup.clock.advance(4_999);
        await settle();
        expect(setup.errors).toHaveLength(1);

        setup.clock.advance(1);
        await vi.waitFor(() => {
            expect(setup.errors).toHaveLength(2);
        });
        expect(await setup.repository.findOneDocument('notes', 'a')).toMatchObject({ status: 'pending' });
    });

    it('a changed default model reports stale, and sync() re-embeds into the next generation and serves it', async () => {
        const setup = createIndexerSetup();
        const models = { 'mock/a': mockEmbeddingModel(), 'mock/b': mockEmbeddingModel({ dimensions: 32 }) };
        const first = create(setup, { embeddingModel: 'mock/a', models: embeddingResolver(models) });

        await first.createCollection('notes');
        first.start();

        const text = 'Our refund policy allows returns within thirty days.';

        await first.putDocument('notes', { id: 'refunds', content: text });
        await waitForDocument(setup, 'notes', 'refunds', 'ready');
        await first.stop();

        const second = create(setup, { embeddingModel: 'mock/b', models: embeddingResolver(models) });
        const record = (await setup.repository.findOneCollection('notes'))!;

        expect(record).toMatchObject({ model: 'mock/a', status: 'ready' });
        expect(second.view(record)).toMatchObject({ model: 'mock/a', status: 'stale' });
        expect(first.view(record).status).toBe('ready');

        second.start();
        // the poll started its loop: nothing is re-embedded without a sync()
        await vi.waitFor(() => second.sync('notes'));

        const switched = await waitForCollection(setup.repository, 'notes', (collection) => collection.generation === 2);

        expect(switched).toMatchObject({
            model: 'mock/b',
            dimensions: 32,
            chunker: CHUNKER_VERSION,
            status: 'ready',
        });
        expect(switched.pending).toBeUndefined();
        expect(second.view(switched).status).toBe('ready');
        expect(await setup.repository.findOneDocument('notes', 'refunds')).toMatchObject({ status: 'ready', generation: 2 });

        const [vector] = (await models['mock/b'].doEmbed({ values: ['refund policy'] })).embeddings;

        expect(await setup.repository.search('notes', 2, vector!, { topK: 1 })).toMatchObject([{ document: 'refunds', text }]);
        expect(await setup.repository.search('notes', 1, await vectorOf('refund policy'), { topK: 1 })).toEqual([]);
        expect(setup.errors).toEqual([]);
    });

    it('a stale collection embeds pending documents at its served model until a sync()', async () => {
        const setup = createIndexerSetup();
        const models = { 'mock/a': mockEmbeddingModel(), 'mock/b': mockEmbeddingModel() };
        const first = create(setup, { embeddingModel: 'mock/a', models: embeddingResolver(models) });

        await first.createCollection('notes');
        await first.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });

        const second = create(setup, { embeddingModel: 'mock/b', models: embeddingResolver(models) });

        second.start();

        await waitForDocument(setup, 'notes', 'doc', 'ready');

        const record = (await setup.repository.findOneCollection('notes'))!;

        expect(record).toMatchObject({ model: 'mock/a', generation: 1 });
        expect(record.pending).toBeUndefined();
        expect(second.view(record).status).toBe('stale');
        expect(models['mock/a'].calls).toHaveLength(1);
        expect(models['mock/b'].calls).toHaveLength(0);
    });

    it('a stale collection whose served model is gone keeps its documents pending until a sync()', async () => {
        const setup = createIndexerSetup();
        const first = create(setup, { embeddingModel: mockEmbeddingModel() });

        await first.createCollection('notes');
        await first.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });

        const model = mockEmbeddingModel({ dimensions: 16 });
        const second = create(setup, { embeddingModel: Object.assign(model, { modelId: 'other' }) });

        second.start();
        await vi.waitFor(() => second.sync('notes'));

        await waitForCollection(setup.repository, 'notes', (collection) => collection.generation === 2);
        await waitForDocument(setup, 'notes', 'doc', 'ready');
        expect(await setup.repository.findOneCollection('notes')).toMatchObject({ model: 'mock-provider/other', dimensions: 16 });
        expect(setup.errors).toEqual([]);
    });

    it('a managed collection created by another instance is indexed here after the poll', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const knowledge = create(setup, { embeddingModel: model });
        const other = create(setup, { embeddingModel: model });

        knowledge.start();
        await settle();

        await other.createCollection('notes');
        await other.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });
        await settle();

        expect(await setup.repository.findOneDocument('notes', 'doc')).toMatchObject({ status: 'pending' });

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        await waitForDocument(setup, 'notes', 'doc', 'ready');
    });

    it('a collection deleted and created again while the poll reads the list keeps its new loop', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });
        const { repository } = setup;
        const find = repository.findCollections.bind(repository);
        let armed = false;
        let raced = false;

        await knowledge.createCollection('notes');

        repository.findCollections = async () => {
            const records = await find();

            // the next poll: its snapshot still holds the old record
            if (armed && !raced) {
                raced = true;
                await knowledge.deleteCollection('notes');
                await knowledge.createCollection('notes');
            }

            return records;
        };

        knowledge.start();
        await settle();
        armed = true;
        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);
        await vi.waitFor(() => {
            expect(raced).toBe(true);
        });
        await settle();

        // embedded by the new loop, without waiting for another poll
        await knowledge.putDocument('notes', { id: 'doc', content: 'Refunds within thirty days.' });
        await waitForDocument(setup, 'notes', 'doc', 'ready');
        expect(setup.errors).toEqual([]);
    });

    it('deleteCollection deletes a managed and an orphaned collection and refuses a declared one', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, {
            embeddingModel: mockEmbeddingModel(),
            collections: [knowledgeCollection('docs', { model: mockEmbeddingModel(), sources: [mapSource(new Map())] })],
        });
        const at = setup.clock.now();
        const declared = {
            kind: 'declared' as const,
            trusted: true,
            generation: 1,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            createdAt: at,
            updatedAt: at,
        };

        await setup.repository.saveCollection({
            ...declared, 
            name: 'old', 
            status: 'orphaned', 
        });
        await setup.repository.saveCollection({
            ...declared, 
            name: 'elsewhere', 
            status: 'ready', 
        });
        await setup.repository.saveCollection({
            ...declared, 
            name: 'docs', 
            status: 'ready', 
        });
        await knowledge.createCollection('notes');

        expect(await knowledge.deleteCollection('notes')).toBe(true);
        expect(await knowledge.deleteCollection('old')).toBe(true);
        expect(await knowledge.deleteCollection('missing')).toBe(false);
        await expect(knowledge.deleteCollection('docs')).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(knowledge.deleteCollection('elsewhere')).rejects.toBeInstanceOf(InvalidRunStateError);

        expect((await setup.repository.findCollections()).map((collection) => collection.name)).toEqual(['docs', 'elsewhere']);
    });

    it('putDocument and deleteDocument refuse a missing or unmanaged collection and invalid input', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });
        const at = setup.clock.now();

        await setup.repository.saveCollection({
            name: 'docs',
            kind: 'declared',
            trusted: true,
            generation: 1,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'ready',
            createdAt: at,
            updatedAt: at,
        });
        await knowledge.createCollection('notes');

        const valid = { id: 'doc', content: 'Refunds.' };

        await expect(knowledge.putDocument('missing', valid)).rejects.toBeInstanceOf(RepositoryNotFoundError);
        await expect(knowledge.putDocument('docs', valid)).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(knowledge.deleteDocument('missing', 'doc')).rejects.toBeInstanceOf(RepositoryNotFoundError);
        await expect(knowledge.deleteDocument('docs', 'doc')).rejects.toBeInstanceOf(InvalidRunStateError);

        for (const input of [
            { id: '', content: 'x' },
            { id: 'a\0b', content: 'x' },
            { id: 'x'.repeat(256), content: 'x' },
            { id: 'doc', content: '' },
            { id: 'doc', content: 'x'.repeat(MANAGED_CONTENT_MAX_CHARS + 1) },
            { id: 'doc', content: 42 },
            {
                id: 'doc',
                content: 'x',
                title: 1,
            },
            {
                id: 'doc',
                content: 'x',
                metadata: [],
            },
            null,
        ]) {
            await expect(knowledge.putDocument('notes', input as never)).rejects.toBeInstanceOf(ValidationError);
        }

        expect(await setup.repository.findDocuments('notes')).toEqual({ data: [], total: 0 });
        expect(await knowledge.putDocument('notes', valid)).toEqual({ status: 'pending', changed: true });
        expect(await knowledge.deleteDocument('notes', 'doc')).toBe(true);
        expect(await knowledge.deleteDocument('notes', 'doc')).toBe(false);
    });

    it('sync() wakes a managed loop and refuses a managed name without one', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });

        await knowledge.createCollection('notes');
        knowledge.start();

        await vi.waitFor(() => knowledge.sync('notes'));
        expect(() => knowledge.sync('wiki')).toThrow(ValidationError);
    });
});
