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
import type { IKnowledge } from '@chamvi/knowledge';
import {
    KNOWLEDGE_MANAGED_POLL_MS,
    KNOWLEDGE_RETRY_MS,
    createKnowledge,
    knowledgeCollection,
} from '@chamvi/knowledge';
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

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
}

/**
 * Two replicas over one store: `declaring` declares "docs" (no resyncMs), a
 * second one declares nothing, marks it orphaned at its start and deletes it.
 */
async function deletedByAnotherReplica(setup: IndexerSetup, model = mockEmbeddingModel()) {
    const docs = new Map([
        ['a.md', 'Our refund policy allows returns within thirty days.'],
        ['b.md', 'Kubernetes pods are scheduled onto nodes.'],
    ]);
    const declaring = createKnowledge(setup.options({ collections: [knowledgeCollection('docs', { model, sources: [mapSource(docs)] })] }));

    started.push(declaring);
    declaring.start();

    await waitForReady(setup.service, 'docs');

    const other = createKnowledge(setup.options());

    started.push(other);
    other.start();

    await waitForCollection(setup.service, 'docs', (found) => found.status === 'orphaned');

    expect(await other.deleteCollection('docs')).toBe(true);
    expect(await setup.service.findOneCollection('docs')).toBeUndefined();
    expect(await setup.service.findDocumentIds('docs')).toEqual([]);

    return { declaring, model };
}

describe('a declared collection whose record was deleted', () => {
    it('a declared collection whose record was deleted is rebuilt within KNOWLEDGE_MANAGED_POLL_MS', async () => {
        const setup = createIndexerSetup();

        await deletedByAnotherReplica(setup);

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        const rebuilt = await waitForReady(setup.service, 'docs');

        expect(rebuilt).toMatchObject({ kind: 'declared', status: 'ready' });
        await vi.waitFor(async () => {
            expect(await setup.service.findDocumentIds('docs')).toEqual(['a.md', 'b.md']);
        });
        expect(await setup.service.findOneDocument('docs', 'a.md')).toMatchObject({ status: 'ready', generation: 1 });
        expect(setup.errors).toEqual([]);
    });

    it('a failed rebuild is retried after its backoff without resyncMs', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const embed = model.doEmbed.bind(model);
        let down = false;

        vi.spyOn(model, 'doEmbed').mockImplementation(async (options) => {
            if (down) {
                throw new Error('provider unavailable');
            }

            return embed(options);
        });

        await deletedByAnotherReplica(setup, model);

        down = true;
        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        const failed = await waitForCollection(setup.service, 'docs', (found) => found.retryAt !== undefined);

        expect(failed.syncedAt).toBeUndefined();
        expect(setup.errors).toHaveLength(1);

        down = false;
        setup.clock.advance(KNOWLEDGE_RETRY_MS);

        const rebuilt = await waitForReady(setup.service, 'docs');

        expect(rebuilt.error).toBeUndefined();
        await vi.waitFor(async () => {
            expect(await setup.service.findDocumentIds('docs')).toEqual(['a.md', 'b.md']);
        });
    });

    it('a wake on a missing record runs a full pass', async () => {
        const setup = createIndexerSetup();
        const { declaring, model } = await deletedByAnotherReplica(setup);
        const calls = model.calls.length;

        declaring.sync('docs');

        await waitForReady(setup.service, 'docs');
        await vi.waitFor(async () => {
            expect(await setup.service.findDocumentIds('docs')).toEqual(['a.md', 'b.md']);
        });
        // every document embedded again: nothing of the deleted record survived
        expect(model.calls.length).toBeGreaterThan(calls);
        expect(setup.errors).toEqual([]);
    });

    it('checks an existing record without a pass while no resync is due', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const knowledge = createKnowledge(setup.options({ collections: [knowledgeCollection('docs', { model, sources: [mapSource(new Map([['a.md', 'text']]))] })] }));

        started.push(knowledge);
        knowledge.start();

        const first = await waitForReady(setup.service, 'docs');
        const acquires = setup.locks.acquired.length;

        for (let i = 0; i < 3; i++) {
            setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);
            await settle();
        }

        expect(setup.locks.acquired).toHaveLength(acquires);
        expect((await setup.service.findOneCollection('docs'))?.syncedAt).toEqual(first.syncedAt);
        expect(model.calls).toHaveLength(1);
    });
});
