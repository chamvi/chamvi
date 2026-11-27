/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError, EntityRelationError } from '@chamvi/errors';
import { expect, it } from 'vitest';
import type { EntityContractRepositories } from './types.ts';
import {
    childOf,
    errorOf,
    idsOf,
    insertParent,
    parentOf,
    recordOf,
    uuid,
} from './helpers.ts';

/** The upsert key and `upsertMany` cases of the entity contract. */
export function registerEntityUpsertCases(repositories: EntityContractRepositories): void {
    it('upsert by an upsert key replaces the row holding it, keeps its stored id and resolves the next read', async () => {
        const { records } = repositories;

        expect(await records.upsert(recordOf(1, 'a', 1))).toStrictEqual(recordOf(1, 'a', 1));

        const replaced = await records.upsert(recordOf(2, 'a', 2));

        expect(replaced).toStrictEqual(recordOf(1, 'a', 2));
        expect(await records.findOneBy({ scope: 's', name: 'a' })).toStrictEqual(replaced);
        expect(await records.findOneById(uuid(2))).toBeNull();
    });

    it('upsertMany by an upsert key keeps the stored ids, in input order; a repeated key keeps one row, the later value wins', async () => {
        const { records } = repositories;

        await records.upsert(recordOf(1, 'a', 1));
        await records.upsert(recordOf(3, 'c', 3));

        const stored = await records.upsertMany([
            recordOf(12, 'b', 1),
            recordOf(13, 'c', 30),
            recordOf(11, 'a', 10),
            recordOf(14, 'b', 7),
            recordOf(15, 'd', 4),
        ]);

        expect(stored).toStrictEqual([
            recordOf(12, 'b', 1),
            recordOf(3, 'c', 30),
            recordOf(1, 'a', 10),
            recordOf(12, 'b', 7),
            recordOf(15, 'd', 4),
        ]);
        expect((await records.findManyBy({ scope: 's' })).sort((a, b) => a.name.localeCompare(b.name))).toStrictEqual([
            recordOf(1, 'a', 10),
            recordOf(12, 'b', 7),
            recordOf(3, 'c', 30),
            recordOf(15, 'd', 4),
        ]);
    });

    it('an upsert of a stored primary key under another upsert key is EntityConflictError and changes nothing', async () => {
        const { records } = repositories;

        await records.upsert(recordOf(1, 'a', 1));

        await expect(records.upsert(recordOf(1, 'b', 2))).rejects.toBeInstanceOf(EntityConflictError);
        await expect(records.upsertMany([recordOf(2, 'c', 3), recordOf(1, 'b', 2)])).rejects.toBeInstanceOf(EntityConflictError);
        expect(await records.findManyBy({})).toStrictEqual([recordOf(1, 'a', 1)]);
    });

    it('upsertMany of nothing stores nothing and resolves []', async () => {
        const { parents } = repositories;

        expect(await parents.upsertMany([])).toEqual([]);
        expect(await parents.findManyBy({})).toEqual([]);
    });

    it('upsertMany inserts and replaces in one call and resolves, in input order, what the next reads return', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);

        const values = [parentOf(3, { counter: 3 }), parentOf(1, { counter: 9, label: 'replaced' }), parentOf(2)];
        const stored = await parents.upsertMany(values.map((value) => parents.create(value)));

        expect(stored).toStrictEqual([
            await parents.findOneById(uuid(3)),
            await parents.findOneById(uuid(1)),
            await parents.findOneById(uuid(2)),
        ]);
        expect(stored).toEqual(values);
        expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(2), uuid(3)]);
    });

    it('upsertMany is all or nothing: a missing parent anywhere in the batch is EntityRelationError and stores none of it', async () => {
        const { parents, children } = repositories;

        await insertParent(parents, 1);

        const error = await errorOf(children.upsertMany([childOf(11, 1), childOf(12, 2), childOf(13, 1)]));

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
        expect(await children.findManyBy({})).toEqual([]);
    });

    it('upsertMany and removeManyBy in a rejected transaction change nothing', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);
        await insertParent(parents, 2);

        const failure = new Error('rolled back');

        await expect(parents.transaction(async (repository) => {
            await repository.upsertMany([parentOf(1, { counter: 5 }), parentOf(3)]);
            expect(await repository.removeManyBy({ id: uuid(2) })).toBe(1);

            throw failure;
        })).rejects.toBe(failure);

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));
        expect(await parents.findOneById(uuid(2))).toEqual(parentOf(2));
        expect(await parents.findOneById(uuid(3))).toBeNull();
    });
}
