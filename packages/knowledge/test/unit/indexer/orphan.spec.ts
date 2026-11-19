/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mockEmbeddingModel } from '@chamvi/test-kit';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
    vi,
} from 'vitest';
import type { IKnowledge, KnowledgeCollectionKind, KnowledgeOptions } from '@chamvi/knowledge';
import {
    CHUNKER_VERSION,
    KNOWLEDGE_LOCK_TTL_MS,
    KNOWLEDGE_MANAGED_POLL_MS,
    contentHash,
    createKnowledge,
    knowledgeCollection,
} from '@chamvi/knowledge';
import { markOrphans } from '../../../src/indexer/orphans.ts';
import type { IndexerSetup } from '../../utils/indexer.ts';
import {
    createIndexerSetup,
    mapSource,
    waitForCollection,
    waitForReady,
} from '../../utils/indexer.ts';

const started: IKnowledge[] = [];

afterEach(async () => {
    await Promise.all(started.splice(0).map((knowledge) => knowledge.stop()));
});

async function seed(setup: IndexerSetup, name: string, kind: KnowledgeCollectionKind): Promise<void> {
    const now = new Date(setup.clock.now());

    await setup.service.saveCollection({
        name,
        kind,
        trusted: true,
        generation: 1,
        model: 'mock-provider/mock-model-id',
        dimensions: 2,
        chunker: CHUNKER_VERSION,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
    });
    await setup.service.replaceChunks(name, 'kept.md', 1, [{
        index: 0,
        text: 'kept',
        start: 0,
        end: 4,
        vector: [1, 0],
        title: 'kept.md',
    }]);
    await setup.service.saveDocument({
        collection: name,
        id: 'kept.md',
        content: 'kept',
        hash: contentHash('kept'),
        title: 'kept.md',
        status: 'ready',
        generation: 1,
        updatedAt: now,
    });
}

describe('orphaned collections', () => {
    it('marks a declared record without a definition orphaned and keeps its documents', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'old', 'declared');

        const knowledge = createKnowledge(setup.options({ collections: [knowledgeCollection('docs', { model: mockEmbeddingModel(), sources: [mapSource(new Map([['a.md', 'text']]))] })] }));

        started.push(knowledge);
        knowledge.start();

        const orphaned = await waitForCollection(setup.service, 'old', (found) => found.status === 'orphaned');

        expect(orphaned).toMatchObject({ generation: 1, kind: 'declared' });
        expect(await setup.service.findDocumentIds('old')).toEqual(['kept.md']);
        expect(await setup.service.search('old', 1, [1, 0], { topK: 1 })).toHaveLength(1);
        await waitForReady(setup.service, 'docs');
    });

    it('marks orphans also without any declared collection', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'old', 'declared');

        const knowledge = createKnowledge(setup.options());

        started.push(knowledge);
        knowledge.start();

        await waitForCollection(setup.service, 'old', (found) => found.status === 'orphaned');
    });

    it('leaves a managed record alone', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'managed', 'managed');
        await seed(setup, 'old', 'declared');

        const knowledge = createKnowledge(setup.options());

        started.push(knowledge);
        knowledge.start();

        await waitForCollection(setup.service, 'old', (found) => found.status === 'orphaned');

        expect((await setup.service.findOneCollection('managed'))?.status).toBe('ready');
    });

    it('serves an orphaned collection again once it is declared again', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();

        await seed(setup, 'old', 'declared');
        await setup.service.saveCollection({
            ...(await setup.service.findOneCollectionOrFail('old')),
            status: 'orphaned',
        });

        const knowledge = createKnowledge(setup.options({ collections: [knowledgeCollection('old', { model, sources: [mapSource(new Map([['kept.md', 'kept']]))] })] }));

        started.push(knowledge);
        knowledge.start();

        const collection = await waitForReady(setup.service, 'old');

        expect(collection.status).toBe('ready');
        // same content, same generation, same model: nothing to embed
        expect(model.calls).toHaveLength(0);
    });

    it('leaves a record alone while another owner holds its lock', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'old', 'declared');
        expect(await setup.locks.acquire('knowledge:old', 'syncing-replica', 60_000)).toBeTypeOf('number');

        const knowledge = createKnowledge(setup.options({ collections: [knowledgeCollection('docs', { model: mockEmbeddingModel(), sources: [mapSource(new Map([['a.md', 'text']]))] })] }));

        started.push(knowledge);
        knowledge.start();
        await waitForReady(setup.service, 'docs');
        await knowledge.stop();

        expect((await setup.service.findOneCollection('old'))?.status).toBe('ready');
        expect(setup.errors).toEqual([]);
    });

    it('leaves a record alone when another owner claimed its fence during the mark', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'old', 'declared');

        const knowledge = setup.adopt(createKnowledge(setup.options({})));
        const { service } = knowledge;
        const save = service.saveCollection.bind(service);
        const gate = Promise.withResolvers<void>();
        // the mark waits, as a store slower than the lease would
        const held = vi.spyOn(service, 'saveCollection').mockImplementationOnce(async (...args) => {
            await gate.promise;

            return save(...args);
        });

        started.push(knowledge);
        knowledge.start();

        try {
            await expect.poll(() => held.mock.calls.length).toBe(1);
            // another owner took the lock (a newer token) and claimed the fence
            await service.claimFence('old', Number.MAX_SAFE_INTEGER);
        } finally {
            // also on a failure: stop() waits for the held mark
            gate.resolve();
        }

        await expect.poll(() => held.mock.settledResults[0]?.type).toBe('rejected');
        await knowledge.stop();

        expect(held.mock.settledResults[0]).toMatchObject({ type: 'rejected', value: { code: 'lease_lost' } });
        expect((await setup.service.findOneCollection('old'))?.status).toBe('ready');
        expect(setup.errors).toEqual([]);
    });

    it('leaves a record deleted during its mark and marks the others', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'a-old', 'declared');
        await seed(setup, 'b-old', 'declared');

        const knowledge = setup.adopt(createKnowledge(setup.options({})));
        const { service } = knowledge;
        const save = service.saveCollection.bind(service);
        // deleted between the mark's advance and its save
        const deleted = vi.spyOn(service, 'saveCollection').mockImplementationOnce(async (...args) => {
            await service.deleteCollection(args[0].name);

            return save(...args);
        });

        started.push(knowledge);
        knowledge.start();

        await waitForCollection(setup.service, 'b-old', (found) => found.status === 'orphaned');
        await knowledge.stop();

        expect(deleted.mock.settledResults[0]).toMatchObject({ type: 'rejected', value: { code: 'repository_not_found' } });
        expect(await setup.service.findOneCollection('a-old')).toBeUndefined();
        expect(setup.errors).toEqual([]);
    });
});

