/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery } from '@rapiq/core';
import { describe, expect, it } from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';

type Item = {
    id: string;
    code?: string;
    meta?: Record<string, unknown>;
    big?: bigint;
    n?: number;
};

function repositoryOf(options: { upsertKey?: (keyof Item)[] } = {}): MemoryEntityRepository<Item> {
    return new MemoryEntityRepository<Item>({
        entity: 'item',
        registry: new MemoryRegistry(),
        key: ['id'],
        unique: [['code'], ['meta'], ['big']],
        ...options,
    });
}

async function insert(items: MemoryEntityRepository<Item>, item: Item): Promise<Item> {
    return items.save(items.create(item));
}

describe('memory unique-value index', () => {
    it('follows a row whose unique value an update changed', async () => {
        const items = repositoryOf();

        await insert(items, { id: '1', code: 'a' });

        const read = (await items.findOneBy({ code: 'a' }))!;

        items.merge(read, { code: 'b' });
        await items.save(read);

        expect(await items.findOneBy({ code: 'a' })).toBeNull();
        expect(await items.findOneBy({ code: 'b' })).toEqual({ id: '1', code: 'b' });
        await expect(insert(items, { id: '2', code: 'a' })).resolves.toEqual({ id: '2', code: 'a' });
        await expect(insert(items, { id: '3', code: 'b' })).rejects.toBeInstanceOf(EntityConflictError);
    });

    it('forgets a removed row', async () => {
        const items = repositoryOf();

        await insert(items, { id: '1', code: 'a' });
        await items.remove((await items.findOneBy({ code: 'a' }))!);

        expect(await items.findOneBy({ code: 'a' })).toBeNull();
        await expect(insert(items, { id: '2', code: 'a' })).resolves.toEqual({ id: '2', code: 'a' });
    });

    it('keeps the committed values of a transaction that aborted', async () => {
        const items = repositoryOf();

        await insert(items, { id: '1', code: 'a' });
        await expect(items.transaction(async (repository) => {
            const read = (await repository.findOneBy({ code: 'a' }))!;

            repository.merge(read, { code: 'b' });
            await repository.save(read);
            await repository.save(repository.create({ id: '2', code: 'c' }));

            throw new Error('abort');
        })).rejects.toThrow('abort');

        expect(await items.findOneBy({ code: 'a' })).toEqual({ id: '1', code: 'a' });
        expect(await items.findOneBy({ code: 'b' })).toBeNull();
        expect(await items.findOneBy({ code: 'c' })).toBeNull();
        await expect(insert(items, { id: '3', code: 'a' })).rejects.toBeInstanceOf(EntityConflictError);
        await expect(insert(items, { id: '3', code: 'b' })).resolves.toEqual({ id: '3', code: 'b' });
    });

    it('upsert by the upsert key replaces the row holding the value and keeps its stored key', async () => {
        const items = repositoryOf({ upsertKey: ['code'] });

        await items.upsert(items.create({
            id: '1',
            code: 'a',
            n: 1,
        }));

        expect(await items.upsert(items.create({
            id: '2',
            code: 'a',
            n: 2,
        }))).toEqual({
            id: '1',
            code: 'a',
            n: 2,
        });
        expect(await items.findOneById('2')).toBeNull();
        expect(await items.findOneBy({ code: 'a' })).toEqual({
            id: '1',
            code: 'a',
            n: 2,
        });
    });

    it('findMany orders strings by code point, as a database collating "C"', async () => {
        const items = repositoryOf();

        for (const [id, code] of [['1', '\u{1F600}'], ['2', '�'], ['3', 'b'], ['4', 'B']]) {
            await insert(items, { id: id!, code });
        }

        const { data } = await items.findMany(defineQuery({ sorts: { code: 'ASC' } }));

        expect(data.map((item) => item.code)).toEqual(['B', 'b', '�', '\u{1F600}']);
    });

    it('a non-primitive unique value conflicts by deep equality, whatever its key order', async () => {
        const items = repositoryOf();

        await insert(items, { id: '1', meta: { a: 1, b: [2] } });

        await expect(insert(items, { id: '2', meta: { b: [2], a: 1 } })).rejects.toBeInstanceOf(EntityConflictError);
        expect(await items.findOneBy({ meta: { b: [2], a: 1 } })).toEqual({ id: '1', meta: { a: 1, b: [2] } });
        await expect(insert(items, { id: '3', meta: { a: 1, b: [3] } })).resolves.toEqual({ id: '3', meta: { a: 1, b: [3] } });
    });

    it('concurrent saves of one non-primitive unique value in two key orders: exactly one is stored', async () => {
        const items = repositoryOf();
        const results = await Promise.allSettled([
            insert(items, { id: '1', meta: { a: 1, b: 2 } }),
            insert(items, { id: '2', meta: { b: 2, a: 1 } }),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(EntityConflictError);
    });

    it('a bigint unique value is stored, found and conflicts', async () => {
        const items = repositoryOf();

        await insert(items, { id: '1', big: 10n });

        expect(await items.findOneBy({ big: 10n })).toEqual({ id: '1', big: 10n });
        await expect(insert(items, { id: '2', big: 10n })).rejects.toBeInstanceOf(EntityConflictError);
        await expect(insert(items, { id: '3', big: 11n })).resolves.toEqual({ id: '3', big: 11n });
    });
});
