/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import {
    EntityConflictError,
    EntityNotFoundError,
    EntityRelationError,
} from '@chamvi/store';
import type { EntityContractParent, EntityContractRepositories } from './types.ts';
import {
    childOf,
    errorOf,
    idsOf,
    insertParent,
    parentOf,
    uuid,
} from './helpers.ts';

/** The single-row cases of the entity contract: writes, reads, unique fields and references. */
export function registerEntityRowCases(repositories: EntityContractRepositories): void {
    it('creates, saves and finds a row by id, by a field and by null, and lists rows', async () => {
        const { parents } = repositories;

        const saved = await insertParent(parents, 1);

        expect(saved).toEqual(parentOf(1));

        await insertParent(parents, 2, { note: 'note-2' });

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));
        expect(await parents.findOneById(uuid(9))).toBeNull();
        expect(await parents.findOneBy({ name: 'parent-2' })).toEqual(parentOf(2, { note: 'note-2' }));
        expect(await parents.findOneBy({ name: 'parent-9' })).toBeNull();
        expect(idsOf(await parents.findManyBy({ note: null }))).toEqual([uuid(1)]);
        expect(idsOf(await parents.findManyBy({ note: 'note-2' }))).toEqual([uuid(2)]);
        expect(idsOf(await parents.findManyBy({ id: [uuid(1), uuid(2), uuid(9)] } as unknown as Partial<EntityContractParent>)).sort())
            .toEqual([uuid(1), uuid(2)]);
        expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(2)]);
    });

    it('merges and saves a read row', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);

        const row = (await parents.findOneById(uuid(1)))!;
        const merged = parents.merge(row, { counter: 5, note: 'note' });

        expect(merged).toBe(row);
        await parents.save(row);

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 5, note: 'note' }));

        parents.merge(row, { counter: 6, note: null });
        await parents.save(row);

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 6 }));
    });

    it('removes a row and many rows', async () => {
        const { parents } = repositories;

        const first = await insertParent(parents, 1);
        const second = await insertParent(parents, 2);
        const third = await insertParent(parents, 3);

        await parents.remove(first);

        expect(await parents.findOneById(uuid(1))).toBeNull();

        await parents.removeMany([second, third]);

        expect(await parents.findManyBy({})).toEqual([]);
    });

    it('save of a created entity whose key exists is EntityConflictError and leaves the row', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);

        await expect(parents.save(parents.create(parentOf(1, { name: 'other', label: 'changed' }))))
            .rejects.toBeInstanceOf(EntityConflictError);
        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));
    });

    it('save decides by object identity: a spread copy of a created entity is an update', async () => {
        const { parents } = repositories;

        const created = parents.create(parentOf(1));

        await expect(parents.save({ ...created })).rejects.toBeInstanceOf(EntityNotFoundError);
        expect(await parents.findOneById(uuid(1))).toBeNull();

        await parents.save(created);
        await parents.save({ ...created, counter: 3 });

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 3 }));
    });

    it('upsert inserts, then replaces', async () => {
        const { parents } = repositories;

        await parents.upsert(parentOf(1));

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));

        await parents.upsert(parentOf(1, { counter: 7, label: 'replaced' }));

        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 7, label: 'replaced' }));
        expect(await parents.findManyBy({})).toHaveLength(1);
    });

    it('upsert replaces the whole row: a property the value leaves out is cleared', async () => {
        const { parents } = repositories;

        await parents.upsert(parentOf(1, { note: 'kept?' }));

        const withoutNote: Partial<EntityContractParent> = parentOf(1, { counter: 2 });

        delete withoutNote.note;
        await parents.upsert(withoutNote as EntityContractParent);

        const row = (await parents.findOneById(uuid(1)))!;

        expect(row.note ?? null).toBeNull();
        expect(row.counter).toBe(2);
    });

    it('a unique field taken by another row is EntityConflictError', async () => {
        const { parents } = repositories;

        const first = await insertParent(parents, 1);

        await expect(parents.save(parents.create(parentOf(2, { name: 'parent-1' }))))
            .rejects.toBeInstanceOf(EntityConflictError);
        expect(await parents.findOneById(uuid(2))).toBeNull();

        await expect(parents.upsert(parentOf(2, { name: 'parent-1' })))
            .rejects.toBeInstanceOf(EntityConflictError);
        expect(await parents.findOneById(uuid(2))).toBeNull();

        await insertParent(parents, 2);

        const second = (await parents.findOneById(uuid(2)))!;

        parents.merge(second, { name: 'parent-1' });

        await expect(parents.save(second)).rejects.toBeInstanceOf(EntityConflictError);
        expect(await parents.findOneById(uuid(2))).toEqual(parentOf(2));

        await expect(parents.checkUniqueness({ name: 'parent-1' })).rejects.toBeInstanceOf(EntityConflictError);
        await expect(parents.checkUniqueness({ name: 'parent-1' }, first)).resolves.toBeUndefined();
        await expect(parents.checkUniqueness({ name: 'parent-9' })).resolves.toBeUndefined();
    });

    it('a missing parent is EntityRelationError naming the parent', async () => {
        const { parents, children } = repositories;

        const error = await errorOf(children.save(children.create(childOf(11, 1))));

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
        expect(await children.findOneById(uuid(11))).toBeNull();
        await expect(children.validateRelations({ parentId: uuid(1) })).rejects.toBeInstanceOf(EntityRelationError);

        await insertParent(parents, 1);

        await expect(children.validateRelations({ parentId: uuid(1) })).resolves.toBeUndefined();
        await children.save(children.create(childOf(11, 1)));

        expect(await children.findManyBy({ parentId: uuid(1) })).toEqual([childOf(11, 1)]);
    });

    it('a parent a child references is not removed', async () => {
        const { parents, children } = repositories;

        const parent = await insertParent(parents, 1);
        const child = await children.save(children.create(childOf(11, 1)));

        const error = await errorOf(parents.remove(parent));

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
        expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));

        await children.remove(child);
        await parents.remove(parent);

        expect(await parents.findOneById(uuid(1))).toBeNull();
    });
}
