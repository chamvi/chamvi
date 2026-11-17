/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { closeDatabase, queueDataSource } from '../../../src/database/index.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';

const TABLE = 'test_entity_parents';

let fixture: FixtureDataSource;
let repositories: FixtureRepositories;

beforeEach(async () => {
    fixture = await openFixtureDataSource('better-sqlite3', { guard: true });
    repositories = createFixtureRepositories(fixture);
});

afterEach(async () => {
    if (fixture.dataSource.isInitialized) {
        await fixture.dataSource.destroy();
    }
});

function parent(name: string, counter = 0) {
    return {
        id: randomUUID(),
        name,
        note: null,
        counter,
        label: 'l',
        createdAt: new Date('2026-11-17T00:00:00.000Z'),
    };
}

/** A raw insert of a parent row, as an app's own code would write it. */
const INSERT = `INSERT INTO "${TABLE}" ("id", "name", "counter", "label", "created_at") VALUES (?, ?, 0, 'l', '2026-11-17 00:00:00.000')`;

async function names(): Promise<string[]> {
    const rows = await fixture.dataSource.query(`SELECT "name" FROM "${TABLE}" ORDER BY "name"`) as Array<{ name: string }>;

    return rows.map((row) => row.name);
}

describe('a guarded better-sqlite3 data source', () => {
    it('a raw transaction that rolls back beside an adapter transaction leaves the adapter\'s writes', async () => {
        const { promise: inside, resolve: entered } = Promise.withResolvers<void>();
        const { promise: gate, resolve: open } = Promise.withResolvers<void>();

        const adapter = repositories.parents.transaction(async (repository) => {
            await repository.save(repository.create(parent('a')));
            entered();
            await gate;
            await repository.save(repository.create(parent('b')));
        });

        await inside;

        const raw = fixture.dataSource.transaction(async (manager) => {
            await manager.query(INSERT, [randomUUID(), 'raw']);

            throw new Error('raw fails');
        });

        open();

        const [adapted, rolled] = await Promise.allSettled([adapter, raw]);

        expect(adapted.status).toBe('fulfilled');
        expect(rolled).toMatchObject({ status: 'rejected', reason: { message: 'raw fails' } });
        expect(await names()).toEqual(['a', 'b']);
    });

    it('two overlapping raw transactions that read, await and write end at 2', async () => {
        const id = randomUUID();

        await fixture.dataSource.query(INSERT, [id, 'counted']);

        const increment = () => fixture.dataSource.transaction(async (manager) => {
            const [row] = await manager.query(`SELECT "counter" FROM "${TABLE}" WHERE "id" = ?`, [id]) as Array<{ counter: number }>;

            await Promise.resolve();
            await manager.query(`UPDATE "${TABLE}" SET "counter" = ? WHERE "id" = ?`, [row!.counter + 1, id]);
        });

        await Promise.all([increment(), increment()]);

        const [row] = await fixture.dataSource.query(`SELECT "counter" FROM "${TABLE}" WHERE "id" = ?`, [id]) as Array<{ counter: number }>;

        expect(row?.counter).toBe(2);
    });

    it('a raw query during an open adapter transaction waits for it', async () => {
        const events: string[] = [];
        const { promise: inside, resolve: entered } = Promise.withResolvers<void>();
        const { promise: gate, resolve: open } = Promise.withResolvers<void>();

        // the adapter's transaction rolls back: a raw write that joined it would roll back too
        const adapter = repositories.parents.transaction(async (repository) => {
            await repository.save(repository.create(parent('a')));
            entered();
            await gate;
            events.push('adapter end');

            throw new Error('adapter fails');
        });

        await inside;

        const raw = fixture.dataSource.query(INSERT, [randomUUID(), 'raw']).then(() => {
            events.push('raw');
        });

        open();

        const [adapted] = await Promise.allSettled([adapter, raw]);

        expect(adapted).toMatchObject({ status: 'rejected', reason: { message: 'adapter fails' } });
        expect(events).toEqual(['adapter end', 'raw']);
        expect(await names()).toEqual(['raw']);
    });

    it('raw use inside an adapter transaction joins it: through its manager and through the data source', async () => {
        const counted = await repositories.parents.transaction(async (repository) => {
            await repository.save(repository.create(parent('a')));

            const [row] = await fixture.dataSource.query(`SELECT count(*) AS "n" FROM "${TABLE}"`) as Array<{ n: number }>;

            return row?.n;
        });

        expect(counted).toBe(1);

        const nested = await fixture.dataSource.transaction(async (manager) => {
            await manager.query(INSERT, [randomUUID(), 'b']);
            await manager.transaction(async (inner) => inner.query(INSERT, [randomUUID(), 'c']));

            const [row] = await fixture.dataSource.query(`SELECT count(*) AS "n" FROM "${TABLE}"`) as Array<{ n: number }>;

            return row?.n;
        });

        expect(nested).toBe(3);
    });

    it('a query runner\'s own transaction holds the connection until it ends', async () => {
        const runner = fixture.dataSource.createQueryRunner();

        await runner.startTransaction();
        await runner.query(INSERT, [randomUUID(), 'manual']);

        let saved = false;
        const save = repositories.parents.save(repositories.parents.create(parent('a'))).then(() => {
            saved = true;
        });

        // the adapter's save waits behind the open transaction
        await runner.query('SELECT 1');
        expect(saved).toBe(false);

        await runner.rollbackTransaction();
        await runner.release();
        await save;

        expect(await names()).toEqual(['a']);
    });

    it('every way into the data source works, alone and inside a transaction', async () => {
        const { dataSource, schemas } = fixture;

        const sweep = async (source: Pick<DataSource, 'query' | 'getRepository' | 'createQueryBuilder'>) => {
            const repository = source.getRepository(schemas.parent);
            const children = source.getRepository(schemas.child);
            const row = parent(randomUUID());

            await source.query('SELECT 1');
            await repository.save(row);
            await repository.insert(parent(randomUUID()));
            await repository.update({ id: row.id }, { label: 'updated' });
            await repository.upsert({ ...row, label: 'upserted' }, ['id']);
            await repository.increment({ id: row.id }, 'counter', 2);
            await children.save({
                id: randomUUID(),
                parentId: row.id,
                label: 'child',
            });

            expect(await repository.count()).toBeGreaterThan(1);
            expect(await repository.exists({ where: { id: row.id } })).toBe(true);
            expect(await children.createQueryBuilder('child').leftJoinAndSelect('child.parent', 'parent').getMany()).not.toHaveLength(0);
            expect(await source.createQueryBuilder(schemas.parent, 'parent').where('parent.id = :id', { id: row.id }).getOne())
                .toMatchObject({ counter: 2, label: 'upserted' });

            await source.createQueryBuilder().update(schemas.parent).set({ label: 'built' }).where('id = :id', { id: row.id }).execute();
            await source.createQueryBuilder().delete().from(schemas.child).execute();
        };

        await sweep(dataSource);
        await sweep(dataSource.manager);
        await dataSource.transaction(async (manager) => {
            await sweep(manager);
            // the data source itself joins the transaction it is used in
            await sweep(dataSource);
        });
        await dataSource.transaction('SERIALIZABLE', async (manager) => sweep(manager));

        expect(await dataSource.sql`SELECT count(*) AS "n" FROM "test_entity_parents"`).toEqual([{ n: 10 }]);
        expect(await dataSource.showMigrations()).toBe(false);
        expect(await dataSource.runMigrations()).toEqual([]);

        await dataSource.synchronize();
        expect(await names()).toHaveLength(10);
        await dataSource.dropDatabase();
        await dataSource.synchronize();
        expect(await names()).toEqual([]);
    });

    it('work inside a transaction joins it however it is started; work that escapes it does not', async () => {
        const { dataSource } = fixture;
        let escaped: (() => Promise<unknown>) | undefined;

        const failed = dataSource.manager.transaction(async (manager) => {
            await Promise.all([
                manager.query(INSERT, [randomUUID(), 'a']),
                dataSource.query(INSERT, [randomUUID(), 'b']),
                dataSource.transaction(async (inner) => {
                    await inner.query(INSERT, [randomUUID(), 'c']);
                    await dataSource.manager.transaction(async (innermost) => innermost.query(INSERT, [randomUUID(), 'd']));
                }),
            ]);

            // the repository base joins too: its write is part of this transaction
            await repositories.parents.save(repositories.parents.create(parent('e')));
            await repositories.parents.transaction(async (repository) => repository.save(repository.create(parent('f'))));

            // bound here: it still names this transaction when it runs after it
            escaped = AsyncResource.bind(() => dataSource.query(INSERT, [randomUUID(), 'escaped']));

            expect(await dataSource.query(`SELECT count(*) AS "n" FROM "${TABLE}"`)).toEqual([{ n: 6 }]);

            throw new Error('rolled back');
        });

        await expect(failed).rejects.toThrow('rolled back');
        await escaped!();

        expect(await names()).toEqual(['escaped']);
    });

    it('two guarded data sources are independent, also nested into each other', async () => {
        const other = await openFixtureDataSource('better-sqlite3', { guard: true });

        try {
            await fixture.dataSource.transaction(async (manager) => {
                await manager.query(INSERT, [randomUUID(), 'outer']);
                await other.dataSource.transaction(async (inner) => {
                    await inner.query(INSERT, [randomUUID(), 'inner']);
                    // still inside the outer data source's transaction
                    await fixture.dataSource.query(INSERT, [randomUUID(), 'outer too']);
                });
            });

            expect(await names()).toEqual(['outer', 'outer too']);
            expect(await other.dataSource.query(`SELECT "name" FROM "${TABLE}"`)).toEqual([{ name: 'inner' }]);
        } finally {
            await other.dataSource.destroy();
        }
    });

    it('a failing task, a failing query and a unique violation among parallel inserts leave it usable', async () => {
        const { dataSource } = fixture;
        const id = randomUUID();

        await expect(dataSource.transaction(async () => {
            throw new Error('task fails');
        })).rejects.toThrow('task fails');
        await expect(dataSource.query('SELECT * FROM "no_such_table"')).rejects.toThrow('no_such_table');

        const inserts = await Promise.allSettled([
            dataSource.query(INSERT, [id, 'same']),
            dataSource.query(INSERT, [randomUUID(), 'same']),
            dataSource.query(INSERT, [randomUUID(), 'other']),
            repositories.parents.save(repositories.parents.create(parent('same'))),
        ]);

        expect(inserts.map((insert) => insert.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected']);
        expect(await names()).toEqual(['other', 'same']);
    });

    it('closeDatabase runs after the work queued before it', async () => {
        const { dataSource } = fixture;
        const work = [
            dataSource.transaction(async (manager) => manager.query(INSERT, [randomUUID(), 'a'])),
            repositories.parents.save(repositories.parents.create(parent('b'))),
            dataSource.query(`SELECT count(*) AS "n" FROM "${TABLE}"`),
        ];
        const closing = closeDatabase(dataSource);

        expect((await Promise.all(work))[2]).toEqual([{ n: 2 }]);
        await closing;
        expect(dataSource.isInitialized).toBe(false);
    });

    it('stays guarded after it is closed and initialized again (the driver hands out a new runner)', async () => {
        const { dataSource } = fixture;
        const id = randomUUID();

        await closeDatabase(dataSource);
        await dataSource.initialize();
        await dataSource.query(INSERT, [id, 'counted']);

        const increment = (fail: boolean) => dataSource.transaction(async (manager) => {
            const [row] = await manager.query(`SELECT "counter" FROM "${TABLE}" WHERE "id" = ?`, [id]) as Array<{ counter: number }>;

            await Promise.resolve();
            await manager.query(`UPDATE "${TABLE}" SET "counter" = ? WHERE "id" = ?`, [row!.counter + 1, id]);

            if (fail) {
                throw new Error('rolled back');
            }
        });

        const outcomes = await Promise.allSettled([increment(false), increment(true), increment(false)]);

        expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
        expect(await dataSource.query(`SELECT "counter" FROM "${TABLE}" WHERE "id" = ?`, [id])).toEqual([{ counter: 2 }]);
    });

    it('is idempotent and leaves another driver alone', async () => {
        const { dataSource } = fixture;
        const { createQueryRunner } = dataSource;

        queueDataSource(dataSource);
        expect(dataSource.createQueryRunner).toBe(createQueryRunner);

        const postgres = new DataSource({ type: 'postgres', url: 'postgres://u:p@127.0.0.1:1/x' });
        const { createQueryRunner: original } = postgres;

        queueDataSource(postgres);
        expect(postgres.createQueryRunner).toBe(original);
    });
});
