/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { describe, expect, it } from 'vitest';
import type { KnowledgeRepositoryContractOptions } from './types.ts';
import { chunkOf, collectionOf, documentOf } from './helpers.ts';

/** The search cases of the knowledge contract. */
export function describeKnowledgeSearchContract(create: KnowledgeRepositoryContractOptions['create']): void {
    describe('search', () => {
        const seed = async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.saveDocument(documentOf('docs', 'near', { title: 'Near', source: 'near.md' }));
            await service.saveDocument(documentOf('docs', 'far'));
            await service.saveDocument(documentOf('docs', 'next'));
            await service.replaceChunks('docs', 'near', 1, [chunkOf(0, [1, 0], 'exact', { title: 'Near', source: 'near.md' })]);
            await service.replaceChunks('docs', 'far', 1, [chunkOf(0, [0.6, 0.8], 'partial')]);
            await service.replaceChunks('docs', 'next', 2, [chunkOf(0, [1, 0], 'next generation')]);

            return service;
        };

        it('ranks by cosine similarity and joins the origin', async () => {
            const service = await seed();

            const matches = await service.search('docs', 1, [1, 0], { topK: 10 });

            expect(matches).toHaveLength(2);
            expect(matches[0]).toMatchObject({
                collection: 'docs',
                document: 'near',
                index: 0,
                text: 'exact',
                title: 'Near',
                source: 'near.md',
            });
            expect(matches[0]!.score).toBeCloseTo(1, 6);
            expect(matches[1]).toMatchObject({ document: 'far', text: 'partial' });
            expect(matches[1]!.score).toBeCloseTo(0.6, 6);
            expect(matches[1]!.title).toBeUndefined();
            expect(matches[1]!.source).toBeUndefined();
        });

        it('search returns the title and source the chunk was written with, not the document\'s current ones', async () => {
            const service = await seed();

            await service.saveDocument(documentOf('docs', 'near', { title: 'Renamed', source: 'renamed.md' }));
            await service.saveDocument(documentOf('docs', 'far', { title: 'Far', source: 'far.md' }));
            await service.replaceChunks('docs', 'loose', 1, [chunkOf(0, [0, 1], 'loose', { title: 'Loose', source: 'loose.md' })]);

            const matches = await service.search('docs', 1, [1, 0], { topK: 10 });
            const byDocument = new Map(matches.map((match) => [match.document, match]));

            expect(byDocument.get('near')).toMatchObject({ title: 'Near', source: 'near.md' });
            expect(byDocument.get('far')!.title).toBeUndefined();
            expect(byDocument.get('far')!.source).toBeUndefined();
            expect(byDocument.get('loose')).toMatchObject({ title: 'Loose', source: 'loose.md' });
        });

        it('compares by direction, not by length', async () => {
            const service = await seed();

            const [match] = await service.search('docs', 1, [3, 0], { topK: 1 });

            expect(match?.document).toBe('near');
            expect(match?.score).toBeCloseTo(1, 6);
        });

        it('honours topK and minScore', async () => {
            const service = await seed();

            expect((await service.search('docs', 1, [1, 0], { topK: 1 })).map((match) => match.document))
                .toEqual(['near']);
            expect((await service.search('docs', 1, [1, 0], { topK: 10, minScore: 0.7 })).map((match) => match.document))
                .toEqual(['near']);
            expect(await service.search('docs', 1, [1, 0], { topK: 10, minScore: 1.5 })).toEqual([]);
        });

        it('searches only the given generation', async () => {
            const service = await seed();

            expect((await service.search('docs', 2, [1, 0], { topK: 10 })).map((match) => match.text))
                .toEqual(['next generation']);
            expect(await service.search('docs', 3, [1, 0], { topK: 10 })).toEqual([]);
        });

        it('answers an unknown collection with no matches', async () => {
            const service = await seed();

            expect(await service.search('missing', 1, [1, 0], { topK: 10 })).toEqual([]);
        });

        it('search skips chunks of another vector length', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'two')]);
            await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0, 0], 'three')]);
            await service.replaceChunks('docs', 'c', 2, [chunkOf(0, [1, 0], 'other generation')]);

            expect((await service.search('docs', 1, [1, 0], { topK: 10 })).map((match) => match.text))
                .toEqual(['two']);
            expect((await service.search('docs', 1, [1, 0, 0], { topK: 10 })).map((match) => match.text))
                .toEqual(['three']);
            expect(await service.search('docs', 1, [1, 0, 0, 0], { topK: 10 })).toEqual([]);
        });

        it('scores a zero vector 0 on either side', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [0, 0], 'zero')]);
            await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0], 'unit')]);

            const scores = (matches: Array<{ text: string; score: number }>) => matches
                .map((match) => [match.text, match.score]);

            expect(scores(await service.search('docs', 1, [1, 0], { topK: 10 }))).toEqual([
                ['unit', expect.closeTo(1, 6)],
                ['zero', 0],
            ]);
            // equal scores: by document
            expect(scores(await service.search('docs', 1, [0, 0], { topK: 10 }))).toEqual([
                ['zero', 0],
                ['unit', 0],
            ]);
            expect(await service.search('docs', 1, [0, 0], { topK: 10, minScore: 0.5 })).toEqual([]);
        });

        it('orders equal scores by document, then index', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'a', 1, [chunkOf(1, [1, 0]), chunkOf(0, [1, 0])]);

            const matches = await service.search('docs', 1, [1, 0], { topK: 10 });

            expect(matches.map((match) => [match.document, match.index])).toEqual([
                ['a', 0],
                ['a', 1],
                ['b', 0],
            ]);
        });
    });
}
