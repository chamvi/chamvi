/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    and,
    defineQuery,
    eq,
    inArray,
    or,
} from '@rapiq/core';
import { MemoryRegistry, MemoryStateDocumentRepository, MemoryStateRepository } from '@chamvi/store-memory';
import { 
    type IStateService, 
    RepositoryNotFoundError, 
    StateService, 
    ValidationError, 
} from '../../../src/index.ts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('StateService', () => {
    let repository: MemoryStateRepository;
    let documentRepository: MemoryStateDocumentRepository;
    let state: IStateService;

    beforeEach(() => {
        const registry = new MemoryRegistry();

        repository = new MemoryStateRepository({ registry });
        documentRepository = new MemoryStateDocumentRepository({ registry });
        state = new StateService({ repository, documentRepository });
    });

    it('sets and reads one agent\'s keys; falsy values are present; set returns what the next read returns', async () => {
        expect(await state.findOne('a', 'k')).toBeUndefined();
        expect(await state.set('a', 'k', { n: 1 })).toStrictEqual({ n: 1 });
        expect(await state.findOne('a', 'k')).toStrictEqual({ n: 1 });
        expect(await state.findOne('b', 'k')).toBeUndefined();

        for (const value of [null, false, 0, '']) {
            expect(await state.set('a', 'key', value)).toBe(value);
            expect(await state.findOneOrFail('a', 'key')).toBe(value);
        }
    });

    it('set undefined removes the key; removing an absent key is a no-op', async () => {
        await state.set('a', 'k', 1);
        expect(await state.set('a', 'k', undefined)).toBeUndefined();
        expect(await state.findOne('a', 'k')).toBeUndefined();
        expect(await state.find('a')).toEqual([]);
        await expect(state.set('a', 'absent', undefined)).resolves.toBeUndefined();
    });

    it('gives each key a uuid v7 storage id, kept by later sets', async () => {
        await state.set('a', 'k', 1);

        const { id } = (await repository.findOneBy({ agent: 'a', key: 'k' }))!;

        expect(id).toMatch(UUID_V7);
        await state.set('a', 'k', 2);
        expect((await repository.findOneBy({ agent: 'a', key: 'k' }))!.id).toBe(id);
    });

    it('findOneOrFail and findOrFail throw RepositoryNotFoundError with today\'s message, also for an empty page', async () => {
        for (const read of [() => state.findOneOrFail('a', 'missing'), () => state.findOrFail('a')]) {
            const error = await read().catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(RepositoryNotFoundError);
            expect(error).toMatchObject({ message: 'No matching state were found.' });
        }

        await state.set('a', 'key', 'value');
        await expect(state.findOrFail('a', { offset: 1 })).rejects.toMatchObject({ code: 'repository_not_found' });
        expect(await state.findOrFail('a')).toEqual([{ key: 'key', value: 'value' }]);
    });

    it('find lists one agent\'s keys in code-point order with limit and offset; limit 0 is empty', async () => {
        for (const key of ['b', 'a-1', 'B', 'a', '\u{1F600}', '�', 'z']) {
            await state.set('triage', key, key.length);
        }

        await state.set('other', 'x', true);
        await state.set('triage', 'gone', 1);
        await state.set('triage', 'gone', undefined);

        expect((await state.find('triage')).map((entry) => entry.key)).toEqual(['B', 'a', 'a-1', 'b', 'z', '�', '\u{1F600}']);
        expect(await state.find('triage', { limit: 2, offset: 1 })).toEqual([{ key: 'a', value: 1 }, { key: 'a-1', value: 3 }]);
        expect(await state.find('triage', { offset: 5, limit: 1 })).toEqual([{ key: '�', value: 1 }]);
        expect(await state.find('triage', { limit: 0 })).toEqual([]);
        expect(await state.find('nobody')).toEqual([]);
    });

    it('list pages one agent\'s keys by a rapiq query, in code-point order after the query\'s sorts', async () => {
        for (const key of ['b', 'B', 'a', 'é']) {
            await state.set('triage', key, key.length);
        }

        await state.set('other', 'x', true);

        const keys = async (query: Parameters<typeof defineQuery>[0]) => (await state.list('triage', defineQuery(query))).map((entry) => entry.key);

        await expect(keys({})).resolves.toEqual(['B', 'a', 'b', 'é']);
        await expect(keys({ pagination: { limit: 2, offset: 1 } })).resolves.toEqual(['a', 'b']);
        await expect(keys({ pagination: { offset: 3 } })).resolves.toEqual(['é']);
        await expect(keys({ pagination: { limit: 0 } })).resolves.toEqual([]);
        await expect(keys({ sorts: { key: 'DESC' } })).resolves.toEqual(['é', 'b', 'a', 'B']);
        await expect(keys({ filters: eq('key', 'a') })).resolves.toEqual(['a']);
        expect(await state.list('nobody', defineQuery({}))).toEqual([]);
    });

    it('listDocuments reads top-level eq filters as the equality where, pages, and refuses any other condition or a sort', async () => {
        await state.upsertDocument('a', 'todos', '2', { title: 'y', done: true });
        await state.upsertDocument('a', 'todos', '1', { title: 'x', done: false });
        await state.upsertDocument('a', 'todos', '3', { title: null, done: true });
        await state.upsertDocument('b', 'todos', '1', { title: 'other', done: true });

        const ids = async (query: Parameters<typeof defineQuery>[0]) => (await state.listDocuments('a', 'todos', defineQuery(query)))
            .map((document) => document.id);

        await expect(ids({})).resolves.toEqual(['1', '2', '3']);
        await expect(ids({ filters: eq('done', true) })).resolves.toEqual(['2', '3']);
        await expect(ids({ filters: and(eq('done', true), eq('title', null)) })).resolves.toEqual(['3']);
        await expect(ids({ filters: eq('done', true), pagination: { limit: 1 } })).resolves.toEqual(['2']);
        await expect(ids({ pagination: { limit: 1, offset: 1 } })).resolves.toEqual(['2']);
        await expect(ids({ pagination: { limit: 0 } })).resolves.toEqual([]);
        expect(await state.listDocuments('a', 'todos', defineQuery({ filters: eq('title', 'x') }))).toEqual([{ id: '1', doc: { title: 'x', done: false } }]);

        for (const query of [
            { filters: inArray('done', [true]) },
            { filters: or(eq('done', true), eq('title', 'x')) },
            { filters: and(eq('done', true), eq('done', false)) },
            { sorts: { title: 'ASC' as const } },
        ]) {
            await expect(state.listDocuments('a', 'todos', defineQuery(query))).rejects.toBeInstanceOf(ValidationError);
        }
    });

    it('stores documents, replaces one by id, deletes it, and returns from upsert what the next read returns', async () => {
        expect(await state.upsertDocument('a', 'todos', '1', { title: 'x' })).toStrictEqual({ id: '1', doc: { title: 'x' } });
        expect(await state.upsertDocument('a', 'todos', '1', { title: 'y' })).toStrictEqual({ id: '1', doc: { title: 'y' } });
        expect(await state.findDocuments('a', 'todos')).toStrictEqual([{ id: '1', doc: { title: 'y' } }]);
        await state.deleteDocument('a', 'todos', '1');
        expect(await state.findDocuments('a', 'todos')).toEqual([]);
        await expect(state.deleteDocument('a', 'todos', 'absent')).resolves.toBeUndefined();
    });

    it('stores an undefined document as null', async () => {
        expect(await state.upsertDocument('a', 'c', 'u', undefined)).toStrictEqual({ id: 'u', doc: null });
        expect(await state.findDocuments('a', 'c')).toStrictEqual([{ id: 'u', doc: null }]);
    });

    it('findDocuments matches by top-level equality, orders by document id and respects limit', async () => {
        await state.upsertDocument('a', 'todos', '3', {
            title: 'z',
            done: true,
            meta: { x: 1 },
        });
        await state.upsertDocument('a', 'todos', '1', { title: 'x', done: false });
        await state.upsertDocument('a', 'todos', '2', {
            title: 'y',
            done: true,
            meta: { x: 1, y: 2 },
        });
        await state.upsertDocument('a', 'todos', '4', { title: null });
        await state.upsertDocument('b', 'todos', '1', { title: 'other', done: true });

        const ids = async (options: { where?: Record<string, unknown>; limit?: number }) => (await state.findDocuments('a', 'todos', options))
            .map((document) => document.id);

        await expect(ids({})).resolves.toEqual(['1', '2', '3', '4']);
        await expect(ids({ where: { done: true } })).resolves.toEqual(['2', '3']);
        await expect(ids({ where: { done: true }, limit: 1 })).resolves.toEqual(['2']);
        await expect(ids({ where: { meta: { x: 1 } } })).resolves.toEqual(['3']);
        await expect(ids({ where: { title: null } })).resolves.toEqual(['4']);
        await expect(ids({ where: { done: undefined } })).resolves.toEqual(['4']);
        await expect(ids({ limit: 0 })).resolves.toEqual([]);
    });

    it('findDocumentsOrFail throws RepositoryNotFoundError with today\'s message when nothing matches', async () => {
        await expect(state.findDocumentsOrFail('a', 'notes')).rejects.toMatchObject({ message: 'No matching documents were found.' });
        await state.upsertDocument('a', 'notes', '1', { title: 'first' });
        await expect(state.findDocumentsOrFail('a', 'notes', { where: { title: 'absent' } })).rejects.toBeInstanceOf(RepositoryNotFoundError);
        expect(await state.findDocumentsOrFail('a', 'notes', { where: { title: 'first' } })).toEqual([{ id: '1', doc: { title: 'first' } }]);
    });

    it('gives each document a uuid v7 storage id, kept by later upserts', async () => {
        await state.upsertDocument('a', 'c', 'd', 1);

        const { id } = (await documentRepository.findOneBy({
            agent: 'a',
            collection: 'c',
            documentId: 'd',
        }))!;

        expect(id).toMatch(UUID_V7);
        await state.upsertDocument('a', 'c', 'd', 2);
        expect((await documentRepository.findOneBy({
            agent: 'a',
            collection: 'c',
            documentId: 'd',
        }))!.id).toBe(id);
    });

    it('concurrent sets of one key and upserts of one document all resolve and leave one row each', async () => {
        await Promise.all([
            ...Array.from({ length: 10 }, (_, i) => state.set('a', 'k', i)),
            ...Array.from({ length: 10 }, (_, i) => state.upsertDocument('a', 'c', 'd', { i })),
        ]);

        expect(await state.find('a')).toHaveLength(1);
        expect(await state.findDocuments('a', 'c')).toHaveLength(1);
    });

    it('copies values and documents in and out', async () => {
        const value = { n: [1] };
        const doc = { n: [1] };

        await state.set('a', 'k', value);
        await state.upsertDocument('a', 'c', '1', doc);
        value.n.push(2);
        doc.n.push(2);

        const read = (await state.findOne('a', 'k')) as { n: number[] };
        const [document] = await state.findDocuments('a', 'c');

        expect(read).toEqual({ n: [1] });
        expect(document!.doc).toEqual({ n: [1] });
        read.n.push(3);
        (document!.doc as { n: number[] }).n.push(3);
        expect(await state.findOne('a', 'k')).toEqual({ n: [1] });
        expect((await state.findDocuments('a', 'c'))[0]!.doc).toEqual({ n: [1] });
    });
});
