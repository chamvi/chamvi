/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type {
    ContractKnowledgeChunk,
    ContractKnowledgeCollection,
    ContractKnowledgeDocument,
    ContractKnowledgeFence,
    ContractKnowledgeService,
    KnowledgeRepositoryContractOptions,
} from './types.ts';

const AT = new Date(1_000);

/** A write a pass makes, with the given fence (none: unfenced). */
type FencedWrite = {
    method: string;
    write: (service: ContractKnowledgeService, fence?: ContractKnowledgeFence) => Promise<unknown>;
    /** Checks the change the write made to the seed, given its result. */
    applied: (service: ContractKnowledgeService, result: unknown) => Promise<void>;
};

function collectionOf(
    name: string,
    patch: Partial<ContractKnowledgeCollection> = {},
): ContractKnowledgeCollection {
    return {
        name,
        kind: 'declared',
        trusted: true,
        generation: 1,
        model: 'mock-provider/mock-model-id',
        dimensions: 2,
        chunker: 'text-v1',
        status: 'ready',
        createdAt: AT,
        updatedAt: AT,
        ...patch,
    };
}

function documentOf(
    collection: string,
    id: string,
    patch: Partial<ContractKnowledgeDocument> = {},
): ContractKnowledgeDocument {
    return {
        collection,
        id,
        content: `content of ${id}`,
        hash: `sha256:${id}`,
        status: 'ready',
        generation: 1,
        updatedAt: AT,
        ...patch,
    };
}

function chunkOf(
    index: number,
    vector: number[],
    text = `chunk ${index}`,
    patch: Partial<ContractKnowledgeChunk> = {},
): ContractKnowledgeChunk {
    return {
        index,
        text,
        start: index * 10,
        end: (index * 10) + text.length,
        vector,
        ...patch,
    };
}

/**
 * Shared behavioural contract for every knowledge backend: it drives
 * `@chamvi/knowledge`'s `KnowledgeService` over the backend's
 * repositories, so the service's rules and the repositories' storage are
 * checked together.
 *
 * @param options.name    Label of the suite, e.g. the backend.
 * @param options.create  Factory for a service over fresh, empty repositories per test.
 */
