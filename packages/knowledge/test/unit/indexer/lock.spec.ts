/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mockEmbeddingModel } from '@chamvi/test-kit';
import type { EmbeddingModel } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
    vi,
} from 'vitest';
import type { IKnowledge, IKnowledgeSource, KnowledgeCollection } from '@chamvi/knowledge';
import {
    CHUNKER_VERSION,
    KNOWLEDGE_LOCK_TTL_MS,
    KNOWLEDGE_RETRY_MS,
    createKnowledge,
    defineKnowledgeSource,
    knowledgeCollection,
} from '@chamvi/knowledge';
import type { IndexerSetup } from '../../utils/indexer.ts';
import {
    createIndexerSetup,
    gatedModel,
    mapSource,
    waitForCollection,
    waitForReady,
} from '../../utils/indexer.ts';

const started: IKnowledge[] = [];

afterEach(async () => {
    await Promise.all(started.splice(0).map((knowledge) => knowledge.stop()));
});

const docs = new Map([
    ['a.md', 'Our refund policy allows returns within thirty days.'],
    ['b.md', 'Kubernetes pods are scheduled onto nodes.'],
    ['c.md', 'Invoices are sent on the first day of each month.'],
]);

function start(setup: IndexerSetup, owner: string, model: EmbeddingModel, source: IKnowledgeSource = mapSource(docs)): IKnowledge {
    const knowledge = createKnowledge(setup.options({
        owner,
        collections: [knowledgeCollection('docs', { model, sources: [source] })],
    }));

    started.push(knowledge);
    knowledge.start();

    return knowledge;
}

/**
 * The documents of `docs`, holding after the first one until opened: the
 * clock moves while no embedding call (and so no embedding timeout) is open.
 */
function gatedSource(): {
    source: IKnowledgeSource; 
    open: () => void; 
    held: () => boolean 
} {
    const gate = Promise.withResolvers<void>();
    let held = false;

    return {
        source: defineKnowledgeSource({
            async* documents() {
                const [first, ...rest] = [...docs];

                yield { id: first![0], content: first![1] };
                held = true;
                await gate.promise;

                for (const [id, content] of rest) {
                    yield { id, content };
                }
            },
        }),
        open: () => gate.resolve(),
        held: () => held,
    };
}

function acquiresOf(setup: IndexerSetup, owner: string): boolean[] {
    return setup.locks.acquired.filter((entry) => entry.owner === owner).map((entry) => entry.result);
}

function failingModel(): MockEmbeddingModelV4 {
    return new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: null,
        supportsParallelCalls: true,
        doEmbed: async () => {
            throw new Error('provider unavailable');
        },
    });
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
}

