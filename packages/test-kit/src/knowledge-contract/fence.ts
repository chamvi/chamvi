/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type {
    ContractKnowledgeFence,
    ContractKnowledgeService,
    KnowledgeRepositoryContractOptions,
} from './types.ts';
import { chunkOf, collectionOf, documentOf } from './helpers.ts';

/** A write a pass makes, with the given fence (none: unfenced). */
type FencedWrite = {
    method: string;
    write: (service: ContractKnowledgeService, fence?: ContractKnowledgeFence) => Promise<unknown>;
    /** Checks the change the write made to the seed, given its result. */
    applied: (service: ContractKnowledgeService, result: unknown) => Promise<void>;
};

/** The fence cases of the knowledge contract. */
export function describeKnowledgeFenceContract(create: KnowledgeRepositoryContractOptions['create']): void {
    describe('fence', () => {
        /** `docs` with document `a` (generation 1) and its chunks of generations 1 and 2. */
        const seed = async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));
            await service.saveDocument(documentOf('docs', 'a'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0])]);

            return service;
        };

        const options = (fence?: ContractKnowledgeFence) => (fence === undefined ? undefined : { fence });

        /** The chunk counts of document `a` at generations 1 and 2. */
        const chunkCounts = async (service: ContractKnowledgeService) => [
            (await service.search('docs', 1, [1, 0], { topK: 10 })).length,
            (await service.search('docs', 2, [1, 0], { topK: 10 })).length,
        ];

        /** Every fenced write, each one that changes the seed when applied, with the change it makes. */
        const writes: FencedWrite[] = [
            {
                method: 'saveCollection',
                write: (service, fence) => service.saveCollection(collectionOf('docs', { status: 'stale' }), options(fence)),
                applied: async (service) => {
                    expect(await service.findOneCollection('docs')).toEqual(collectionOf('docs', { status: 'stale' }));
                },
            },
            {
                method: 'saveDocument',
                write: (service, fence) => service.saveDocument(documentOf('docs', 'b'), options(fence)),
                applied: async (service) => {
                    expect(await service.findDocumentIds('docs')).toEqual(['a', 'b']);
                    expect(await service.findOneDocument('docs', 'b')).toEqual(documentOf('docs', 'b'));
                },
            },
            {
                method: 'updateDocument',
                write: (service, fence) => service.updateDocument(
                    'docs',
                    'a',
                    { hash: 'sha256:a' },
                    { status: 'failed', error: 'refused' },
                    options(fence),
                ),
                applied: async (service, result) => {
                    expect(result).toBe(true);
                    expect(await service.findOneDocument('docs', 'a')).toEqual(documentOf('docs', 'a', { status: 'failed', error: 'refused' }));
                },
            },
            {
                method: 'requeueGeneration',
                write: (service, fence) => service.requeueGeneration('docs', 1, 2, 10, options(fence)),
                applied: async (service, result) => {
                    expect(result).toBe(1);
                    expect(await service.findOneDocument('docs', 'a')).toEqual(documentOf('docs', 'a', { status: 'pending', generation: 2 }));
                    expect(await chunkCounts(service)).toEqual([1, 1]);
                },
            },
            {
                method: 'deleteDocument',
                write: (service, fence) => service.deleteDocument('docs', 'a', options(fence)),
                applied: async (service, result) => {
                    expect(result).toBe(true);
                    expect(await service.findDocumentIds('docs')).toEqual([]);
                    expect(await chunkCounts(service)).toEqual([0, 0]);
                },
            },
            {
                method: 'replaceChunks',
                write: (service, fence) => service.replaceChunks('docs', 'a', 1, [], options(fence)),
                applied: async (service) => {
                    expect(await chunkCounts(service)).toEqual([0, 1]);
                },
            },
            {
                method: 'deleteGeneration',
                write: (service, fence) => service.deleteGeneration('docs', 1, options(fence)),
                applied: async (service) => {
                    expect(await chunkCounts(service)).toEqual([0, 1]);
                },
            },
            {
                method: 'deleteGenerationsExcept',
                write: (service, fence) => service.deleteGenerationsExcept('docs', 2, options(fence)),
                applied: async (service) => {
                    expect(await chunkCounts(service)).toEqual([0, 1]);
                },
            },
        ];

        /** Whether the seed is exactly as `seed()` wrote it. */
        const expectSeed = async (service: ContractKnowledgeService) => {
            expect(await service.findOneCollection('docs')).toEqual(collectionOf('docs'));
            expect(await service.findDocumentIds('docs')).toEqual(['a']);
            expect(await service.findOneDocument('docs', 'a')).toEqual(documentOf('docs', 'a'));
            expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toHaveLength(1);
            expect(await service.search('docs', 2, [1, 0], { topK: 10 })).toHaveLength(1);
        };

        it('claimFence takes a token at or above the stored fence and answers undefined for a missing one', async () => {
            const service = await create();
            const docs = await service.saveCollection(collectionOf('docs'));
            const other = await service.saveCollection(collectionOf('other'));

            expect(await service.claimFence('docs', 5)).toEqual({ id: docs.id, fence: 5 });
            // the same token again: the holder claiming twice
            expect(await service.claimFence('docs', 5)).toEqual({ id: docs.id, fence: 5 });
            expect(await service.claimFence('docs', 9)).toEqual({ id: docs.id, fence: 9 });
            expect(await service.claimFence('other', 3)).toEqual({ id: other.id, fence: 3 });
            expect(await service.claimFence('missing', 7)).toBeUndefined();
            expect((await service.findCollections()).map((collection) => collection.name)).toEqual(['docs', 'other']);
            expect(await service.findOneCollection('docs')).toEqual(collectionOf('docs'));
        });

        it('claimFence with a token below the stored fence is a LeaseLostError and writes nothing', async () => {
            const service = await seed();
            const current = await service.claimFence('docs', 9);

            await expect(service.claimFence('docs', 8)).rejects.toMatchObject({ code: 'lease_lost', lock: 'knowledge:docs' });

            // the newer holder's writes still apply
            await service.saveDocument(documentOf('docs', 'b'), options(current));
            expect(await service.findDocumentIds('docs')).toEqual(['a', 'b']);
            expect(await service.findOneCollection('docs')).toEqual(collectionOf('docs'));
        });

        it('claimFence round-trips tokens above 2^31', async () => {
            const service = await seed();
            const token = Date.now() * 1000;
            const claimed = await service.claimFence('docs', token);

            expect(claimed?.fence).toBe(token);
            await expect(service.claimFence('docs', token + 1)).resolves.toMatchObject({ fence: token + 1 });
            await expect(service.claimFence('docs', token)).rejects.toMatchObject({ code: 'lease_lost' });
            await service.saveDocument(documentOf('docs', 'b'), options({ id: claimed!.id, fence: token + 1 }));
            expect(await service.findDocumentIds('docs')).toEqual(['a', 'b']);
        });

        it.each(writes)('a write with a stale fence is a LeaseLostError and writes nothing: $method', async ({ write }) => {
            const service = await seed();
            const stale = await service.claimFence('docs', 1);

            await service.claimFence('docs', 2);

            await expect(write(service, stale)).rejects.toMatchObject({ code: 'lease_lost', lock: 'knowledge:docs' });
            await expectSeed(service);
        });

        it.each(writes)('a write with the current fence is applied: $method', async ({ write, applied }) => {
            const service = await seed();

            await service.claimFence('docs', 1);

            const current = await service.claimFence('docs', 2);

            await applied(service, await write(service, current));
        });

        it('a write with the fence of a deleted and re-created collection is refused', async () => {
            const service = await create();

            await service.saveCollection(collectionOf('docs'));

            const old = await service.claimFence('docs', 1);

            await service.deleteCollection('docs');
            await service.saveCollection(collectionOf('docs'));

            const current = await service.claimFence('docs', 1);

            // the same token on another row
            expect(current?.fence).toBe(old?.fence);
            expect(current?.id).not.toBe(old?.id);

            await service.saveDocument(documentOf('docs', 'a'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
            await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0])]);

            for (const { write } of writes) {
                await expect(write(service, old)).rejects.toMatchObject({ code: 'lease_lost', lock: 'knowledge:docs' });
            }

            await expectSeed(service);
        });

        it.each(writes)('a write without a fence is never refused: $method', async ({ write, applied }) => {
            const service = await seed();

            await service.claimFence('docs', 1);
            await service.claimFence('docs', 2);

            await applied(service, await write(service));
        });

        it('saveCollection keeps the stored fence and id', async () => {
            const service = await create();
            const created = await service.saveCollection(collectionOf('docs'));

            await service.claimFence('docs', 1);

            const fence = await service.claimFence('docs', 2);
            // a record carrying another row's id and fence: neither is written
            const foreign = {
                ...collectionOf('docs', { status: 'stale' }),
                id: 'another-row',
                fence: 99,
            };
            const saved = await service.saveCollection(foreign);

            expect(saved).toMatchObject({
                id: created.id,
                fence: 2,
                status: 'stale',
            });
            expect(await service.saveCollection(collectionOf('docs'), { fence: fence! })).toMatchObject({ id: created.id, fence: 2 });
            // a token below 99 still claims: the input's fence was never written
            expect(await service.claimFence('docs', 3)).toEqual({ id: created.id, fence: 3 });
            expect(await service.findOneCollection('docs')).toEqual(collectionOf('docs'));
        });

        it('a create-only save over an existing row is a LeaseLostError and writes nothing', async () => {
            const service = await create();
            const created = await service.saveCollection(collectionOf('docs'), { create: true });

            expect(created).toMatchObject({ fence: 0, ...collectionOf('docs') });

            await service.claimFence('docs', 1);

            await expect(service.saveCollection(collectionOf('docs', { status: 'stale' }), { create: true }))
                .rejects.toMatchObject({ code: 'lease_lost', lock: 'knowledge:docs' });
            expect(await service.findOneCollection('docs')).toEqual(collectionOf('docs'));
            // the refused create kept the claimed fence
            await expect(service.claimFence('docs', 0)).rejects.toMatchObject({ code: 'lease_lost' });
            expect(await service.claimFence('docs', 1)).toEqual({ id: created.id, fence: 1 });
        });

        it('a fenced write after deleteCollection is RepositoryNotFoundError and creates no row', async () => {
            for (const { method, write } of writes) {
                const service = await seed();
                const fence = await service.claimFence('docs', 1);

                await service.deleteCollection('docs');

                await expect(write(service, fence), method).rejects.toMatchObject({ code: 'repository_not_found' });
                expect(await service.findCollections(), method).toEqual([]);
                expect(await service.findDocumentIds('docs'), method).toEqual([]);
                expect(await service.claimFence('docs', 2), method).toBeUndefined();
            }
        });
    });
}
