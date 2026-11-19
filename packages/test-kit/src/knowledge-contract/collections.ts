/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { KnowledgeRepositoryContractOptions } from './types.ts';
import { chunkOf, collectionOf, documentOf } from './helpers.ts';
import { AT } from './constants.ts';

/** The collection cases of the knowledge contract. */
export function describeKnowledgeCollectionsContract(create: KnowledgeRepositoryContractOptions['create']): void {
    describe('collections', () => {
        it('reads a missing collection as undefined and OrFail rejects', async () => {
            const service = await create();

            expect(await service.findOneCollection('missing')).toBeUndefined();
            await expect(service.findOneCollectionOrFail('missing'))
                .rejects.toMatchObject({ code: 'repository_not_found' });
            expect(await service.findCollections()).toEqual([]);
        });

        it('saves, reads and upserts a collection by name', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs', { status: 'pending', generation: 0 }));
            await service.saveCollection(collectionOf('docs', {
                pending: {
                    generation: 2,
                    model: 'p/m',
                    dimensions: 4,
                    chunker: 'text-v1',
                },
                lastGeneration: 3,
                error: 'failed once',
                failures: 2,
                retryAt: new Date(5_000),
                syncedAt: new Date(4_000),
            }));

            const stored = await service.findOneCollectionOrFail('docs');

            expect(stored).toEqual(collectionOf('docs', {
                pending: {
                    generation: 2,
                    model: 'p/m',
                    dimensions: 4,
                    chunker: 'text-v1',
                },
                lastGeneration: 3,
                error: 'failed once',
                failures: 2,
                retryAt: new Date(5_000),
                syncedAt: new Date(4_000),
            }));
            expect(stored.createdAt).toBeInstanceOf(Date);
            expect(stored.retryAt).toBeInstanceOf(Date);
            expect(stored.syncedAt).toBeInstanceOf(Date);
            expect(stored.updatedAt.getTime()).toBe(AT.getTime());
            expect(await service.findCollections()).toHaveLength(1);
        });

        it('saveCollection clears optional fields on replace', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs', {
                pending: {
                    generation: 2,
                    model: 'p/m',
                    dimensions: 4,
                    chunker: 'text-v1',
                },
                lastGeneration: 3,
                error: 'failed once',
                failures: 2,
                retryAt: new Date(5_000),
                syncedAt: new Date(4_000),
            }));

            const bare = collectionOf('docs');

            delete bare.dimensions;

            await service.saveCollection(bare);

            expect(await service.findOneCollectionOrFail('docs')).toEqual(bare);
        });

        it('saveCollection ignores an id or fence carried by the input', async () => {
            const service = await create();
            const foreign = {
                ...collectionOf('docs'),
                id: 'another-row',
                fence: 9,
            };

            const created = await service.saveCollection(foreign);

            expect(created.id).not.toBe('another-row');
            expect(created.fence).toBe(0);
            expect(await service.claimFence('docs', 1)).toEqual({ id: created.id, fence: 1 });
            expect(await service.findOneCollectionOrFail('docs')).toEqual(collectionOf('docs'));
        });

        it('copies collections in and out', async () => {
            const service = await create();
            const input = collectionOf('docs', {
                pending: {
                    generation: 2,
                    model: 'p/m',
                    chunker: 'text-v1',
                },
            });

            await service.saveCollection(input);
            input.status = 'orphaned';
            input.pending!.generation = 9;

            const read = await service.findOneCollectionOrFail('docs');

            read.status = 'stale';
            read.pending!.generation = 7;
            read.updatedAt.setTime(0);

            const [listed] = await service.findCollections();

            listed!.trusted = false;

            const again = await service.findOneCollectionOrFail('docs');

            expect(again.status).toBe('ready');
            expect(again.trusted).toBe(true);
            expect(again.pending?.generation).toBe(2);
            expect(again.updatedAt.getTime()).toBe(AT.getTime());
        });

        it('lists collections in code point order', async () => {
            const service = await create();

            for (const name of ['b', '\u{1F600}', 'a', '�', 'B']) {
                await service.saveCollection(collectionOf(name));
            }

            const names = (await service.findCollections()).map((collection) => collection.name);

            expect(names).toEqual(['B', 'a', 'b', '�', '\u{1F600}']);
        });

        it('deletes a collection with its documents and chunks', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.saveCollection(collectionOf('other'));
            await service.saveDocument(documentOf('docs', 'a'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'loose', 1, [chunkOf(0, [1, 0])]);
            await service.saveDocument(documentOf('other', 'a'));
            await service.replaceChunks('other', 'a', 1, [chunkOf(0, [1, 0])]);

            expect(await service.deleteCollection('docs')).toBe(true);
            expect(await service.deleteCollection('docs')).toBe(false);
            expect(await service.findOneCollection('docs')).toBeUndefined();
            expect(await service.findDocumentIds('docs')).toEqual([]);
            expect(await service.findOneDocument('docs', 'a')).toBeUndefined();
            expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toEqual([]);

            await service.saveCollection(collectionOf('docs'));

            expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toEqual([]);
            expect(await service.findDocumentIds('other')).toEqual(['a']);
            expect(await service.search('other', 1, [1, 0], { topK: 10 })).toHaveLength(1);
        });

        it('a collection deleted and re-created gets a new id', async () => {
            const service = await create();

            const first = await service.saveCollection(collectionOf('docs', { status: 'pending', generation: 0 }));
            const again = await service.saveCollection(collectionOf('docs'));

            expect(first.id).toEqual(expect.any(String));
            expect(first.fence).toBe(0);
            expect(again.id).toBe(first.id);
            expect(again.fence).toBe(0);
            expect(again).toMatchObject(collectionOf('docs'));

            expect(await service.deleteCollection('docs')).toBe(true);

            const recreated = await service.saveCollection(collectionOf('docs'));

            expect(recreated.id).not.toBe(first.id);
            expect(recreated.fence).toBe(0);
            expect(await service.findOneCollectionOrFail('docs')).toEqual(collectionOf('docs'));
        });

        it('deletes every generation but one, of that collection only', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.saveCollection(collectionOf('other'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'b', 3, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('other', 'a', 1, [chunkOf(0, [1, 0])]);

            await service.deleteGenerationsExcept('docs', 2);
            await service.deleteGenerationsExcept('missing', 1);

            expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toEqual([]);
            expect(await service.search('docs', 2, [1, 0], { topK: 10 })).toHaveLength(1);
            expect(await service.search('docs', 3, [1, 0], { topK: 10 })).toEqual([]);
            expect(await service.search('other', 1, [1, 0], { topK: 10 })).toHaveLength(1);
        });
    });
}