describe('the indexing lock', () => {
    it('embeds once across two replicas; the loser syncs after the winner, finding nothing to embed', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();

        start(setup, 'replica-a', model);
        start(setup, 'replica-b', model);

        await waitForReady(setup.repository, 'docs');
        await expect.poll(() => setup.locks.acquired.length).toBe(2);

        expect(setup.locks.acquired.every((entry) => entry.key === 'knowledge:docs')).toBe(true);
        expect(acquiresOf(setup, 'replica-a')).toEqual([true]);
        expect(acquiresOf(setup, 'replica-b')).toEqual([false]);
        expect(model.calls.flatMap((call) => call.values)).toHaveLength(3);

        setup.clock.advance(KNOWLEDGE_RETRY_MS);
        await settle();
        setup.clock.advance(KNOWLEDGE_RETRY_MS * 10);
        await settle();

        // the loser took the lock once it was free and synced its own sources: unchanged, nothing embedded
        expect(acquiresOf(setup, 'replica-b')).toEqual([false, true]);
        expect(model.calls.flatMap((call) => call.values)).toHaveLength(3);
        expect(setup.errors).toEqual([]);
    });

    it('lets a replica with changed sources index them once the holder released the lock', async () => {
        const setup = createIndexerSetup();
        const gated = gatedSource();

        start(setup, 'replica-a', mockEmbeddingModel(), gated.source);

        await expect.poll(() => gated.held()).toBe(true);

        const changed = new Map([
            ['a.md', 'Our refund policy allows returns within thirty days.'],
            ['d.md', 'Deployments roll out one replica at a time.'],
        ]);

        start(setup, 'replica-b', mockEmbeddingModel(), mapSource(changed));

        await expect.poll(() => acquiresOf(setup, 'replica-b')).toEqual([false]);

        gated.open();
        await waitForReady(setup.repository, 'docs');

        await vi.waitFor(async () => {
            setup.clock.advance(KNOWLEDGE_RETRY_MS);
            await settle();

            expect(await setup.repository.findOneDocument('docs', 'd.md')).toBeDefined();
        });

        expect(await setup.repository.findDocumentIds('docs')).toEqual(['a.md', 'd.md']);
        expect(setup.errors).toEqual([]);
    });

    it('renews the lock after embedding and writes nothing once it was lost meanwhile', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel({ modelId: 'mock-model-id' });
        // three embedding batches (64 chunks each at most)
        const long = Array.from({ length: 150 }, (_, i) => `Paragraph ${i} ${'x'.repeat(1700)}`).join('\n\n');

        start(setup, 'replica-a', model, mapSource(new Map([['long.md', long]])));

        for (let n = 0; n < 3; n++) {
            await expect.poll(() => model.started.length).toBe(n + 1);
            // below the embedding timeout per call, past half the lease in all
            setup.clock.advance(59_000);

            if (n < 2) {
                model.open(n);
            }
        }

        // the lease is taken over while the last batch is embedded
        await setup.locks.release('knowledge:docs', 'replica-a');
        expect(await setup.locks.acquire('knowledge:docs', 'intruder', KNOWLEDGE_LOCK_TTL_MS)).toBe(true);
        model.open(2);

        await expect.poll(() => acquiresOf(setup, 'replica-a')).toEqual([true, false]);
        await settle();

        expect(await setup.repository.findOneDocument('docs', 'long.md')).toBeUndefined();
        expect(await setup.repository.search('docs', 1, (await mockEmbeddingModel().doEmbed({ values: ['x'] })).embeddings[0]!, { topK: 5 })).toEqual([]);
        expect(setup.errors).toEqual([]);
    });

    it('lets the loser take over when the winner gave up before ready', async () => {
        const setup = createIndexerSetup();
        const gated = gatedModel({ modelId: 'mock-model-id' });
        const winner = start(setup, 'replica-a', gated);
        const model = mockEmbeddingModel();

        start(setup, 'replica-b', model);

        await expect.poll(() => gated.started.length).toBe(1);
        await winner.stop();

        setup.clock.advance(KNOWLEDGE_RETRY_MS);

        await waitForReady(setup.repository, 'docs');

        expect(acquiresOf(setup, 'replica-b')).toEqual([false, true]);
        expect(model.calls.flatMap((call) => call.values)).toHaveLength(3);
    });

    it('renews the lock once half its TTL has passed', async () => {
        const setup = createIndexerSetup();
        const gated = gatedSource();

        start(setup, 'replica-a', mockEmbeddingModel(), gated.source);

        await expect.poll(() => gated.held()).toBe(true);

        setup.clock.advance((KNOWLEDGE_LOCK_TTL_MS / 2) + 1);
        gated.open();

        await waitForReady(setup.repository, 'docs');

        expect(acquiresOf(setup, 'replica-a')).toEqual([true, true]);
    });

    it('abandons the sync without an error when another owner took the lock', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const gated = gatedSource();

        start(setup, 'replica-a', model, gated.source);

        await expect.poll(() => gated.held()).toBe(true);

        setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);
        expect(await setup.locks.acquire('knowledge:docs', 'intruder', KNOWLEDGE_LOCK_TTL_MS)).toBe(true);

        gated.open();

        await expect.poll(() => acquiresOf(setup, 'replica-a')).toEqual([true, false]);
        await settle();

        expect(model.calls).toHaveLength(1);
        expect(await setup.repository.findOneDocument('docs', 'b.md')).toBeUndefined();
        expect((await setup.repository.findOneCollection('docs'))?.status).toBe('pending');
        expect(setup.errors).toEqual([]);
    });

    it('stores a failure while it holds the lock, so a replica that indexes afterwards keeps its record', async () => {
        const setup = createIndexerSetup();
        const gate = Promise.withResolvers<void>();
        let gated: KnowledgeCollection | undefined;
        const replicaA = createKnowledge(setup.options({
            owner: 'replica-a',
            collections: [knowledgeCollection('docs', { model: failingModel(), sources: [mapSource(docs)] })],
        }));
        const { service } = replicaA;
        const save = service.saveCollection.bind(service);

        // hold replica A's first record write carrying an error (its failure)
        service.saveCollection = async (collection) => {
            if (collection.error !== undefined && !gated) {
                gated = collection;
                await gate.promise;
            }

            return save(collection);
        };

        started.push(replicaA);
        replicaA.start();

        await expect.poll(() => gated !== undefined).toBe(true);

        start(setup, 'replica-b', mockEmbeddingModel());

        await expect.poll(() => acquiresOf(setup, 'replica-b')).toHaveLength(1);

        const whileWriting = acquiresOf(setup, 'replica-b');

        gate.resolve();

        // A still held the lock while it wrote its error
        expect(whileWriting).toEqual([false]);

        await expect.poll(() => setup.errors.length).toBe(1);
        // A gives up (its provider stays down): B takes the next attempt
        await replicaA.stop();

        await vi.waitFor(async () => {
            setup.clock.advance(KNOWLEDGE_RETRY_MS);
            await settle();

            expect(await setup.repository.findOneCollection('docs')).toMatchObject({ generation: 1, status: 'ready' });
        });
    });

    it('backs off per collection, not per replica', async () => {
        const setup = createIndexerSetup();
        let calls = 0;
        const model = new MockEmbeddingModelV4({
            maxEmbeddingsPerCall: null,
            supportsParallelCalls: true,
            doEmbed: async () => {
                calls++;

                throw new Error('provider unavailable');
            },
        });

        start(setup, 'replica-a', model);
        start(setup, 'replica-b', model);

        await expect.poll(() => calls).toBe(1);

        const seen: number[] = [];

        for (let step = 1; step <= 7; step++) {
            setup.clock.advance(KNOWLEDGE_RETRY_MS);
            await settle();
            seen.push(calls);
        }

        // attempts at 0, 5, 15 and 35 s, whichever replica takes each
        expect(seen).toEqual([2, 2, 3, 3, 3, 3, 4]);
        expect(await setup.repository.findOneCollection('docs')).toMatchObject({
            failures: 4,
            retryAt: new Date(setup.clock.now() + (KNOWLEDGE_RETRY_MS * 8)),
        });
    });

    it('reports a failed lock acquire without touching the record', async () => {
        const setup = createIndexerSetup();
        const first = start(setup, 'replica-a', mockEmbeddingModel());

        await waitForReady(setup.repository, 'docs');
        await first.stop();

        const ready = await setup.repository.findOneCollection('docs');
        const acquire = setup.locks.acquire.bind(setup.locks);
        let failures = 1;

        setup.locks.acquire = async (key, owner, ttlMs) => {
            if (failures > 0) {
                failures--;

                throw new Error('lock store down');
            }

            return acquire(key, owner, ttlMs);
        };

        start(setup, 'replica-b', mockEmbeddingModel());

        await expect.poll(() => setup.errors.length).toBe(1);

        expect((setup.errors[0]!.error as Error).message).toBe('lock store down');
        expect(await setup.repository.findOneCollection('docs')).toEqual(ready);
    });

    it('a pass whose fence another owner advanced writes nothing more and reports nothing', async () => {
        const setup = createIndexerSetup();
        const stale = 'A stale refund policy from an older deploy.';
        const first = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel(), mapSource(new Map([['a.md', stale]]))));
        const { service } = first;
        const replace = service.replaceChunks.bind(service);
        const gate = Promise.withResolvers<void>();
        // the first write after the renew waits, as a store slower than the lease would
        const held = vi.spyOn(service, 'replaceChunks').mockImplementationOnce(async (...args) => {
            await gate.promise;

            return replace(...args);
        });

        await expect.poll(() => held.mock.calls.length).toBe(1);

        // the lease expires while the write waits: a second instance takes it and syncs its own sources
        setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);
        start(setup, 'replica-b', mockEmbeddingModel());

        await waitForReady(setup.repository, 'docs');
        expect(acquiresOf(setup, 'replica-b')).toEqual([true]);

        gate.resolve();

        await expect.poll(() => held.mock.settledResults[0]?.type).toBe('rejected');
        await settle();

        expect(held.mock.settledResults[0]).toMatchObject({ type: 'rejected', value: { code: 'lease_lost', lock: 'knowledge:docs' } });
        expect(await setup.repository.findDocumentIds('docs')).toEqual(['a.md', 'b.md', 'c.md']);
        expect(await setup.repository.findOneDocument('docs', 'a.md')).toMatchObject({ content: docs.get('a.md') });

        const [vector] = (await mockEmbeddingModel().doEmbed({ values: [stale] })).embeddings;
        const matches = await setup.repository.search('docs', 1, vector!, { topK: 10 });

        expect(matches.map((match) => match.text)).not.toContain(stale);
        expect(await setup.repository.findOneCollection('docs')).toMatchObject({ status: 'ready', generation: 1 });
        expect(setup.errors).toEqual([]);
    });

    it('a stale pass that read no record never replaces the record another owner created', async () => {
        const setup = createIndexerSetup();
        const first = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel(), mapSource(new Map([['old.md', 'An older deploy.']]))));
        const { service } = first;
        const save = service.saveCollection.bind(service);
        const gate = Promise.withResolvers<void>();
        // the creating save waits, as a store slower than the lease would
        const held = vi.spyOn(service, 'saveCollection').mockImplementationOnce(async (...args) => {
            await gate.promise;

            return save(...args);
        });

        await expect.poll(() => held.mock.calls.length).toBe(1);

        setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);
        start(setup, 'replica-b', mockEmbeddingModel());

        const ready = await waitForReady(setup.repository, 'docs');

        gate.resolve();

        await expect.poll(() => held.mock.settledResults[0]?.type).toBe('rejected');
        await settle();

        expect(held.mock.settledResults[0]).toMatchObject({ type: 'rejected', value: { code: 'lease_lost', lock: 'knowledge:docs' } });
        expect(await setup.repository.findOneCollection('docs')).toEqual(ready);
        expect(await setup.repository.findDocumentIds('docs')).toEqual(['a.md', 'b.md', 'c.md']);
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose created record is deleted before its fence advance writes nothing more', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const advance = service.advanceFence.bind(service);
        const replace = vi.spyOn(service, 'replaceChunks');
        const save = vi.spyOn(service, 'saveCollection');
        const fences = vi.spyOn(service, 'advanceFence')
            // the loop's advance: no row yet
            .mockImplementationOnce(advance)
            // the record the pass created is deleted before the pass's own advance
            .mockImplementationOnce(async (name) => {
                await service.deleteCollection(name);

                return advance(name);
            });

        await expect.poll(() => fences.mock.calls.length).toBe(2);
        await settle();

        // no write without a token: nothing recreates the deleted record
        expect(save).toHaveBeenCalledTimes(1);
        expect(replace).not.toHaveBeenCalled();
        expect(await setup.repository.findOneCollection('docs')).toBeUndefined();
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose created record is replaced before its fence advance never claims the replacement', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const advance = service.advanceFence.bind(service);
        const replace = vi.spyOn(service, 'replaceChunks');
        const now = new Date(setup.clock.now());
        const theirs: KnowledgeCollection = {
            name: 'docs',
            kind: 'declared',
            trusted: true,
            generation: 0,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
        const fences = vi.spyOn(service, 'advanceFence')
            .mockImplementationOnce(advance)
            // deleted and created again by another owner before the pass's own advance
            .mockImplementationOnce(async (name) => {
                await service.deleteCollection(name);
                await service.saveCollection(theirs);

                return advance(name);
            });

        await expect.poll(() => fences.mock.calls.length).toBe(2);
        await settle();

        expect(replace).not.toHaveBeenCalled();
        expect(await setup.repository.findOneCollection('docs')).toEqual(theirs);
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose lease ran out during its create advances no fence', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const save = service.saveCollection.bind(service);
        const fences = vi.spyOn(service, 'advanceFence');
        const replace = vi.spyOn(service, 'replaceChunks');
        // the creating save outlasts the lease, and another owner takes the lock
        const held = vi.spyOn(service, 'saveCollection').mockImplementationOnce(async (...args) => {
            const saved = await save(...args);

            setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);
            expect(await setup.locks.acquire('knowledge:docs', 'intruder', KNOWLEDGE_LOCK_TTL_MS)).toBe(true);

            return saved;
        });

        await expect.poll(() => held.mock.settledResults[0]?.type).toBe('fulfilled');
        await expect.poll(() => acquiresOf(setup, 'replica-a')).toEqual([true, false]);
        await settle();

        // only the loop's advance (no row then): the intruder's token stays the newest
        expect(fences).toHaveBeenCalledTimes(1);
        expect(replace).not.toHaveBeenCalled();
        expect(setup.errors).toEqual([]);
    });

    it('a loop whose lease ran out before its advance advances no fence and runs no pass', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));

        await waitForReady(setup.repository, 'docs');

        const { service } = knowledge;
        const read = service.findOneCollection.bind(service);
        const fences = vi.spyOn(service, 'advanceFence');
        const replace = vi.spyOn(service, 'replaceChunks');
        let reads = 0;

        vi.spyOn(service, 'findOneCollection').mockImplementation(async (name) => {
            reads++;

            // the backoff read after the acquire stalls past the lease, and another owner takes the lock
            if (reads === 2) {
                setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);
                expect(await setup.locks.acquire('knowledge:docs', 'intruder', KNOWLEDGE_LOCK_TTL_MS)).toBe(true);
            }

            return read(name);
        });

        knowledge.sync('docs');

        await expect.poll(() => acquiresOf(setup, 'replica-a')).toEqual([true, true, false]);
        await settle();

        expect(fences).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose record appeared after the fence was advanced writes with a fence', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const advance = service.advanceFence.bind(service);
        const save = service.saveCollection.bind(service);
        const replace = vi.spyOn(service, 'replaceChunks');

        // the record lands between the loop's advance (no row yet) and the pass's own read
        vi.spyOn(service, 'advanceFence').mockImplementationOnce(async (name) => {
            const fence = await advance(name);
            const now = new Date(setup.clock.now());

            await save({
                name,
                kind: 'declared',
                trusted: true,
                generation: 0,
                model: 'mock-provider/mock-model-id',
                chunker: CHUNKER_VERSION,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            });

            return fence;
        });

        await waitForReady(setup.repository, 'docs');

        expect(replace.mock.calls).toHaveLength(3);
        expect(replace.mock.calls.every((call) => call[4]?.fence !== undefined)).toBe(true);
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose record appeared after the fence was advanced renews the lock before its own advance', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const advance = service.advanceFence.bind(service);
        const save = service.saveCollection.bind(service);
        const replace = vi.spyOn(service, 'replaceChunks');
        const now = new Date(setup.clock.now());
        const record: KnowledgeCollection = {
            name: 'docs',
            kind: 'declared',
            trusted: true,
            generation: 0,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        // the record lands after the loop's advance (no row yet), then the lease runs out and another owner takes the lock
        const fences = vi.spyOn(service, 'advanceFence').mockImplementationOnce(async (name) => {
            const fence = await advance(name);

            await save(record);
            setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);
            expect(await setup.locks.acquire('knowledge:docs', 'intruder', KNOWLEDGE_LOCK_TTL_MS)).toBe(true);

            return fence;
        });

        await expect.poll(() => acquiresOf(setup, 'replica-a')).toEqual([true, false]);
        await settle();

        // the pass ended without a fence of its own: the intruder's token stays the newest
        expect(fences).toHaveBeenCalledTimes(1);
        expect(replace).not.toHaveBeenCalled();
        expect(await setup.repository.findOneCollection('docs')).toEqual(record);
        expect(setup.errors).toEqual([]);
    });

    it('a pass whose record appeared after the fence was advanced decides on the record read after its own advance', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const advance = service.advanceFence.bind(service);
        const save = service.saveCollection.bind(service);
        const now = new Date(setup.clock.now());
        const record: KnowledgeCollection = {
            name: 'docs',
            kind: 'declared',
            trusted: true,
            generation: 1,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'ready',
            createdAt: now,
            updatedAt: now,
        };

        vi.spyOn(service, 'advanceFence')
            // the record lands between the loop's advance (no row yet) and the pass's own read
            .mockImplementationOnce(async (name) => {
                const fence = await advance(name);

                await save(record);

                return fence;
            })
            // the previous owner gave out generation 7 between the pass's read and its advance
            .mockImplementationOnce(async (name) => {
                await save({
                    ...record,
                    pending: {
                        generation: 7,
                        model: 'mock-provider/mock-model-id',
                        chunker: CHUNKER_VERSION,
                    },
                    lastGeneration: 7,
                });

                return advance(name);
            });

        const synced = await waitForCollection(setup.repository, 'docs', (collection) => collection.syncedAt !== undefined);

        // never a generation number given out before
        expect(synced).toMatchObject({
            generation: 1,
            lastGeneration: 7,
            status: 'ready',
        });
        expect(synced.pending).toBeUndefined();
        expect(setup.errors).toEqual([]);
    });

    it('a failing pass without a token stores no failure over a record another owner created', async () => {
        const setup = createIndexerSetup();
        const knowledge = setup.adopt(start(setup, 'replica-a', mockEmbeddingModel()));
        const { service } = knowledge;
        const save = service.saveCollection.bind(service);
        const gate = Promise.withResolvers<void>();
        const now = new Date(setup.clock.now());
        const theirs = {
            name: 'docs',
            kind: 'declared' as const,
            trusted: true,
            generation: 0,
            model: 'mock-provider/mock-model-id',
            chunker: CHUNKER_VERSION,
            status: 'pending' as const,
            createdAt: now,
            updatedAt: now,
        };
        const held = vi.spyOn(service, 'saveCollection')
            // the creating save fails after another owner's create landed
            .mockImplementationOnce(async () => {
                await save(theirs);

                throw new Error('store down');
            })
            // the failure record waits, as a store slower than the lease would
            .mockImplementationOnce(async (...args) => {
                await gate.promise;

                return save(...args);
            });

        await expect.poll(() => held.mock.calls.length).toBe(2);
        // the other owner takes the lock and advances the fence
        await service.advanceFence('docs');
        gate.resolve();

        await expect.poll(() => held.mock.settledResults[1]?.type).toBe('rejected');
        await settle();

        expect(held.mock.settledResults[1]).toMatchObject({ type: 'rejected', value: { code: 'lease_lost' } });
        expect(await setup.repository.findOneCollection('docs')).toEqual(theirs);
        expect(setup.errors.map(({ error }) => (error as Error).message)).toEqual(['store down']);
    });

    it('runs one pass per interval across two replicas', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        let reads = 0;
        const inner = mapSource(docs);
        const source = defineKnowledgeSource({
            async* documents(ctx) {
                reads++;

                yield* inner.documents(ctx);
            },
        });

        for (const owner of ['replica-a', 'replica-b']) {
            const knowledge = createKnowledge(setup.options({
                owner,
                collections: [knowledgeCollection('docs', {
                    model,
                    sources: [source],
                    resyncMs: 60_000,
                })],
            }));

            started.push(knowledge);
            knowledge.start();
        }

        await waitForReady(setup.repository, 'docs');
        await expect.poll(() => setup.locks.acquired.length).toBe(2);

        // the loser's own first pass, once the lock is free
        setup.clock.advance(KNOWLEDGE_RETRY_MS);
        await expect.poll(() => reads).toBe(2);
        await settle();

        const passes: number[] = [];

        for (let interval = 0; interval < 3; interval++) {
            const before = reads;

            setup.clock.advance(60_000);
            await settle();
            // a replica that lost the lock race tries again after KNOWLEDGE_RETRY_MS
            setup.clock.advance(KNOWLEDGE_RETRY_MS);
            await settle();
            passes.push(reads - before);
        }

        expect(passes).toEqual([1, 1, 1]);
        expect(model.calls.flatMap((call) => call.values)).toHaveLength(3);
        expect(setup.errors).toEqual([]);
    });
});
