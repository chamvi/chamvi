/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { KnowledgeRepositoryContractOptions } from './types.ts';
import { chunkOf, collectionOf, documentOf } from './helpers.ts';

/** The chunk cases of the knowledge contract. */
export function describeKnowledgeChunksContract(create: KnowledgeRepositoryContractOptions['create']): void {
    describe('chunks', () => {
        it('replaces only the given document and generation', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.saveDocument(documentOf('docs', 'a'));
            await service.saveDocument(documentOf('docs', 'b'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'old a0'), chunkOf(1, [1, 0], 'old a1')]);
            await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0], 'next a0')]);
            await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0], 'b0')]);

            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'new a0')]);

            const first = await service.search('docs', 1, [1, 0], { topK: 10 });

            expect(first.map((match) => [match.document, match.index, match.text])).toEqual([
                ['a', 0, 'new a0'],
                ['b', 0, 'b0'],
            ]);
            expect((await service.search('docs', 2, [1, 0], { topK: 10 })).map((match) => match.text))
                .toEqual(['next a0']);

            await service.replaceChunks('docs', 'a', 1, []);

            expect((await service.search('docs', 1, [1, 0], { topK: 10 })).map((match) => match.document))
                .toEqual(['b']);
        });

        it('copies chunk vectors in', async () => {
            const service = await create();
            const vector = [1, 0];

            await service.saveCollection(collectionOf('docs'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, vector)]);
            vector[0] = 0;
            vector[1] = 1;

            const [match] = await service.search('docs', 1, [1, 0], { topK: 1 });

            expect(match?.score).toBeCloseTo(1, 6);
        });

        it('deletes one generation and keeps the others', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.saveCollection(collectionOf('other'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('other', 'a', 1, [chunkOf(0, [1, 0])]);

            await service.deleteGeneration('docs', 1);
            await service.deleteGeneration('docs', 5);
            await service.deleteGeneration('missing', 1);

            expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toEqual([]);
            expect(await service.search('docs', 2, [1, 0], { topK: 10 })).toHaveLength(1);
            expect(await service.search('other', 1, [1, 0], { topK: 10 })).toHaveLength(1);
        });
    });
}