describe('orphaned collections across replicas', () => {
    const HOUR = 3_600_000;

    function declaring(setup: IndexerSetup, extra: Partial<KnowledgeOptions> = {}): IKnowledge {
        const knowledge = createKnowledge(setup.options({
            collections: [knowledgeCollection('docs', {
                model: mockEmbeddingModel(),
                sources: [mapSource(new Map([['a.md', 'text']]))],
                resyncMs: HOUR,
            })],
            ...extra,
        }));

        started.push(knowledge);

        return knowledge;
    }

    function undeclaring(setup: IndexerSetup, extra: Partial<KnowledgeOptions> = {}): IKnowledge {
        const knowledge = createKnowledge(setup.options(extra));

        started.push(knowledge);

        return knowledge;
    }

    it('heals a declared record another replica marked orphaned within one record check, before resyncMs', async () => {
        const setup = createIndexerSetup();
        const b = declaring(setup);

        b.start();

        const synced = await waitForReady(setup.service, 'docs');
        const a = undeclaring(setup);

        a.start();
        await waitForCollection(setup.service, 'docs', (found) => found.status === 'orphaned');
        // the replica that marked it is gone: nothing marks it again
        await a.stop();

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        const healed = await waitForCollection(setup.service, 'docs', (found) => found.status === 'ready');

        expect(healed.syncedAt!.getTime()).toBe(synced.syncedAt!.getTime() + KNOWLEDGE_MANAGED_POLL_MS);
        expect(setup.errors).toEqual([]);
    });

    it('marks orphans on every managed poll: once the declaring replica is gone, the record settles orphaned', async () => {
        const setup = createIndexerSetup();
        // started before any record exists: its start() marks nothing
        const a = undeclaring(setup);

        a.start();

        const b = declaring(setup);

        b.start();
        await waitForReady(setup.service, 'docs');
        await b.stop();

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        await waitForCollection(setup.service, 'docs', (found) => found.status === 'orphaned');
        expect(setup.errors).toEqual([]);
    });

    it('the poll leaves a record alone while another owner holds its lock, and marks it once free', async () => {
        const setup = createIndexerSetup();
        const a = undeclaring(setup);

        a.start();
        await seed(setup, 'old', 'declared');
        expect(await setup.locks.acquire('knowledge:old', 'syncing-replica', HOUR)).toBeTypeOf('number');

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);
        await vi.waitFor(() => {
            expect(a.managedPoll.status().lastSuccessAt).toBe(setup.clock.now());
        });

        expect((await setup.service.findOneCollection('old'))?.status).toBe('ready');
        expect(setup.errors).toEqual([]);

        await setup.locks.release('knowledge:old', 'syncing-replica');
        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        await waitForCollection(setup.service, 'old', (found) => found.status === 'orphaned');
        expect(setup.errors).toEqual([]);
    });

    it('marks orphans on the poll its owner runs (runManagedPoll: false), without an embedding model', async () => {
        const setup = createIndexerSetup();
        const a = undeclaring(setup, { runManagedPoll: false });

        a.start();
        // as the app's knowledge-managed component does
        await a.managedPoll.start();

        try {
            await seed(setup, 'old', 'declared');
            setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

            await waitForCollection(setup.service, 'old', (found) => found.status === 'orphaned');
            expect(setup.errors).toEqual([]);
        } finally {
            await a.managedPoll.stop();
        }
    });

    it('a mark stalled past the lock TTL never releases the lease a later mark of the same owner holds', async () => {
        const setup = createIndexerSetup();

        await seed(setup, 'old', 'declared');

        const { service } = setup;
        const claim = service.claimFence.bind(service);
        const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
        let claims = 0;

        // each mark's fence claim waits on its own gate, as a slow store would
        service.claimFence = async (name, token) => {
            const gate = gates[claims++]!;

            await gate.promise;

            return claim(name, token);
        };

        // the instance's start() mark and its poll mark share the knowledge's owner
        const stale = markOrphans(service, new Set(), setup.locks, 'owner', setup.clock);

        await expect.poll(() => claims).toBe(1);
        setup.clock.advance(KNOWLEDGE_LOCK_TTL_MS + 1);

        const fresh = markOrphans(service, new Set(), setup.locks, 'owner', setup.clock);

        await expect.poll(() => claims).toBe(2);

        // the stale mark ends (its fence is refused or its mark lost) and releases
        gates[0]!.resolve();
        await stale.catch(() => {});

        // the later mark still holds the lock: nobody else can take it
        expect(await setup.locks.acquire('knowledge:old', 'intruder', KNOWLEDGE_LOCK_TTL_MS)).toBeUndefined();

        gates[1]!.resolve();
        await fresh;
        expect((await setup.service.findOneCollection('old'))?.status).toBe('orphaned');
    });
});
