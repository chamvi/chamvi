/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityQueryError } from '@chamvi/errors';
import {
    defineQuery,
    eq,
    lt,
} from '@rapiq/core';
import { expect, it } from 'vitest';
import type { EntityContractRepositories } from './types.ts';
import {
    errorOf,
    idsOf,
    insertParent,
    parentOf,
    uuid,
} from './helpers.ts';
import { AT } from './constants.ts';

/** The `findMany` cases of the entity contract, and copies. */
export function registerEntityQueryCases(repositories: EntityContractRepositories): void {
    it('findMany filters, sorts and pages, with the total of the selection', async () => {
        const { parents } = repositories;

        const counters = [3, 1, 4, 1, 5];
        const labels = ['a', 'b', 'a', 'b', 'a'];

        for (const [index, counter] of counters.entries()) {
            await insertParent(parents, index + 1, { counter, label: labels[index] });
        }

        const filtered = await parents.findMany(defineQuery({ filters: eq('label', 'a'), sorts: { counter: 'DESC' } }));

        expect(idsOf(filtered.data)).toEqual([uuid(5), uuid(3), uuid(1)]);
        expect(filtered.meta.total).toBe(3);

        const paged = await parents.findMany(defineQuery({
            sorts: { counter: 'ASC', id: 'ASC' },
            pagination: { limit: 2, offset: 1 },
        }));

        expect(idsOf(paged.data)).toEqual([uuid(4), uuid(1)]);
        expect(paged.meta).toEqual({
            total: 5,
            limit: 2,
            offset: 1,
        });

        const dated = await parents.findMany(defineQuery({
            filters: lt('createdAt', new Date(AT + 3000)),
            sorts: { createdAt: 'DESC' },
        }));

        expect(idsOf(dated.data)).toEqual([uuid(2), uuid(1)]);
        expect(dated.data[0]).toEqual(parentOf(2, { counter: 1, label: 'b' }));

        const nulls = await parents.findMany(defineQuery({ filters: eq('note', null), sorts: { id: 'ASC' } }));

        expect(nulls.meta.total).toBe(5);
    });

    it('findMany with fields reads the selected fields only; filters and sorts may name fields it does not select', async () => {
        const { parents } = repositories;

        const counters = [3, 1, 4];

        for (const [index, counter] of counters.entries()) {
            await insertParent(parents, index + 1, { counter, label: index === 1 ? 'b' : 'a' });
        }

        const selected = await parents.findMany(defineQuery({
            fields: ['id', 'counter'],
            filters: eq('label', 'a'),
            sorts: { createdAt: 'DESC' },
            pagination: { limit: 1 },
        }));

        expect(selected.data).toStrictEqual([{ id: uuid(3), counter: 4 }]);
        expect(selected.meta.total).toBe(2);
    });

    it('a row read with a field selection is refused by upsert and upsertMany (EntityQueryError); save writes only what it changed', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1, { counter: 3, label: 'a' });

        const [partial] = (await parents.findMany(defineQuery({ fields: ['id', 'counter'] }))).data;

        // an upsert writes every column: the ones the selection left out would be lost
        expect(await errorOf(parents.upsert(partial!))).toBeInstanceOf(EntityQueryError);
        expect(await errorOf(parents.upsertMany([partial!]))).toBeInstanceOf(EntityQueryError);
        expect(await errorOf(parents.transaction((repository) => repository.upsert(partial!)))).toBeInstanceOf(EntityQueryError);
        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 3, label: 'a' }));

        partial!.counter = 7;
        await parents.save(partial!);

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 7, label: 'a' }));

        // a full read upserts as before
        const full = (await parents.findOneById(uuid(1)))!;

        full.counter = 8;
        await expect(parents.upsert(full)).resolves.toEqual(parentOf(1, { counter: 8, label: 'a' }));
    });

    it('a filter is case sensitive', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1, { label: 'Mixed' });
        await insertParent(parents, 2, { label: 'mixed' });

        const result = await parents.findMany(defineQuery({ filters: eq('label', 'mixed') }));

        expect(idsOf(result.data)).toEqual([uuid(2)]);
        expect(result.meta.total).toBe(1);
    });

    it('a read row is a copy', async () => {
        const { parents } = repositories;

        const created = parents.create(parentOf(1));

        await parents.save(created);
        created.label = 'mutated';
        created.createdAt.setTime(0);

        const row = (await parents.findOneById(uuid(1)))!;

        row.label = 'mutated';
        row.createdAt.setTime(0);

        const [listed] = await parents.findManyBy({});

        listed!.label = 'mutated';

        const { data: [found] } = await parents.findMany(defineQuery({}));

        found!.label = 'mutated';

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));
    });
}
