/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    defineQuery,
    eq,
    lt,
} from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityNotFoundError,
    EntityQueryError,
    EntityRelationError,
} from '@chamvi/store';
import type { IEntityRepository } from '@chamvi/store';
import type {
    EntityContractChild,
    EntityContractParent,
    EntityContractRecord,
    EntityRepositoryContractInput,
} from './types.ts';

const AT = Date.UTC(2026, 0, 1);

const MARKER = 'marker-4711-stored';

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
    const { promise, resolve } = Promise.withResolvers<void>();

    return { promise, resolve };
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function uuid(n: number): string {
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function parentOf(n: number, patch: Partial<EntityContractParent> = {}): EntityContractParent {
    return {
        id: uuid(n),
        name: `parent-${n}`,
        note: null,
        counter: 0,
        label: `label-${n}`,
        createdAt: new Date(AT + (n * 1000)),
        ...patch,
    };
}

function childOf(n: number, parent: number, patch: Partial<EntityContractChild> = {}): EntityContractChild {
    return {
        id: uuid(n),
        parentId: uuid(parent),
        label: `child-${n}`,
        ...patch,
    };
}

function recordOf(n: number, name: string, value: number): EntityContractRecord {
    return {
        id: uuid(n),
        scope: 's',
        name,
        value,
    };
}

async function insertParent(
    parents: IEntityRepository<EntityContractParent>,
    n: number,
    patch: Partial<EntityContractParent> = {},
): Promise<EntityContractParent> {
    return parents.save(parents.create(parentOf(n, patch)));
}

function idsOf(rows: { id: string }[]): string[] {
    return rows.map((row) => row.id);
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    return expect.unreachable('expected a rejection');
}

/**
 * The storage contract of an `IEntityRepository` driver, asserted through
 * the port only. `create()` returns fresh, empty repositories of the two
 * fixtures on one store: the parent labelled `parent` (key `id`, `name`
 * unique), the child labelled `child` (key `id`, `parentId` references the
 * parent's `id`).
 */
export function describeEntityRepositoryContract(input: EntityRepositoryContractInput): void {
    describe(`entity repository contract: ${input.name}`, () => {
        let parents: IEntityRepository<EntityContractParent>;
        let children: IEntityRepository<EntityContractChild>;
        let records: IEntityRepository<EntityContractRecord>;

        beforeEach(async () => {
            ({
                parents,
                children,
                records,
            } = await input.create());
        });

        it('creates, saves and finds a row by id, by a field and by null, and lists rows', async () => {
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
            const first = await insertParent(parents, 1);
            const second = await insertParent(parents, 2);
            const third = await insertParent(parents, 3);

            await parents.remove(first);

            expect(await parents.findOneById(uuid(1))).toBeNull();

            await parents.removeMany([second, third]);

            expect(await parents.findManyBy({})).toEqual([]);
        });

        it('save of a created entity whose key exists is EntityConflictError and leaves the row', async () => {
            await insertParent(parents, 1);

            await expect(parents.save(parents.create(parentOf(1, { name: 'other', label: 'changed' }))))
                .rejects.toBeInstanceOf(EntityConflictError);
            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));
        });

        it('save decides by object identity: a spread copy of a created entity is an update', async () => {
            const created = parents.create(parentOf(1));

            await expect(parents.save({ ...created })).rejects.toBeInstanceOf(EntityNotFoundError);
            expect(await parents.findOneById(uuid(1))).toBeNull();

            await parents.save(created);
            await parents.save({ ...created, counter: 3 });

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 3 }));
        });

        it('upsert inserts, then replaces', async () => {
            await parents.upsert(parentOf(1));

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));

            await parents.upsert(parentOf(1, { counter: 7, label: 'replaced' }));

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 7, label: 'replaced' }));
            expect(await parents.findManyBy({})).toHaveLength(1);
        });

        it('upsert replaces the whole row: a property the value leaves out is cleared', async () => {
            await parents.upsert(parentOf(1, { note: 'kept?' }));

            const withoutNote: Partial<EntityContractParent> = parentOf(1, { counter: 2 });

            delete withoutNote.note;
            await parents.upsert(withoutNote as EntityContractParent);

            const row = (await parents.findOneById(uuid(1)))!;

            expect(row.note ?? null).toBeNull();
            expect(row.counter).toBe(2);
        });

        it('a unique field taken by another row is EntityConflictError', async () => {
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

        it('findMany filters, sorts and pages, with the total of the selection', async () => {
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
            await insertParent(parents, 1, { label: 'Mixed' });
            await insertParent(parents, 2, { label: 'mixed' });

            const result = await parents.findMany(defineQuery({ filters: eq('label', 'mixed') }));

            expect(idsOf(result.data)).toEqual([uuid(2)]);
            expect(result.meta.total).toBe(1);
        });

        it('a read row is a copy', async () => {
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

        it('transaction commits', async () => {
            await insertParent(parents, 1);

            const result = await parents.transaction(async (repository) => {
                const row = (await repository.findOneById(uuid(1)))!;

                repository.merge(row, { counter: 1 });
                await repository.save(row);
                await repository.save(repository.create(parentOf(2)));

                return 'done';
            });

            expect(result).toBe('done');
            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 1 }));
            expect(await parents.findOneById(uuid(2))).toEqual(parentOf(2));
        });

        it('a rejected transaction changes nothing', async () => {
            await insertParent(parents, 1);
            await insertParent(parents, 3);

            const failure = new Error('rejected');

            await expect(parents.transaction(async (repository) => {
                const row = (await repository.findOneById(uuid(1)))!;

                repository.merge(row, { counter: 1 });
                await repository.save(row);
                await repository.save(repository.create(parentOf(2)));
                await repository.remove((await repository.findOneById(uuid(3)))!);
                await repository.upsert(parentOf(4));

                throw failure;
            })).rejects.toBe(failure);

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));
            expect(await parents.findOneById(uuid(2))).toBeNull();
            expect(await parents.findOneById(uuid(3))).toEqual(parentOf(3));
            expect(await parents.findOneById(uuid(4))).toBeNull();
        });

        it('a nested transaction joins the outer one', async () => {
            const failure = new Error('rejected');

            await expect(parents.transaction(async (outer) => {
                await outer.transaction(async (inner) => inner.save(inner.create(parentOf(1))));

                expect(await outer.findOneById(uuid(1))).toEqual(parentOf(1));

                throw failure;
            })).rejects.toBe(failure);

            expect(await parents.findOneById(uuid(1))).toBeNull();
        });

        // a transaction that holds after a list read, then a second one saving the listed row
        const saveBesideListRead = async (): Promise<string> => {
            await insertParent(parents, 1);

            const listed = deferred();
            const release = deferred();

            const first = parents.transaction(async (repository) => {
                await repository.findManyBy({});
                await repository.findMany(defineQuery({}));
                listed.resolve();
                await release.promise;
            });

            await listed.promise;

            const second = parents.transaction(async (repository) => {
                const row = (await repository.findOneById(uuid(1)))!;

                repository.merge(row, { counter: 1 });
                await repository.save(row);

                return 'saved';
            });

            const outcome = await Promise.race([second, pause(1000).then(() => 'waited')]);

            release.resolve();
            await first;
            await second;

            expect((await parents.findOneById(uuid(1)))!.counter).toBe(1);

            return outcome;
        };

        it.skipIf(input.serialized)('a list read inside a transaction does not hold its rows', async () => {
            expect(await saveBesideListRead()).toBe('saved');
        });

        it.runIf(input.serialized)('a serializing driver starts a transaction only after the one in flight ended', async () => {
            expect(await saveBesideListRead()).toBe('waited');
        });

        it('a rolled back save keeps the entity as it was: a created entity inserts, a read entity writes its change', async () => {
            const failure = new Error('rejected');
            const created = parents.create(parentOf(1));

            await expect(parents.transaction(async (repository) => {
                await repository.save(created);

                throw failure;
            })).rejects.toBe(failure);

            await parents.save(created);

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));

            const row = (await parents.findOneById(uuid(1)))!;

            await expect(parents.transaction(async (repository) => {
                repository.merge(row, { counter: 4 });
                await repository.save(row);

                throw failure;
            })).rejects.toBe(failure);

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1));

            await parents.save(row);

            expect(await parents.findOneById(uuid(1))).toEqual(parentOf(1, { counter: 4 }));
        });

        it('two transactions on one row run one after the other', async () => {
            const rows = [1, 2, 3, 4, 5];

            for (const n of rows) {
                await insertParent(parents, n);
            }

            const increment = (n: number) => parents.transaction(async (repository) => {
                const row = (await repository.findOneById(uuid(n)))!;

                await pause(20);
                repository.merge(row, { counter: row.counter + 1 });
                await repository.save(row);
            });

            await Promise.all(rows.flatMap((n) => [increment(n), increment(n)]));

            for (const n of rows) {
                expect((await parents.findOneById(uuid(n)))!.counter).toBe(2);
            }
        });

        // a lock cycle needs two transactions open at once: a serializing driver never forms one
        it.skipIf(input.serialized)('two transactions locking two rows in opposite order end, one with an error', async () => {
            await insertParent(parents, 1);
            await insertParent(parents, 2);

            const firstLocked = deferred();
            const secondLocked = deferred();

            const run = (first: number, second: number, mine: Deferred, other: Deferred) => parents.transaction(async (repository) => {
                const a = (await repository.findOneById(uuid(first)))!;

                mine.resolve();
                await other.promise;

                const b = (await repository.findOneById(uuid(second)))!;

                repository.merge(a, { counter: a.counter + 1 });
                repository.merge(b, { counter: b.counter + 1 });
                await repository.save(a);
                await repository.save(b);
            });

            const results = await Promise.allSettled([
                run(1, 2, firstLocked, secondLocked),
                run(2, 1, secondLocked, firstLocked),
            ]);

            const rejected = results.filter((result) => result.status === 'rejected');

            expect(rejected).toHaveLength(1);
            expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(EntityDeadlockError);
            expect((await parents.findOneById(uuid(1)))!.counter).toBe(1);
            expect((await parents.findOneById(uuid(2)))!.counter).toBe(1);
        });

        it('upsert by an upsert key replaces the row holding it, keeps its stored id and resolves the next read', async () => {
            expect(await records.upsert(recordOf(1, 'a', 1))).toStrictEqual(recordOf(1, 'a', 1));

            const replaced = await records.upsert(recordOf(2, 'a', 2));

            expect(replaced).toStrictEqual(recordOf(1, 'a', 2));
            expect(await records.findOneBy({ scope: 's', name: 'a' })).toStrictEqual(replaced);
            expect(await records.findOneById(uuid(2))).toBeNull();
        });

        it('upsertMany by an upsert key keeps the stored ids, in input order; a repeated key keeps one row, the later value wins', async () => {
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
            await records.upsert(recordOf(1, 'a', 1));

            await expect(records.upsert(recordOf(1, 'b', 2))).rejects.toBeInstanceOf(EntityConflictError);
            await expect(records.upsertMany([recordOf(2, 'c', 3), recordOf(1, 'b', 2)])).rejects.toBeInstanceOf(EntityConflictError);
            expect(await records.findManyBy({})).toStrictEqual([recordOf(1, 'a', 1)]);
        });

        it('upsertMany of nothing stores nothing and resolves []', async () => {
            expect(await parents.upsertMany([])).toEqual([]);
            expect(await parents.findManyBy({})).toEqual([]);
        });

        it('upsertMany inserts and replaces in one call and resolves, in input order, what the next reads return', async () => {
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
            await insertParent(parents, 1);

            const error = await errorOf(children.upsertMany([childOf(11, 1), childOf(12, 2), childOf(13, 1)]));

            expect(error).toBeInstanceOf(EntityRelationError);
            expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
            expect(await children.findManyBy({})).toEqual([]);
        });

        it('upsertMany and removeManyBy in a rejected transaction change nothing', async () => {
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

        it('removeManyBy removes the matching rows and resolves their count; null and an array match as in findManyBy', async () => {
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
            await insertParent(parents, 1);
            await insertParent(parents, 2);

            await expect(parents.removeManyBy({})).rejects.toBeInstanceOf(EntityQueryError);
            expect(idsOf(await parents.findManyBy({})).sort()).toEqual([uuid(1), uuid(2)]);
        });

        it('removeManyBy of a parent a child references is EntityRelationError naming both, and removes nothing', async () => {
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
    });
}
