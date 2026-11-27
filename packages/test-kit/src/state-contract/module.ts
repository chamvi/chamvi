/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import { defineQuery, eq } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { IStateDocumentRepository, IStateRepository } from '@chamvi/store';
import type { StateDocument, StateEntry } from '@chamvi/core-kit';
import { testUuid } from '../fixture/helpers.ts';
import type { StateRepositoryContractInput } from './types.ts';

let sequence = 0;

/** A fresh uuid-shaped storage id. */
function nextId(): string {
    sequence += 1;

    return testUuid(`s${sequence}`);
}

async function set(entries: IStateRepository, agent: string, key: string, value: unknown): Promise<StateEntry> {
    return entries.upsert(entries.create({
        id: nextId(),
        agent,
        key,
        value,
    }));
}

async function put(documents: IStateDocumentRepository, agent: string, collection: string, documentId: string, doc: unknown): Promise<StateDocument> {
    return documents.upsert(documents.create({
        id: nextId(),
        agent,
        collection,
        documentId,
        doc,
    }));
}

/** The query the state service lists an agent's keys with: by key. */
function keysOf(agent: string, page: { limit?: number; offset?: number } = {}) {
    return defineQuery({
        filters: eq('agent', agent),
        sorts: { key: 'ASC' },
        pagination: page,
    });
}

/**
 * The storage behaviour of an `IStateRepository` and an
 * `IStateDocumentRepository`: values stored as given, `upsert` replacing
 * by the natural key and keeping the stored id, keys and document ids in
 * code-point order, `findContaining` with top-level equality, paging and
 * total, copies and concurrent upserts.
 */
