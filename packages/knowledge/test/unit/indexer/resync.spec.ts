/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mockEmbeddingModel } from '@chamvi/test-kit';
import type { EmbeddingModel } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { IKnowledge, IKnowledgeSource } from '@chamvi/knowledge';
import { createKnowledge, defineKnowledgeSource, knowledgeCollection } from '@chamvi/knowledge';
import type { IndexerSetup } from '../../utils/indexer.ts';
import {
    createIndexerSetup,
    gatedModel,
    mapSource,
    waitForReady,
} from '../../utils/indexer.ts';

const started: IKnowledge[] = [];

afterEach(async () => {
    await Promise.all(started.splice(0).map((knowledge) => knowledge.stop()));
});

/** A map source counting its reads. */
function countingSource(documents: Map<string, string>): { source: IKnowledgeSource; reads: () => number } {
    const inner = mapSource(documents);
    let reads = 0;

    return {
        source: defineKnowledgeSource({
            async* documents(ctx) {
                reads++;

                yield* inner.documents(ctx);
            },
        }),
        reads: () => reads,
    };
}

function start(
    setup: IndexerSetup,
    model: EmbeddingModel,
    source: IKnowledgeSource,
    resyncMs?: number,
): IKnowledge {
    const knowledge = createKnowledge(setup.options({
        collections: [knowledgeCollection('docs', {
            model,
            sources: [source],
            ...(resyncMs === undefined ? {} : { resyncMs }),
        })],
    }));

    started.push(knowledge);
    knowledge.start();

    return knowledge;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
}

describe('resyncing a declared collection', () => {
    it('resyncs a declared collection every resyncMs and picks up a changed source', async () => {
        const setup = createIndexerSetup();
        const model = mockEmbeddingModel();
        const docs = new Map([['a.md', 'Our refund policy allows returns within thirty days.']]);

        start(setup, model, mapSource(docs), 60_000);

        const first = await waitForReady(setup.repository, 'docs');

        expect(first.syncedAt).toEqual(setup.clock.now());

        docs.set('b.md', 'Kubernetes pods are scheduled onto nodes.');

        setup.clock.advance(59_999);
        await settle();

        expect(await setup.repository.findOneDocument('docs', 'b.md')).toBeUndefined();

        setup.clock.advance(1);

        await vi.waitFor(async () => {
            expect(await setup.repository.findOneDocument('docs', 'b.md')).toMatchObject({ status: 'ready' });
        });

        const [vector] = (await mockEmbeddingModel().doEmbed({ values: ['Kubernetes pods are scheduled onto nodes.'] })).embeddings;
        const [match] = await setup.repository.search('docs', 1, vector!, { topK: 1 });

        expect(match).toMatchObject({ document: 'b.md', text: 'Kubernetes pods are scheduled onto nodes.' });
        await vi.waitFor(async () => {
            expect((await setup.repository.findOneCollection('docs'))?.syncedAt).toEqual(new Date(first.syncedAt!.getTime() + 60_000));
        });
        expect(setup.errors).toEqual([]);
    });

    it('waits for a wake only without resyncMs', async () => {
        const setup = createIndexerSetup();
        const counted = countingSource(new Map([['a.md', 'Refunds within thirty days.']]));

        start(setup, mockEmbeddingModel(), counted.source);

        await waitForReady(setup.repository, 'docs');

        setup.clock.advance(2_147_483_647);
        await settle();

        expect(counted.reads()).toBe(1);
    });

    it('sync() runs a pass now and coalesces calls made while a pass runs', async () => {
        const setup = createIndexerSetup();
        const model = gatedModel({ modelId: 'mock-model-id' });
        const counted = countingSource(new Map([['a.md', 'Refunds within thirty days.']]));
        const knowledge = start(setup, model, counted.source);

        await expect.poll(() => model.started.length).toBe(1);

        knowledge.sync('docs');
        knowledge.sync('docs');
        knowledge.sync('docs');

        model.open(0);

        await waitForReady(setup.repository, 'docs');
        await expect.poll(() => counted.reads()).toBe(2);
        await settle();

        // the second pass found nothing changed: no embedding call
        expect(counted.reads()).toBe(2);
        expect(model.started).toHaveLength(1);

        // idle: a sync() runs a pass without the clock moving
        knowledge.sync('docs');

        await expect.poll(() => counted.reads()).toBe(3);
        await settle();

        expect(counted.reads()).toBe(3);
        expect(setup.errors).toEqual([]);
    });

    it('sync() picks up a changed source at once', async () => {
        const setup = createIndexerSetup();
        const docs = new Map([['a.md', 'Refunds within thirty days.']]);
        const knowledge = start(setup, mockEmbeddingModel(), mapSource(docs), 60_000);

        await waitForReady(setup.repository, 'docs');

        docs.delete('a.md');
        docs.set('b.md', 'Kubernetes pods are scheduled onto nodes.');
        knowledge.sync('docs');

        await vi.waitFor(async () => {
            expect(await setup.repository.findDocumentIds('docs')).toEqual(['b.md']);
        });
    });
});
