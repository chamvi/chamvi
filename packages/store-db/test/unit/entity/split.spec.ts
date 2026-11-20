/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { EntityContractParent } from '@chamvi/test-kit';
import { postgres } from '../../utils/database.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { QueryLog } from '../../utils/entity/logger.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureDriver } from '../../utils/entity/schemas.ts';
import { splitWhereValues } from '../../../src/entity/helpers/split.ts';

describe('splitWhereValues', () => {
    it('gives no parts when the scalars and one value per array exceed the limit', () => {
        expect(splitWhereValues({
            a: 1,
            b: 2,
            c: [1, 2, 3],
        }, 2)).toBeUndefined();
        expect(splitWhereValues({ a: 1, c: [1, 2, 3] }, 2)).toEqual([{ a: 1, c: [1] }, { a: 1, c: [2] }, { a: 1, c: [3] }]);
    });

    it('gives no parts when the split would take more than WHERE_PARTS_MAX statements', () => {
        const values = (length: number) => Array.from({ length }, (_, i) => i);

        // 30 x 30 chunks of one value each: 900 statements
        expect(splitWhereValues({ a: values(30), b: values(30) }, 2)).toHaveLength(900);
        // 40 x 40: 1600, refused before any part is built
        expect(splitWhereValues({ a: values(40), b: values(40) }, 2)).toBeUndefined();
    });
});

const LIMIT = 6;

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
        createdAt: new Date(Date.UTC(2026, 0, 1) + n),
        ...patch,
    };
}

const drivers: { driver: FixtureDriver; skip: boolean }[] = [
    { driver: 'postgres', skip: !postgres },
    { driver: 'better-sqlite3', skip: false },
];

