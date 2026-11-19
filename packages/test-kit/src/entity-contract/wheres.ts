/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { expect, it } from 'vitest';
import { EntityQueryError, EntityRelationError } from '@chamvi/store';
import type { EntityContractRepositories } from './types.ts';
import {
    childOf,
    errorOf,
    idsOf,
    insertParent,
    parentOf,
    uuid,
} from './helpers.ts';

const MARKER = 'marker-4711-stored';

/** The where, `removeManyBy`, batch and error cases of the entity contract. */
export function registerEntityWhereCases(repositories: EntityContractRepositories): void {
    it('removeManyBy removes the matching rows and resolves their count; null and an array match as in findManyBy', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1, { note: 'kept' });
        await insertParent(parents, 2);
        await insertParent(parents, 3, { label: 'x' });
        await insertParent(parents, 4, { label: 'y', note: 'kept' });

        expect(await parents.removeManyBy({ note: null, label: ['x', 'label-2'] })).toBe(2);
        expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(4)]);
        expect(await parents.removeManyBy({ label: 'absent' })).toBe(0);
        expect(await parents.removeManyBy({ label: [] })).toBe(0);
        expect(await parents.removeManyBy({ id: [uuid(1), uuid(4)] })).toBe(2);
        expect(await parents.findManyBy({})).toEqual([]);
    });

    it('a where with a property set to undefined is EntityQueryError for every where-taking method, and nothing changes', async () => {
        const { parents, children } = repositories;

        await insertParent(parents, 1);
        await insertParent(parents, 2);
        await children.save(children.create(childOf(11, 1)));
        await children.save(children.create(childOf(12, 2)));

        const calls: [string, () => Promise<unknown>][] = [
            ['removeManyBy', () => children.removeManyBy({ parentId: undefined })],
            ['removeManyBy with a value beside it', () => children.removeManyBy({ parentId: uuid(1), label: undefined })],
            ['findManyBy', () => children.findManyBy({ parentId: undefined })],
            ['findOneBy', () => parents.findOneBy({ name: undefined })],
            ['removeManyBy in a transaction', () => children.transaction((repository) => repository.removeManyBy({ parentId: undefined }))],
        ];

        for (const [name, call] of calls) {
            const error = await errorOf(call());

            expect(error, name).toBeInstanceOf(EntityQueryError);
        }

        expect(idsOf(await children.findManyBy({})).sort()).toEqual([uuid(11), uuid(12)]);
        expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(2)]);
    });

    it('findOneById without an id (undefined or null) is EntityQueryError, also inside a transaction, and locks nothing', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);

        for (const id of [undefined, null]) {
            expect(await errorOf(parents.findOneById(id as unknown as string)), String(id)).toBeInstanceOf(EntityQueryError);
            expect(
                await errorOf(parents.transaction((repository) => repository.findOneById(id as unknown as string))),
                `${String(id)} in a transaction`,
            ).toBeInstanceOf(EntityQueryError);
        }

        // the first row is not held: a save of it outside goes through
        const row = (await parents.findOneById(uuid(1)))!;

        await parents.save(parents.merge(row, { counter: 1 }));
        expect((await parents.findOneById(uuid(1)))?.counter).toBe(1);
    });

    it('a null in a where array matches a missing value, as a null value does', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);
        await insertParent(parents, 2, { note: 'note-2' });
        await insertParent(parents, 3, { note: 'note-3' });

        expect(idsOf(await parents.findManyBy({ note: [null] }))).toEqual([uuid(1)]);
        expect(idsOf(await parents.findManyBy({ note: [null, 'note-3'] })).sort()).toEqual([uuid(1), uuid(3)]);
        expect(idsOf(await parents.findManyBy({ note: ['note-2'] }))).toEqual([uuid(2)]);
        expect(await parents.findOneBy({ note: [null] })).toEqual(parentOf(1));
        expect(await parents.removeManyBy({ note: [null, 'note-2'] })).toBe(2);
        expect(idsOf(await parents.findManyBy({}))).toEqual([uuid(3)]);
    });

    it('removeManyBy without a condition is EntityQueryError and removes nothing; findManyBy without one lists every row', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);
        await insertParent(parents, 2);

        await expect(parents.removeManyBy({})).rejects.toBeInstanceOf(EntityQueryError);
        expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(2)]);
    });

    it('removeManyBy of a parent a child references is EntityRelationError naming both, and removes nothing', async () => {
        const { parents, children } = repositories;

        await insertParent(parents, 1);
        await insertParent(parents, 2);
        await children.save(children.create(childOf(11, 1)));

        const error = await errorOf(parents.removeManyBy({ id: [uuid(1), uuid(2)] }));

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
        expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(2)]);
        expect(await children.removeManyBy({ parentId: uuid(1) })).toBe(1);
        expect(await parents.removeManyBy({ id: [uuid(1), uuid(2)] })).toBe(2);
    });

    it('batches above 65,535 bind parameters: upsertMany, findManyBy by every key, removeMany and removeManyBy of 70,000 rows', async () => {
        const { parents, children } = repositories;

        const count = 70_000;
        const rows = Array.from({ length: count }, (_, i) => childOf(1_000_000 + i, 1));

        await insertParent(parents, 1);
        expect(await children.upsertMany(rows)).toHaveLength(count);
        expect(await children.findManyBy({ id: idsOf(rows) })).toHaveLength(count);

        const half = rows.slice(0, count / 2);

        await children.removeMany(half);
        expect(await children.findManyBy({ parentId: uuid(1) })).toHaveLength(count / 2);
        expect(await children.upsertMany(half)).toHaveLength(count / 2);
        expect(await children.removeManyBy({ parentId: uuid(1) })).toBe(count);
        expect(await children.findManyBy({})).toEqual([]);
    }, 300_000);

    it('no error carries a stored value', async () => {
        const { parents, children } = repositories;

        const stored = await insertParent(parents, 1, {
            name: MARKER,
            note: MARKER,
            label: MARKER,
        });

        await children.save(children.create(childOf(11, 1, { label: MARKER })));

        const errors = [
            await errorOf(parents.save(parents.create(parentOf(1, { name: `${MARKER}-other`, label: MARKER })))),
            await errorOf(parents.save(parents.create(parentOf(2, { name: MARKER, label: MARKER })))),
            await errorOf(parents.checkUniqueness({ name: MARKER })),
            await errorOf(parents.save({ ...parentOf(3, { name: `${MARKER}-3`, label: MARKER }) })),
            await errorOf(children.save(children.create(childOf(12, 9, { label: MARKER })))),
            await errorOf(children.validateRelations({ parentId: uuid(9) })),
            await errorOf(parents.remove(stored)),
        ];

        for (const error of errors) {
            expect(error).toBeInstanceOf(Error);

            const text = `${(error as Error).message} ${JSON.stringify(error)}`;

            expect(text).not.toContain(MARKER);

            for (const n of [1, 2, 3, 9, 11, 12]) {
                expect(text).not.toContain(uuid(n));
            }
        }
    });
}