export function describeKnowledgeRepositoryContract(options: KnowledgeRepositoryContractOptions): void {
    const { name, create } = options;

    describe(`knowledge repository contract: ${name}`, () => {
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

        describe('documents', () => {
            it('reads a missing document as undefined and OrFail rejects', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));

                expect(await service.findOneDocument('docs', 'missing')).toBeUndefined();
                expect(await service.findOneDocument('missing', 'missing')).toBeUndefined();
                await expect(service.findOneDocumentOrFail('docs', 'missing'))
                    .rejects.toMatchObject({ code: 'repository_not_found' });
                expect(await service.findDocumentIds('docs')).toEqual([]);
                expect(await service.findDocumentIds('missing')).toEqual([]);
            });

            it('refuses a document or chunks of a collection that does not exist', async () => {
                const service = await create();

                await expect(service.saveDocument(documentOf('missing', 'a')))
                    .rejects.toMatchObject({ code: 'repository_not_found' });
                await expect(service.replaceChunks('missing', 'a', 1, [chunkOf(0, [1, 0])]))
                    .rejects.toMatchObject({ code: 'repository_not_found' });
                expect(await service.findOneCollection('missing')).toBeUndefined();
            });

            it('saves, replaces and copies documents in and out', async () => {
                const service = await create();
                const input = documentOf('docs', 'a', {
                    title: 'A',
                    source: 'a.md',
                    metadata: { tags: ['x'], nested: { n: 1 } },
                });

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(input);
                (input.metadata!.tags as string[]).push('y');

                const read = await service.findOneDocumentOrFail('docs', 'a');

                expect(read).toEqual(documentOf('docs', 'a', {
                    title: 'A',
                    source: 'a.md',
                    metadata: { tags: ['x'], nested: { n: 1 } },
                }));
                expect(read.updatedAt).toBeInstanceOf(Date);

                (read.metadata!.nested as { n: number }).n = 2;

                expect((await service.findOneDocumentOrFail('docs', 'a')).metadata).toEqual({
                    tags: ['x'],
                    nested: { n: 1 },
                });

                await service.saveDocument(documentOf('docs', 'a', {
                    content: 'new',
                    hash: 'sha256:new',
                    generation: 2,
                }));

                const replaced = await service.findOneDocumentOrFail('docs', 'a');

                expect(replaced.content).toBe('new');
                expect(replaced.hash).toBe('sha256:new');
                expect(replaced.generation).toBe(2);
                expect(replaced.title).toBeUndefined();
                expect(await service.findDocumentIds('docs')).toEqual(['a']);
            });

            it('saves and reads a document\'s status and error', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', { status: 'pending' }));
                await service.saveDocument(documentOf('docs', 'b', { status: 'failed', error: 'rejected' }));

                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', { status: 'pending' }));
                expect(await service.findOneDocumentOrFail('docs', 'b')).toEqual(documentOf('docs', 'b', {
                    status: 'failed',
                    error: 'rejected',
                }));

                await service.saveDocument(documentOf('docs', 'b'));

                const replaced = await service.findOneDocumentOrFail('docs', 'b');

                expect(replaced.status).toBe('ready');
                expect(replaced.error).toBeUndefined();
            });

            it('findDocuments filters by status, pages by limit and offset and counts the total', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveCollection(collectionOf('other'));

                for (const [id, status] of [
                    ['\u{1F600}', 'pending'],
                    ['b', 'ready'],
                    ['�', 'ready'],
                    ['a', 'pending'],
                    ['B', 'failed'],
                ] as const) {
                    await service.saveDocument(documentOf('docs', id, { status }));
                }

                await service.saveDocument(documentOf('other', 'z', { status: 'pending' }));

                const ids = (page: { data: ContractKnowledgeDocument[] }) => page.data.map((document) => document.id);
                const all = await service.findDocuments('docs');

                expect(ids(all)).toEqual(['B', 'a', 'b', '�', '\u{1F600}']);
                expect(all.total).toBe(5);
                expect(all.data[0]).toEqual(documentOf('docs', 'B', { status: 'failed' }));

                const pending = await service.findDocuments('docs', { status: 'pending' });

                expect(ids(pending)).toEqual(['a', '\u{1F600}']);
                expect(pending.total).toBe(2);

                const page = await service.findDocuments('docs', { limit: 2, offset: 1 });

                expect(ids(page)).toEqual(['a', 'b']);
                expect(page.total).toBe(5);

                const ready = await service.findDocuments('docs', { status: 'ready', offset: 1 });

                expect(ids(ready)).toEqual(['�']);
                expect(ready.total).toBe(2);

                const beyond = await service.findDocuments('docs', { limit: 2, offset: 10 });

                expect(beyond).toEqual({ data: [], total: 5 });
                expect(await service.findDocuments('docs', { limit: 0 })).toEqual({ data: [], total: 5 });
                expect(await service.findDocuments('missing')).toEqual({ data: [], total: 0 });
            });

            it('copies documents out of findDocuments', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', { metadata: { n: 1 } }));

                const { data: [listed] } = await service.findDocuments('docs');

                listed!.status = 'failed';
                (listed!.metadata as { n: number }).n = 2;

                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', { metadata: { n: 1 } }));
            });

            it('updateDocument writes only while the hash, title and source match', async () => {
                const service = await create();
                const version = { hash: 'sha256:a', title: 'A' };

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', {
                    status: 'pending',
                    title: 'A',
                    metadata: { n: 1 },
                }));

                expect(await service.updateDocument('docs', 'a', { ...version, hash: 'sha256:other' }, { status: 'ready', generation: 5 })).toBe(false);
                expect(await service.updateDocument('docs', 'a', { ...version, title: 'B' }, { status: 'ready', generation: 5 })).toBe(false);
                expect(await service.updateDocument('docs', 'a', { hash: 'sha256:a' }, { status: 'ready', generation: 5 })).toBe(false);
                expect(await service.updateDocument('docs', 'a', { ...version, source: 'a.md' }, { status: 'ready', generation: 5 })).toBe(false);
                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', {
                    status: 'pending',
                    title: 'A',
                    metadata: { n: 1 },
                }));

                expect(await service.updateDocument('docs', 'a', version, { status: 'failed', error: 'rejected' })).toBe(true);
                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', {
                    status: 'failed',
                    error: 'rejected',
                    title: 'A',
                    metadata: { n: 1 },
                }));

                expect(await service.updateDocument('docs', 'a', version, { status: 'ready', generation: 3 })).toBe(true);

                const updated = await service.findOneDocumentOrFail('docs', 'a');

                expect(updated).toEqual(documentOf('docs', 'a', {
                    status: 'ready',
                    generation: 3,
                    title: 'A',
                    metadata: { n: 1 },
                }));
                expect(updated.error).toBeUndefined();
                expect(updated.content).toBe('content of a');
                expect(updated.updatedAt.getTime()).toBe(AT.getTime());
            });

            it('updateDocument answers false for a missing document', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));

                expect(await service.updateDocument('docs', 'missing', { hash: 'sha256:missing' }, { status: 'ready' })).toBe(false);
                expect(await service.updateDocument('missing', 'a', { hash: 'sha256:a' }, { status: 'ready' })).toBe(false);
                expect(await service.findOneDocument('docs', 'missing')).toBeUndefined();
                expect(await service.findDocuments('docs')).toEqual({ data: [], total: 0 });
            });

            it('updateDetails rewrites the document and its chunks of its own generation', async () => {
                const service = await create();
                const origin = { title: 'A', source: 'a.md' };

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', { ...origin, metadata: { n: 1 } }));
                await service.saveDocument(documentOf('docs', 'b', origin));
                await service.replaceChunks('docs', 'a', 1, [
                    chunkOf(0, [1, 0], 'a0', origin),
                    chunkOf(1, [1, 0], 'a1', origin),
                ]);
                await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0], 'a0', origin)]);
                await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0], 'b0', origin)]);

                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', ...origin }, { title: 'B', metadata: { n: 2 } })).toBe(true);

                const updated = await service.findOneDocumentOrFail('docs', 'a');

                // an absent source is removed, everything but the details and updatedAt is kept
                expect(updated).toEqual({
                    ...documentOf('docs', 'a', { title: 'B', metadata: { n: 2 } }),
                    updatedAt: expect.any(Date),
                });
                expect(updated.source).toBeUndefined();

                // absent metadata is removed too
                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', title: 'B' }, { title: 'B' })).toBe(true);
                expect((await service.findOneDocumentOrFail('docs', 'a')).metadata).toBeUndefined();

                const details = (matches: Array<{
                    document: string;
                    title?: string;
                    source?: string
                }>) => matches
                    .map((match) => [match.document, match.title, match.source]);

                expect(details(await service.search('docs', 1, [1, 0], { topK: 10 }))).toEqual([
                    ['a', 'B', undefined],
                    ['a', 'B', undefined],
                    ['b', 'A', 'a.md'],
                ]);
                // another generation's chunks keep the details they were written with
                expect(details(await service.search('docs', 2, [1, 0], { topK: 10 }))).toEqual([['a', 'A', 'a.md']]);
                expect(await service.findOneDocumentOrFail('docs', 'b')).toEqual(documentOf('docs', 'b', origin));
            });

            it('updateDetails keeps the scores of the document\'s chunks', async () => {
                const service = await create();
                const origin = { title: 'A', source: 'a.md' };

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', origin));
                await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 2], 'a0', origin), chunkOf(1, [3, 1], 'a1', origin)]);

                const before = await service.search('docs', 1, [1, 1], { topK: 10 });

                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', ...origin }, {})).toBe(true);

                const after = await service.search('docs', 1, [1, 1], { topK: 10 });

                expect(after.map((m) => [m.index, m.text, m.score])).toEqual(before.map((m) => [m.index, m.text, m.score]));
                expect(after.every((m) => m.title === undefined && m.source === undefined)).toBe(true);
            });

            it('updateDetails during a re-embed leaves the served old text under its old details', async () => {
                const service = await create();
                const origin = { title: 'A', source: 'a.md' };

                await service.saveCollection(collectionOf('docs'));
                // generation 1 still serves the old text; the re-embed wrote the new text at generation 2 and made it ready there
                await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'old text', origin)]);
                await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0], 'new text', origin)]);
                await service.saveDocument(documentOf('docs', 'a', { ...origin, generation: 2 }));

                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', ...origin }, { title: 'B' })).toBe(true);

                const served = (generation: number) => service.search('docs', generation, [1, 0], { topK: 10 })
                    .then((matches) => matches.map((match) => [match.text, match.title, match.source]));

                // new details never next to the old text
                expect(await served(1)).toEqual([['old text', 'A', 'a.md']]);
                expect(await served(2)).toEqual([['new text', 'B', undefined]]);
            });

            it('updateDetails on a document that is not ready leaves its chunks', async () => {
                const service = await create();
                const origin = { title: 'A', source: 'a.md' };

                await service.saveCollection(collectionOf('docs'));
                await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'old', origin)]);
                await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0], 'old', origin)]);
                await service.saveDocument(documentOf('docs', 'a', { status: 'pending', title: 'B' }));
                await service.saveDocument(documentOf('docs', 'b', { status: 'failed', title: 'B' }));

                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', title: 'B' }, { title: 'B', metadata: { n: 2 } })).toBe(true);
                expect(await service.updateDetails('docs', 'b', { hash: 'sha256:b', title: 'B' }, { title: 'C' })).toBe(true);

                expect(await service.findOneDocumentOrFail('docs', 'a')).toMatchObject({
                    status: 'pending',
                    title: 'B',
                    metadata: { n: 2 },
                });
                expect(await service.findOneDocumentOrFail('docs', 'b')).toMatchObject({ status: 'failed', title: 'C' });
                expect((await service.search('docs', 1, [1, 0], { topK: 10 })).map((match) => [match.document, match.title]))
                    .toEqual([['a', 'A'], ['b', 'A']]);
            });

            it('updateDetails with a stale version changes nothing', async () => {
                const service = await create();
                const origin = { title: 'A', source: 'a.md' };

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', origin));
                await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'a0', origin)]);

                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:other', ...origin }, { title: 'B' })).toBe(false);
                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', title: 'A' }, { title: 'B' })).toBe(false);
                expect(await service.updateDetails('docs', 'a', { hash: 'sha256:a', source: 'a.md' }, { title: 'B' })).toBe(false);
                expect(await service.updateDetails('docs', 'missing', { hash: 'sha256:missing' }, { title: 'B' })).toBe(false);
                expect(await service.updateDetails('missing', 'a', { hash: 'sha256:a', ...origin }, { title: 'B' })).toBe(false);

                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', origin));
                expect(await service.findOneDocument('docs', 'missing')).toBeUndefined();
                expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toMatchObject([{ title: 'A', source: 'a.md' }]);
            });

            it('updateDetails with a status checks it too', async () => {
                const service = await create();
                const origin = { title: 'A', source: 'a.md' };

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', {
                    ...origin,
                    status: 'failed',
                    error: 'refused',
                }));

                expect(await service.updateDetails('docs', 'a', {
                    hash: 'sha256:a',
                    ...origin,
                    status: 'pending',
                }, { ...origin, metadata: { n: 2 } })).toBe(false);
                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', {
                    ...origin,
                    status: 'failed',
                    error: 'refused',
                }));

                expect(await service.updateDetails('docs', 'a', {
                    hash: 'sha256:a',
                    ...origin,
                    status: 'failed',
                }, { ...origin, metadata: { n: 2 } })).toBe(true);
                expect((await service.findOneDocumentOrFail('docs', 'a')).metadata).toEqual({ n: 2 });
            });

            it('requeueGeneration sets the documents of one generation pending at another, of that collection only', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveCollection(collectionOf('other'));
                await service.saveDocument(documentOf('docs', 'a', { generation: 2, title: 'A' }));
                await service.saveDocument(documentOf('docs', 'b', {
                    generation: 2,
                    status: 'failed',
                    error: 'refused',
                }));
                await service.saveDocument(documentOf('docs', 'c', { generation: 2, status: 'pending' }));
                await service.saveDocument(documentOf('docs', 'd'));
                await service.saveDocument(documentOf('other', 'a', { generation: 2 }));
                await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0])]);

                expect(await service.requeueGeneration('docs', 2, 1, 10)).toBe(3);

                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', {
                    generation: 1,
                    status: 'pending',
                    title: 'A',
                }));

                const failed = await service.findOneDocumentOrFail('docs', 'b');

                expect(failed).toEqual(documentOf('docs', 'b', { generation: 1, status: 'pending' }));
                expect(failed.error).toBeUndefined();
                expect(await service.findOneDocumentOrFail('docs', 'c')).toEqual(documentOf('docs', 'c', { generation: 1, status: 'pending' }));
                expect(await service.findOneDocumentOrFail('docs', 'd')).toEqual(documentOf('docs', 'd'));
                expect(await service.findOneDocumentOrFail('other', 'a')).toEqual(documentOf('other', 'a', { generation: 2 }));
                // chunks are not touched
                expect(await service.search('docs', 2, [1, 0], { topK: 10 })).toHaveLength(1);

                expect(await service.requeueGeneration('docs', 2, 1, 10)).toBe(0);
                expect(await service.requeueGeneration('missing', 2, 1, 10)).toBe(0);
            });

            it('requeueGeneration refuses the same generation as source and target and changes nothing', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a', { status: 'failed', error: 'refused' }));

                // a page that never leaves the selection: a caller draining until 0 would never end
                await expect(service.requeueGeneration('docs', 1, 1, 10)).rejects.toMatchObject({ code: 'validation_error' });
                await expect(service.requeueGeneration('missing', 1, 1, 10)).rejects.toMatchObject({ code: 'validation_error' });
                expect(await service.findOneDocumentOrFail('docs', 'a')).toEqual(documentOf('docs', 'a', { status: 'failed', error: 'refused' }));
            });

            it('requeueGeneration requeues at most a page per call, in id order, until none is left', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));

                for (const id of ['e', 'c', 'a', 'd', 'b']) {
                    await service.saveDocument(documentOf('docs', id, { generation: 2 }));
                }

                const atServed = async () => (await service.findDocuments('docs', { status: 'pending' })).data.map((document) => document.id);

                expect(await service.requeueGeneration('docs', 2, 1, 2)).toBe(2);
                expect(await atServed()).toEqual(['a', 'b']);
                expect(await service.requeueGeneration('docs', 2, 1, 2)).toBe(2);
                expect(await service.requeueGeneration('docs', 2, 1, 2)).toBe(1);
                expect(await service.requeueGeneration('docs', 2, 1, 2)).toBe(0);
                expect(await atServed()).toEqual(['a', 'b', 'c', 'd', 'e']);
                expect((await service.findDocuments('docs')).data.every((document) => document.generation === 1)).toBe(true);
            });

            it('lists document ids in code point order, per collection', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveCollection(collectionOf('other'));

                for (const id of ['sub/b.md', '\u{1F600}', 'a.md', '�', 'A.md']) {
                    await service.saveDocument(documentOf('docs', id));
                }

                await service.saveDocument(documentOf('other', 'z.md'));

                expect(await service.findDocumentIds('docs')).toEqual(['A.md', 'a.md', 'sub/b.md', '�', '\u{1F600}']);
                expect(await service.findDocumentIds('other')).toEqual(['z.md']);
            });

            it('deletes a document with its chunks of every generation', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.saveDocument(documentOf('docs', 'a'));
                await service.saveDocument(documentOf('docs', 'b'));
                await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
                await service.replaceChunks('docs', 'a', 2, [chunkOf(0, [1, 0])]);
                await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0])]);

                expect(await service.deleteDocument('docs', 'a')).toBe(true);
                expect(await service.deleteDocument('docs', 'a')).toBe(false);
                expect(await service.findOneDocument('docs', 'a')).toBeUndefined();
                expect(await service.findDocumentIds('docs')).toEqual(['b']);
                expect((await service.search('docs', 1, [1, 0], { topK: 10 })).map((match) => match.document))
                    .toEqual(['b']);
                expect(await service.search('docs', 2, [1, 0], { topK: 10 })).toEqual([]);
            });

            it('deletes the chunks of a document whose record was never saved', async () => {
                const service = await create();

                await service.saveCollection(collectionOf('docs'));
                await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);

                expect(await service.deleteDocument('docs', 'a')).toBe(false);
                expect(await service.search('docs', 1, [1, 0], { topK: 10 })).toEqual([]);
            });
        });

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
    });
}