describe.each(drivers)('split wheres of the adapter on $driver', ({ driver, skip }) => {
    let fixture: FixtureDataSource;
    let log: QueryLog;
    let repositories: FixtureRepositories;

    /** The most bind parameters a logged statement carried. */
    const widest = () => Math.max(0, ...log.parameters.map((parameters) => parameters.length));

    beforeAll(async () => {
        if (skip) {
            return;
        }

        log = new QueryLog();
        fixture = await openFixtureDataSource(driver, { logger: log });
    });

    afterAll(async () => {
        await fixture?.dataSource.destroy();
    });

    beforeEach(async () => {
        if (skip) {
            return;
        }

        await fixture.clear();
        repositories = createFixtureRepositories(fixture, { parameterLimit: LIMIT });

        for (let n = 1; n <= 8; n++) {
            await repositories.parents.save(repositories.parents.create(parentOf(n, { counter: n % 2 })));
        }

        log.clear();
    });

    describe.skipIf(skip)(driver, () => {
        it('sizes the chunks of an array from what the other predicates leave of the limit', async () => {
            const where = {
                name: ['parent-1', 'parent-2', 'parent-3', 'parent-4', 'parent-5'],
                label: ['label-1', 'label-3', 'label-5'],
                counter: 1,
            };

            expect(await repositories.parents.findManyBy(where)).toEqual([1, 3, 5].map((n) => parentOf(n, { counter: 1 })));
            expect(widest()).toBeLessThanOrEqual(LIMIT);

            log.clear();
            expect(await repositories.parents.removeManyBy(where)).toBe(3);
            expect(widest()).toBeLessThanOrEqual(LIMIT);
        });

        it('splits more than one array when the other predicates leave nothing of the limit', async () => {
            const where = {
                id: [1, 2, 3, 4, 5, 6, 7, 8].map(uuid),
                name: ['parent-2', 'parent-3', 'parent-4', 'parent-5', 'parent-6', 'parent-7'],
                label: ['label-1', 'label-2', 'label-4', 'label-6', 'label-7', 'label-8'],
                counter: 0,
            };

            expect(await repositories.parents.findManyBy(where)).toEqual([2, 4, 6].map((n) => parentOf(n)));
            expect(widest()).toBeLessThanOrEqual(LIMIT);

            log.clear();
            expect(await repositories.parents.removeManyBy(where)).toBe(3);
            expect(widest()).toBeLessThanOrEqual(LIMIT);
        });

        it('a repeated value of a split array matches its row once and binds once', async () => {
            const labels = ['label-8', 'label-1', 'label-8', 'label-1', 'absent', 'label-1', 'label-8'];
            const notes = [null, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', null];

            expect(await repositories.parents.findManyBy({ label: labels })).toEqual([parentOf(1, { counter: 1 }), parentOf(8)]);
            // three distinct labels fit one statement
            expect(log.parameters.filter((parameters) => parameters.length > 0)).toHaveLength(1);
            expect(await repositories.parents.findManyBy({ note: notes })).toHaveLength(8);
            expect(widest()).toBeLessThanOrEqual(LIMIT);
            expect(await repositories.parents.removeManyBy({ label: [...labels, ...labels, 'label-2', 'label-3'] })).toBe(4);
        });

        it('finds one row of an array beyond the limit, the lowest key of every part', async () => {
            // the matching labels land in the last chunks: a first part matches nothing
            const labels = [...Array.from({ length: 2 * LIMIT }, (_, i) => `absent-${i}`), 'label-7', 'label-3', 'label-5'];

            expect(await repositories.parents.findOneBy({ label: labels })).toEqual(parentOf(3, { counter: 1 }));
            expect(widest()).toBeLessThanOrEqual(LIMIT);

            log.clear();
            expect(await repositories.parents.findOneBy({ label: labels, counter: 0 })).toBeNull();
            expect(widest()).toBeLessThanOrEqual(LIMIT);

            log.clear();

            const ids = [8, 6, ...Array.from({ length: LIMIT }, (_, i) => 100 + i)].map(uuid);
            const locked = await repositories.parents.transaction((parents) => parents.findOneBy({ id: ids }));

            expect(locked).toEqual(parentOf(6));
            expect(widest()).toBeLessThanOrEqual(LIMIT);
        });

        it.skipIf(driver !== 'postgres')('locks the lowest key and searches again when that row stopped matching meanwhile', async () => {
            const labels = [...Array.from({ length: 2 * LIMIT }, (_, i) => `absent-${i}`), 'label-5', 'label-3'];
            let found: Promise<EntityContractParent | null> | undefined;

            await repositories.parents.transaction(async (parents) => {
                // the label changes uncommitted: the other transaction still sees row 3 match, then waits for its lock
                const row = (await parents.findOneById(uuid(3)))!;

                await parents.save(parents.merge(row, { label: 'moved' }));
                log.clear();

                found = repositories.parents.transaction((other) => other.findOneBy({ label: labels }));

                // let the commit wait for the other transaction's locked read
                let waiting = log.queries.every((query) => !/FOR UPDATE/.test(query));

                while (waiting) {
                    await new Promise((resolve) => {
                        setImmediate(resolve);
                    });
                    waiting = log.queries.every((query) => !/FOR UPDATE/.test(query));
                }
            });

            expect(await found).toEqual(parentOf(5, { counter: 1 }));
            // row 3 under the lock, gone from the labels, then row 5
            expect(log.queries.filter((query) => /FOR UPDATE/.test(query))).toHaveLength(2);
        });

        it('returns a row once when values equal in SQL but not in JS land in two parts', async () => {
            // the same instants as distinct Date objects: a Set keeps both
            const createdAt = [1, 2, 3, 4, 5, 6, 7, 1, 2].map((n) => parentOf(n).createdAt);

            expect(await repositories.parents.findManyBy({ createdAt })).toEqual(
                [1, 2, 3, 4, 5, 6, 7].map((n) => parentOf(n, { counter: n % 2 })),
            );
            expect(widest()).toBeLessThanOrEqual(LIMIT);
        });
    });
});
