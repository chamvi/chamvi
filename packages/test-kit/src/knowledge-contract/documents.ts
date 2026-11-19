/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ContractKnowledgeDocument, KnowledgeRepositoryContractOptions } from './types.ts';
import { chunkOf, collectionOf, documentOf } from './helpers.ts';
import { AT } from './constants.ts';
import { registerKnowledgeDocumentUpdateCases } from './document-updates.ts';

/** The document cases of the knowledge contract. */
export function describeKnowledgeDocumentsContract(create: KnowledgeRepositoryContractOptions['create']): void {
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

        registerKnowledgeDocumentUpdateCases(create);

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
}