export function describeStateRepositoryContract(input: StateRepositoryContractInput): void {
    describe(`state repository contract: ${input.name}`, () => {
        let entries: IStateRepository;
        let documents: IStateDocumentRepository;

        beforeEach(async () => {
            ({ entries, documents } = await input.create());
        });

        it('stores a key\'s value as given; falsy values are present; one agent\'s key is not another\'s', async () => {
            await set(entries, 'a', 'k', { n: [1, 'two'] });

            expect((await entries.findOneBy({ agent: 'a', key: 'k' }))!.value).toEqual({ n: [1, 'two'] });
            expect(await entries.findOneBy({ agent: 'b', key: 'k' })).toBeNull();

            for (const value of [null, false, 0, '']) {
                await set(entries, 'a', 'falsy', value);
                expect((await entries.findOneBy({ agent: 'a', key: 'falsy' }))!.value).toBe(value);
            }
        });

        it('upsert of a key replaces its value, keeps the stored id and resolves the next read', async () => {
            const first = await set(entries, 'a', 'k', 1);
            const second = await set(entries, 'a', 'k', 2);
            const read = await entries.findOneBy({ agent: 'a', key: 'k' });

            expect(second).toStrictEqual(read);
            expect(second.id).toBe(first.id);
            expect(read!.value).toBe(2);
            expect((await entries.findMany(keysOf('a'))).meta.total).toBe(1);
        });

        it('a created entry whose key the agent holds is EntityConflictError', async () => {
            await set(entries, 'a', 'k', 1);

            await expect(entries.save(entries.create({
                id: nextId(),
                agent: 'a',
                key: 'k',
                value: 2,
            }))).rejects.toBeInstanceOf(EntityConflictError);
        });

        it('removes a key', async () => {
            await set(entries, 'a', 'k', 1);
            await entries.remove((await entries.findOneBy({ agent: 'a', key: 'k' }))!);
            expect(await entries.findOneBy({ agent: 'a', key: 'k' })).toBeNull();
        });

        it('lists one agent\'s keys in code-point order, with pages and the total', async () => {
            for (const key of ['b', 'a-1', 'B', 'a', '\u{1F600}', '�', 'z']) {
                await set(entries, 'triage', key, key);
            }

            await set(entries, 'other', 'x', true);

            const all = await entries.findMany(keysOf('triage'));

            expect(all.data.map((entry) => entry.key)).toEqual(['B', 'a', 'a-1', 'b', 'z', '�', '\u{1F600}']);
            expect(all.meta.total).toBe(7);

            const page = await entries.findMany(keysOf('triage', { limit: 2, offset: 5 }));

            expect(page.data.map((entry) => entry.key)).toEqual(['�', '\u{1F600}']);
            expect(page.meta.total).toBe(7);
        });

        it('copies values in and out', async () => {
            const value = { n: [1] };

            await set(entries, 'a', 'k', value);
            value.n.push(2);

            const read = (await entries.findOneBy({ agent: 'a', key: 'k' }))!;

            expect(read.value).toEqual({ n: [1] });
            (read.value as { n: number[] }).n.push(3);
            expect((await entries.findOneBy({ agent: 'a', key: 'k' }))!.value).toEqual({ n: [1] });
        });

        it('concurrent upserts of one key all resolve and leave one entry', async () => {
            const results = await Promise.all(Array.from({ length: 20 }, (_, i) => set(entries, 'a', 'k', i)));
            const stored = (await entries.findOneBy({ agent: 'a', key: 'k' }))!;

            expect(new Set(results.map((entry) => entry.id))).toEqual(new Set([stored.id]));
            expect((await entries.findMany(keysOf('a'))).meta.total).toBe(1);
        });

        it('upsert of a document replaces it, keeps the stored id and resolves the next read; a null document is stored', async () => {
            const first = await put(documents, 'a', 'todos', '1', { title: 'x' });
            const second = await put(documents, 'a', 'todos', '1', { title: 'y' });
            const read = await documents.findOneBy({
                agent: 'a',
                collection: 'todos',
                documentId: '1',
            });

            expect(second).toStrictEqual(read);
            expect(second.id).toBe(first.id);
            expect(read!.doc).toEqual({ title: 'y' });
            expect((await put(documents, 'a', 'todos', 'n', null)).doc).toBeNull();
            expect((await documents.findContaining('a', 'todos', {}, {})).meta.total).toBe(2);
        });

        it('a created document whose id its collection holds is EntityConflictError; another collection or agent may hold it', async () => {
            await put(documents, 'a', 'todos', '1', 1);
            await put(documents, 'a', 'notes', '1', 2);
            await put(documents, 'b', 'todos', '1', 3);

            await expect(documents.save(documents.create({
                id: nextId(),
                agent: 'a',
                collection: 'todos',
                documentId: '1',
                doc: 4,
            }))).rejects.toBeInstanceOf(EntityConflictError);
        });

        it('findContaining matches by top-level equality: scalars, objects and arrays exactly, null an explicit null, undefined an absent key', async () => {
            await put(documents, 'a', 'c', 'd1', {
                status: 'open',
                n: 1,
                flag: true,
                meta: { x: 1 },
                tags: ['a', 'b'],
            });
            await put(documents, 'a', 'c', 'd2', {
                status: 'open',
                n: 2,
                meta: { x: 1, y: 2 },
                tags: ['a'],
            });
            await put(documents, 'a', 'c', 'd3', { status: null, n: '2' });
            await put(documents, 'a', 'c', 'd4', { n: 2 });
            await put(documents, 'a', 'c', 'd5', [1]);
            await put(documents, 'a', 'c', 'd6', null);
            await put(documents, 'a', 'c', 'd7', 'text');
            await put(documents, 'a', 'other', 'd8', { status: 'open' });
            await put(documents, 'b', 'c', 'd9', { status: 'open' });

            const ids = async (where: Record<string, unknown>) => (await documents.findContaining('a', 'c', where, {})).data
                .map((document) => document.documentId);

            await expect(ids({})).resolves.toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
            await expect(ids({ status: 'open' })).resolves.toEqual(['d1', 'd2']);
            await expect(ids({ n: 2 })).resolves.toEqual(['d2', 'd4']);
            await expect(ids({ flag: true })).resolves.toEqual(['d1']);
            await expect(ids({ status: null })).resolves.toEqual(['d3']);
            await expect(ids({ status: undefined })).resolves.toEqual(['d4']);
            await expect(ids({ status: undefined, n: 2 })).resolves.toEqual(['d4']);
            await expect(ids({ meta: { x: 1 } })).resolves.toEqual(['d1']);
            await expect(ids({ tags: ['a'] })).resolves.toEqual(['d2']);
            await expect(ids({ tags: 'a' })).resolves.toEqual([]);
            await expect(ids({ status: 'OPEN' })).resolves.toEqual([]);
            await expect(ids({ missing: 1 })).resolves.toEqual([]);
        });

        it('findContaining orders by document id in code-point order, with pages and the total of the whole selection', async () => {
            for (const documentId of ['b', 'B', '\u{1F600}', 'a', '�', 'c']) {
                await put(documents, 'a', 'c', documentId, { kind: documentId === 'c' ? 'other' : 'kept' });
            }

            const all = await documents.findContaining('a', 'c', { kind: 'kept' }, {});

            expect(all.data.map((document) => document.documentId)).toEqual(['B', 'a', 'b', '�', '\u{1F600}']);
            expect(all.meta.total).toBe(5);

            const page = await documents.findContaining('a', 'c', { kind: 'kept' }, { limit: 2, offset: 1 });

            expect(page.data.map((document) => document.documentId)).toEqual(['a', 'b']);
            expect(page.meta.total).toBe(5);
            expect((await documents.findContaining('a', 'c', {}, { limit: 1 })).meta.total).toBe(6);
        });

        it('copies documents in and out', async () => {
            const doc = { n: [1] };

            await put(documents, 'a', 'c', '1', doc);
            doc.n.push(2);

            const [read] = (await documents.findContaining('a', 'c', {}, {})).data;

            expect(read!.doc).toEqual({ n: [1] });
            (read!.doc as { n: number[] }).n.push(3);
            expect((await documents.findContaining('a', 'c', {}, {})).data[0]!.doc).toEqual({ n: [1] });
        });

        it('concurrent upserts of one document all resolve and leave one document', async () => {
            const results = await Promise.all(Array.from({ length: 20 }, (_, i) => put(documents, 'a', 'c', '1', { i })));
            const stored = (await documents.findOneBy({
                agent: 'a',
                collection: 'c',
                documentId: '1',
            }))!;

            expect(new Set(results.map((document) => document.id))).toEqual(new Set([stored.id]));
            expect((await documents.findContaining('a', 'c', {}, {})).meta.total).toBe(1);
        });
    });
}
