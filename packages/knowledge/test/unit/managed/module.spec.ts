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
import type { IKnowledge, KnowledgeCollection, KnowledgeOptions } from '@chamvi/knowledge';
import {
    CHUNKER_VERSION,
    KNOWLEDGE_LOCK_TTL_MS,
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
    const knowledge = setup.adopt(createKnowledge(setup.options(extra)));

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

/** An embedding model rejecting a text with "reject" (400), "busy" (429), "denied" (401), "forbidden" (403) or "boom" (500). */
function rejectingModel(): EmbeddingModel {
    const inner = mockEmbeddingModel();

    return new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: null,
        supportsParallelCalls: true,
        doEmbed: async (call) => {
            for (const [text, statusCode] of [['reject', 400], ['busy', 429], ['denied', 401], ['forbidden', 403], ['boom', 500]] as const) {
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
        const at = new Date(setup.clock.now());

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

    it('a same-content PUT with a new title during the ready write leaves it pending, then ready under the new title', async () => {
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

        // the chunks are written again under the new title; ready is never written for the old one
        await vi.waitFor(async () => {
            const matches = await repository.search('notes', 1, await vectorOf('Alpha.'), { topK: 10 });

            expect(matches.map((match) => match.title)).toEqual(['New title']);
        });
        expect(await waitForDocument(setup, 'notes', 'a', 'ready')).toMatchObject({ title: 'New title' });
        expect(setup.errors).toEqual([]);
    });

    it('a PUT with unchanged content and a new title embeds nothing and search shows the new title', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();

        const input = {
            id: 'refunds',
            content: 'Refunds within thirty days.',
            title: 'Refunds',
            source: 'crm/refunds',
        };

        await knowledge.putDocument('notes', input);
        await waitForDocument(setup, 'notes', 'refunds', 'ready');

        const calls = model.calls.length;

        expect(await knowledge.putDocument('notes', {
            id: input.id,
            content: input.content,
            title: 'Returns',
            metadata: { v: 2 },
        })).toEqual({ status: 'ready', changed: true });

        const document = (await setup.repository.findOneDocument('notes', 'refunds'))!;

        expect(document).toMatchObject({
            status: 'ready',
            generation: 1,
            title: 'Returns',
            metadata: { v: 2 },
        });
        expect(document.source).toBeUndefined();

        knowledge.sync('notes');
        await settle();

        expect(model.calls).toHaveLength(calls);

        const [match] = await setup.repository.search('notes', 1, await vectorOf(input.content), { topK: 1 });

        expect(match).toMatchObject({ document: 'refunds', title: 'Returns' });
        expect(match!.source).toBeUndefined();
        expect(setup.errors).toEqual([]);
    });

    describe('two details PUTs racing on a ready document', () => {
        const content = 'Refunds within thirty days.';

        /** A ready document titled "A" with metadata, the knowledge, and a check that the document and its chunks agree. */
        const ready = async () => {
            const setup = createIndexerSetup();
            const model = mockEmbeddingModel();
            const knowledge = create(setup, { embeddingModel: model });

            await knowledge.createCollection('notes');
            knowledge.start();
            await knowledge.putDocument('notes', {
                id: 'doc',
                content,
                title: 'A',
                metadata: { v: 1 },
            });
            await waitForDocument(setup, 'notes', 'doc', 'ready');

            const stored = async () => {
                const document = (await setup.repository.findOneDocument('notes', 'doc'))!;
                const matches = await setup.repository.search('notes', 1, await vectorOf(content), { topK: 10 });

                return { document, titles: matches.map((match) => match.title) };
            };

            return {
                setup,
                model,
                knowledge,
                stored,
            };
        };

        it('a PUT landing between another PUT\'s details and its metadata write leaves the document and its chunks agreeing', async () => {
            const {
                setup,
                model,
                knowledge,
                stored,
            } = await ready();
            const calls = model.calls.length;
            const { repository } = setup;
            const update = repository.updateDetails.bind(repository);
            let raced = false;

            // the other PUT runs right after this PUT's details write
            repository.updateDetails = async (...args) => {
                const result = await update(...args);

                if (!raced) {
                    raced = true;
                    await knowledge.putDocument('notes', {
                        id: 'doc',
                        content,
                        title: 'C',
                    });
                }

                return result;
            };

            expect(await knowledge.putDocument('notes', {
                id: 'doc',
                content,
                title: 'B',
                metadata: { v: 2 },
            })).toEqual({ status: 'ready', changed: true });

            const { document, titles } = await stored();

            expect(raced).toBe(true);
            // the later PUT wins, with its (absent) metadata, and the chunks carry its title
            expect(document).toMatchObject({ status: 'ready', title: 'C' });
            expect(document.metadata).toBeUndefined();
            expect(titles).toEqual(['C']);
            expect(model.calls).toHaveLength(calls);
            expect(setup.errors).toEqual([]);
        });

        it('a PUT whose read was overtaken by another PUT writes its details over the current version', async () => {
            const {
                setup,
                model,
                knowledge,
                stored,
            } = await ready();
            const calls = model.calls.length;
            const { repository } = setup;
            const update = repository.updateDetails.bind(repository);
            let raced = false;

            // the other PUT lands between this PUT's read and its details write
            repository.updateDetails = async (...args) => {
                if (!raced) {
                    raced = true;
                    await knowledge.putDocument('notes', {
                        id: 'doc', 
                        content, 
                        title: 'C', 
                    });
                }

                return update(...args);
            };

            expect(await knowledge.putDocument('notes', {
                id: 'doc',
                content,
                title: 'B',
                metadata: { v: 2 },
            })).toEqual({ status: 'ready', changed: true });

            expect(raced).toBe(true);

            const { document, titles } = await stored();

            expect(document).toMatchObject({
                status: 'ready',
                title: 'B',
                metadata: { v: 2 },
            });
            expect(titles).toEqual(['B']);
            expect(model.calls).toHaveLength(calls);
            expect(setup.errors).toEqual([]);
        });
    });

    it('a metadata PUT on a pending document keeps the served chunks\' details until the new content is embedded', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel({ opened: 1 });
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();

        const before = 'Kubernetes pods are scheduled onto nodes.';
        const after = 'Invoices are sent on the first day of each month.';

        await knowledge.putDocument('notes', {
            id: 'doc', 
            content: before, 
            title: 'A', 
        });
        await waitForDocument(setup, 'notes', 'doc', 'ready');

        // the new content waits for its embed; the old chunks keep serving under the old title
        await knowledge.putDocument('notes', {
            id: 'doc', 
            content: after, 
            title: 'B', 
        });
        await expect.poll(() => model.started.length).toBe(2);

        expect(await knowledge.putDocument('notes', {
            id: 'doc',
            content: after,
            title: 'B',
            metadata: { v: 2 },
        })).toEqual({ status: 'pending', changed: true });
        expect(await setup.repository.findOneDocument('notes', 'doc')).toMatchObject({
            status: 'pending',
            title: 'B',
            metadata: { v: 2 },
        });

        const served = await setup.repository.search('notes', 1, await vectorOf(before), { topK: 10 });

        // never the old text next to the new title
        expect(served.map((match) => [match.text, match.title])).toEqual([[before, 'A']]);

        model.open(1);

        const ready = await waitForDocument(setup, 'notes', 'doc', 'ready', contentHash(after));

        expect(ready).toMatchObject({ title: 'B', metadata: { v: 2 } });

        const matches = await setup.repository.search('notes', 1, await vectorOf(after), { topK: 10 });

        expect(matches.map((match) => [match.text, match.title])).toEqual([[after, 'B']]);
        expect(setup.errors).toEqual([]);
    });

    it('a PUT with a new title during an embed never leaves old details ready under the new version', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel();
        const knowledge = create(setup, { embeddingModel: model });

        await knowledge.createCollection('notes');
        knowledge.start();

        const content = 'Kubernetes pods are scheduled onto nodes.';

        await knowledge.putDocument('notes', {
            id: 'doc',
            content,
            title: 'Old title',
        });
        await expect.poll(() => model.started.length).toBe(1);

        // the embed is in flight: the document is pending, so the PUT takes the pending path
        expect(await knowledge.putDocument('notes', {
            id: 'doc',
            content,
            title: 'New title',
        })).toEqual({ status: 'pending', changed: true });

        model.open(0);
        model.open(1);

        const document = await waitForDocument(setup, 'notes', 'doc', 'ready');

        expect(document.title).toBe('New title');

        const matches = await setup.repository.search('notes', 1, await vectorOf(content), { topK: 10 });

        expect(matches.map((match) => match.title)).toEqual(['New title']);
        // same content: the vectors hold, only the details changed
        expect(model.started).toHaveLength(1);
        expect(setup.errors).toEqual([]);
    });

    it('a PUT with a new title during a re-embed keeps the document searchable under the new title', async () => {
        const setup = createIndexerSetup();
        const next = gatedModel();
        const models = { 'mock/a': mockEmbeddingModel(), 'mock/b': next };
        const first = create(setup, { embeddingModel: 'mock/a', models: embeddingResolver(models) });

        await first.createCollection('notes');
        first.start();

        const content = 'Our refund policy allows returns within thirty days.';

        await first.putDocument('notes', {
            id: 'refunds',
            content,
            title: 'Refunds',
        });
        await waitForDocument(setup, 'notes', 'refunds', 'ready');
        await first.stop();

        const second = create(setup, { embeddingModel: 'mock/b', models: embeddingResolver(models) });

        second.start();
        await vi.waitFor(() => second.sync('notes'));
        await expect.poll(() => next.started.length).toBe(1);

        // the document is ready at the served generation while the re-embed embeds it
        expect(await second.putDocument('notes', {
            id: 'refunds',
            content,
            title: 'Returns',
        })).toEqual({ status: 'ready', changed: true });

        next.open(0);
        next.open(1);
        await waitForCollection(setup.repository, 'notes', (collection) => collection.generation === 2);

        expect(await setup.repository.findOneDocument('notes', 'refunds')).toMatchObject({
            status: 'ready',
            generation: 2,
            title: 'Returns',
        });

        const [vector] = (await mockEmbeddingModel().doEmbed({ values: [content] })).embeddings;

        expect(await setup.repository.search('notes', 2, vector!, { topK: 10 })).toMatchObject([{ document: 'refunds', title: 'Returns' }]);
        expect(next.started).toHaveLength(1);
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

    it('a pass whose fence another owner advanced writes nothing more and reports nothing', async () => {
        const setup = createIndexerSetup();
        const content = 'Refunds within thirty days.';
        // the same model identity as the mock, other vectors: its chunks score apart from the mock's
        const turned = new MockEmbeddingModelV4({
            maxEmbeddingsPerCall: null,
            supportsParallelCalls: true,
            doEmbed: async ({ values }) => ({
                embeddings: values.map(() => Array.from({ length: 64 }, (_, i) => (i === 0 ? 1 : 0))),
                warnings: [],
            }),
        });
        const knowledge = create(setup, { embeddingModel: turned });
        const { service } = knowledge;
        const replace = service.replaceChunks.bind(service);
        const gate = Promise.withResolvers<void>();
        // the first write after the renew waits, as a store slower than the lease would
        const held = vi.spyOn(service, 'replaceChunks').mockImplementationOnce(async (...args) => {
            await gate.promise;

            return replace(...args);
        });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'doc', content });
        await expect.poll(() => held.mock.calls.length).toBe(1);

        // the lease expires while the write waits: a second instance takes it and embeds the document
        setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);

        const other = create(setup, { embeddingModel: mockEmbeddingModel() });

        other.start();
        await waitForDocument(setup, 'notes', 'doc', 'ready');

        gate.resolve();

        await expect.poll(() => held.mock.settledResults[0]?.type).toBe('rejected');
        await settle();

        expect(held.mock.settledResults[0]).toMatchObject({ type: 'rejected', value: { code: 'lease_lost', lock: 'knowledge:notes' } });

        const matches = await setup.repository.search('notes', 1, await vectorOf(content), { topK: 10 });

        expect(matches).toHaveLength(1);
        expect(matches[0]!.score).toBeCloseTo(1);
        expect(await setup.repository.findOneDocument('notes', 'doc')).toMatchObject({ status: 'ready', generation: 1 });
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose record appeared after the fence was advanced writes with a fence', async () => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: mockEmbeddingModel() });
        const { service } = knowledge;
        const advance = service.advanceFence.bind(service);
        const save = service.saveCollection.bind(service);
        const replace = vi.spyOn(service, 'replaceChunks');

        await knowledge.createCollection('notes');

        const record = (await service.findOneCollection('notes'))!;

        // deleted and created again between the loop's advance (no row then) and the pass's own read
        vi.spyOn(service, 'advanceFence').mockImplementationOnce(async (name) => {
            await service.deleteCollection(name);

            const fence = await advance(name);

            await save(record);
            await service.saveDocument({
                collection: name,
                id: 'doc',
                content: 'Refunds within thirty days.',
                hash: contentHash('Refunds within thirty days.'),
                status: 'pending',
                generation: 0,
                updatedAt: new Date(setup.clock.now()),
            });

            return fence;
        });

        knowledge.start();

        await waitForDocument(setup, 'notes', 'doc', 'ready');

        expect(replace.mock.calls).toHaveLength(1);
        expect(replace.mock.calls[0]![4]?.fence).toBeDefined();
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
        // the same content again is embedded again (the provider may accept it now)
        expect(await knowledge.putDocument('notes', { id: 'a', content: 'Please reject this text.' })).toEqual({ status: 'pending', changed: true });
        await waitForDocument(setup, 'notes', 'a', 'failed');
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

    it.each([
        ['a 429', 'The provider is busy.'],
        ['a 401', 'Access denied for this key.'],
        ['a 403', 'The key is forbidden here.'],
    ])('%s is no verdict on the document: it stays pending and the pass backs off', async (_, content) => {
        const setup = createIndexerSetup();
        const knowledge = create(setup, { embeddingModel: rejectingModel() });

        await knowledge.createCollection('notes');
        knowledge.start();
        await knowledge.putDocument('notes', { id: 'a', content });

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

        const saves: KnowledgeCollection[] = [];
        const save = setup.repository.saveCollection.bind(setup.repository);

        vi.spyOn(setup.repository, 'saveCollection').mockImplementation(async (collection) => {
            saves.push(structuredClone(collection));

            return save(collection);
        });
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
        // the learned length was stored on the pending re-embed before the switch
        expect(saves.some((saved) => saved.pending?.generation === 2 && saved.pending.dimensions === 32)).toBe(true);
        expect(second.view(switched).status).toBe('ready');
        expect(await setup.repository.findOneDocument('notes', 'refunds')).toMatchObject({ status: 'ready', generation: 2 });

        const [vector] = (await models['mock/b'].doEmbed({ values: ['refund policy'] })).embeddings;

        expect(await setup.repository.search('notes', 2, vector!, { topK: 1 })).toMatchObject([{ document: 'refunds', text }]);
        expect(await setup.repository.search('notes', 1, await vectorOf('refund policy'), { topK: 1 })).toEqual([]);
        expect(setup.errors).toEqual([]);
    });

    describe('a re-embed the default model left', () => {
        const after = 'Invoices are sent on the first day of each month.';

        /**
         * Documents a, b and c ready at generation 1 (mock/a); a re-embed with
         * mock/b made "a" and the new content of "b" (PUT during the re-embed)
         * ready at generation 2, then stopped before "c" (the default changes).
         */
        async function leaveReembed(setup: IndexerSetup) {
            const next = gatedModel();
            const models: Record<string, EmbeddingModel> = { 'mock/a': mockEmbeddingModel(), 'mock/b': next };
            const first = create(setup, { embeddingModel: 'mock/a', models: embeddingResolver(models) });

            await first.createCollection('notes');
            first.start();
            await first.putDocument('notes', { id: 'a', content: 'Refunds within thirty days.' });
            await first.putDocument('notes', { id: 'b', content: 'Kubernetes pods are scheduled onto nodes.' });
            await first.putDocument('notes', { id: 'c', content: 'Support answers within a day.' });
            await waitForDocument(setup, 'notes', 'c', 'ready');
            await first.stop();

            const second = create(setup, { embeddingModel: 'mock/b', models: embeddingResolver(models) });

            second.start();
            await vi.waitFor(() => second.sync('notes'));
            await expect.poll(() => next.started.length).toBe(1);

            // PUT while the re-embed embeds "a": the re-embed reaches "b" later and makes the new content ready at its generation
            await second.putDocument('notes', { id: 'b', content: after });

            next.open(0);
            next.open(1);
            await waitForDocument(setup, 'notes', 'b', 'ready', contentHash(after));
            await expect.poll(() => next.started.length).toBe(3);

            expect(await setup.repository.findOneDocument('notes', 'b')).toMatchObject({ generation: 2 });

            // "c" is never embedded with mock/b
            await second.stop();

            return { models, next };
        }

        /** The re-embed abandoned: every document ready at generation 1 (mock/a), "b" with its new content, nothing at generation 2. */
        async function expectServed(setup: IndexerSetup, knowledge: IKnowledge) {
            await waitForCollection(setup.repository, 'notes', (collection) => collection.pending === undefined);
            await waitForDocument(setup, 'notes', 'b', 'ready', contentHash(after));
            await waitForDocument(setup, 'notes', 'a', 'ready');

            const record = (await setup.repository.findOneCollection('notes'))!;

            expect(record).toMatchObject({
                model: 'mock/a',
                generation: 1,
                status: 'ready',
            });
            expect(knowledge.view(record).status).toBe('ready');

            for (const id of ['a', 'b', 'c']) {
                expect(await setup.repository.findOneDocument('notes', id)).toMatchObject({ status: 'ready', generation: 1 });
            }

            expect(await setup.repository.search('notes', 2, await vectorOf(after), { topK: 10 })).toEqual([]);

            const matches = await setup.repository.search('notes', 1, await vectorOf(after), { topK: 10 });

            expect(matches.filter((match) => match.document === 'b').map((match) => match.text)).toEqual([after]);
        }

        it('a re-embed abandoned by reverting the default model serves the new content at the served generation', async () => {
            const setup = createIndexerSetup();
            const { models, next } = await leaveReembed(setup);
            const third = create(setup, { embeddingModel: 'mock/a', models: embeddingResolver(models) });

            third.start();

            await expectServed(setup, third);
            expect(next.started).toHaveLength(3);
            expect(setup.errors).toEqual([]);
        });

        it.each(['requeueGeneration', 'deleteGeneration', 'saveCollection'] as const)(
            'an abandon whose %s fails is repeated by the next pass',
            async (method) => {
                const setup = createIndexerSetup();
                const { models } = await leaveReembed(setup);
                const third = create(setup, { embeddingModel: 'mock/a', models: embeddingResolver(models) });
                const failure = new Error('store down');

                // the first call of each is the abandon's (the managed pass writes the record nowhere else)
                vi.spyOn(setup.repository, method).mockRejectedValueOnce(failure);
                third.start();

                await vi.waitFor(() => {
                    expect(setup.errors).toEqual([{ error: failure, collection: 'notes' }]);
                });
                expect((await setup.repository.findOneCollection('notes'))!.pending).toMatchObject({ generation: 2, model: 'mock/b' });

                // the loop backs off before its next pass
                setup.clock.advance(5_000);

                await expectServed(setup, third);
                expect(setup.errors).toHaveLength(1);
            },
        );

        it('a sync() for a third default model abandons the pending re-embed before it starts the next generation', async () => {
            const setup = createIndexerSetup();
            const { models, next } = await leaveReembed(setup);
            const latest = mockEmbeddingModel({ dimensions: 32 });
            const third = create(setup, {
                embeddingModel: 'mock/c',
                models: embeddingResolver({ ...models, 'mock/c': latest }),
            });
            const writes: string[] = [];
            const { repository } = setup;
            const deleteGeneration = repository.deleteGeneration.bind(repository);
            const saveCollection = repository.saveCollection.bind(repository);

            vi.spyOn(repository, 'deleteGeneration').mockImplementation(async (collection, generation, options) => {
                writes.push(`delete ${generation}`);

                return deleteGeneration(collection, generation, options);
            });
            vi.spyOn(repository, 'saveCollection').mockImplementation(async (collection, options) => {
                writes.push(`save ${collection.pending?.generation ?? '-'}`);

                return saveCollection(collection, options);
            });

            third.start();
            await vi.waitFor(() => third.sync('notes'));

            const switched = await waitForCollection(repository, 'notes', (collection) => collection.generation === 3);

            expect(switched).toMatchObject({
                model: 'mock/c',
                dimensions: 32,
                status: 'ready',
                lastGeneration: 3,
            });
            expect(switched.pending).toBeUndefined();
            // the abandoned generation is gone before the next one is named
            expect(writes.indexOf('delete 2')).toBeGreaterThan(-1);
            expect(writes.indexOf('delete 2')).toBeLessThan(writes.indexOf('save 3'));

            for (const id of ['a', 'b', 'c']) {
                expect(await repository.findOneDocument('notes', id)).toMatchObject({ status: 'ready', generation: 3 });
            }

            const [vector] = (await latest.doEmbed({ values: [after] })).embeddings;
            const matches = await repository.search('notes', 3, vector!, { topK: 10 });

            expect(matches.filter((match) => match.document === 'b').map((match) => match.text)).toEqual([after]);
            expect(await repository.search('notes', 2, await vectorOf(after), { topK: 10 })).toEqual([]);
            expect(next.started).toHaveLength(3);
            expect(setup.errors).toEqual([]);
        });
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
        const at = new Date(setup.clock.now());
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
        const at = new Date(setup.clock.now());

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
