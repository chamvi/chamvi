/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityDeadlockError } from '@chamvi/errors';
import { defineQuery } from '@rapiq/core';
import { expect, it } from 'vitest';
import type { EntityContractRepositories, EntityRepositoryContractInput } from './types.ts';
import {
    insertParent,
    parentOf,
    uuid,
} from './helpers.ts';

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
    const { promise, resolve } = Promise.withResolvers<void>();

    return { promise, resolve };
}

function pauseEntityContract(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** The transaction cases of the entity contract. */
export function registerEntityTransactionCases(repositories: EntityContractRepositories, input: EntityRepositoryContractInput): void {
    it('transaction commits', async () => {
        const { parents } = repositories;

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
        const { parents } = repositories;

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
        const { parents } = repositories;

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
        const { parents } = repositories;

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

        const outcome = await Promise.race([second, pauseEntityContract(1000).then(() => 'waited')]);

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
        const { parents } = repositories;

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
        const { parents } = repositories;

        const rows = [1, 2, 3, 4, 5];

        for (const n of rows) {
            await insertParent(parents, n);
        }

        const increment = (n: number) => parents.transaction(async (repository) => {
            const row = (await repository.findOneById(uuid(n)))!;

            await pauseEntityContract(20);
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
        const { parents } = repositories;

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
}
