/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import type { KnowledgeRepositoryContractOptions } from './types.ts';
import { chunkOf, collectionOf, documentOf } from './helpers.ts';

/** The `updateDetails` and `requeueGeneration` cases of the knowledge contract's documents. */
export function registerKnowledgeDocumentUpdateCases(create: KnowledgeRepositoryContractOptions['create']): void {
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
}
