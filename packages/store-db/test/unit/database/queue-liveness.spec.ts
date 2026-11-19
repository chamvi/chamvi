/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ControllableClock } from '@chamvi/test-kit';
import { MigrationExecutor, TransactionNotStartedError } from 'typeorm';
import type {
    DataSource,
    EntitySubscriberInterface,
    MigrationInterface,
    QueryRunner,
} from 'typeorm';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { closeDatabase } from '../../../src/database/index.ts';
import { isInTransaction, queueOf } from '../../../src/entity/helpers/serialize/index.ts';
import { DatabaseBusyError, DatabaseUnavailableError } from '../../../src/error/index.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource, FixtureDataSourceOptions } from '../../utils/entity/data-source.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';

const PARENTS = 'test_entity_parents';
const CHILDREN = 'test_entity_children';
const RECORDS = 'test_entity_records';
const WAIT_MS = 30_000;

/** A hang fails the case instead of the run. */
const TIMEOUT = 5_000;

const INSERT = `INSERT INTO "${PARENTS}" ("id", "name", "counter", "label", "created_at") VALUES (?, ?, 0, 'l', '2026-11-17 00:00:00.000')`;
const AUDIT = `INSERT INTO "${RECORDS}" ("id", "scope", "name", "value") VALUES (?, 'audit', ?, 0)`;

let clock: ControllableClock;
let fixture: FixtureDataSource;
let dataSource: DataSource;
let repositories: FixtureRepositories;

async function setup(options: FixtureDataSourceOptions = {}): Promise<void> {
    clock = new ControllableClock(new Date('2026-11-17T00:00:00.000Z'));
    fixture = await openFixtureDataSource('better-sqlite3', { ...options, guard: { clock, waitTimeoutMs: WAIT_MS } });
    ({ dataSource } = fixture);
    repositories = createFixtureRepositories(fixture);
}

/** Closes the data source whatever a case left open: the clock passes the deadline, so the close takes the connection. */
async function close(): Promise<void> {
    const closing = closeDatabase(dataSource);

    clock.advance(2 * WAIT_MS);
    await closing;
}

afterEach(async () => {
    await close();

    const queue = queueOf(dataSource);

    // nothing is left behind: no holder, no waiter, no timer
    expect([queue.unit, queue.waiters.length, queue.timer]).toEqual([undefined, 0, undefined]);
});

function parent(name: string) {
    return {
        id: randomUUID(),
        name,
        note: null,
        counter: 0,
        label: 'l',
        createdAt: new Date('2026-11-17T00:00:00.000Z'),
    };
}

async function names(table = PARENTS): Promise<string[]> {
    const rows = await dataSource.query(`SELECT "name" FROM "${table}" ORDER BY "name"`) as Array<{ name: string }>;

    return rows.map((row) => row.name);
}

type MigrationStep = (queryRunner: QueryRunner) => Promise<void>;

/** A migration class named `name` (TypeORM reads the timestamp from the name's end). */
function migration(name: string, up: MigrationStep, down: MigrationStep = async () => undefined): new () => MigrationInterface {
    return class implements MigrationInterface {
        name = name;

        up = up;

        down = down;
    };
}

/** Lets everything that can run without the clock run (the driver is synchronous: no I/O is pending). */
async function settle(): Promise<void> {
    for (let turn = 0; turn < 200; turn++) {
        await Promise.resolve();
    }
}

/** `pending`, or how the promise settled. */
async function stateOf(promise: Promise<unknown>): Promise<string> {
    let state = 'pending';

    promise.then(() => {
        state = 'fulfilled';
    }, () => {
        state = 'rejected';
    });
    await settle();

    return state;
}

describe('a guarded better-sqlite3 data source never waits without an end', () => {
    describe('a query runner of the caller\'s own', () => {
        it('a transaction of the manager of a runner that holds the connection joins (a savepoint)', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.startTransaction();
            await runner.manager.transaction(async (manager) => manager.query(INSERT, [randomUUID(), 'inner']));
            await runner.manager.getRepository(fixture.schemas.parent).save(parent('saved'));
            expect(await runner.query(`SELECT count(*) AS "n" FROM "${PARENTS}"`)).toEqual([{ n: 2 }]);
            await runner.rollbackTransaction();
            await runner.release();

            expect(await names()).toEqual([]);

            // a runner outside a transaction: its manager's transaction is one of its own
            await runner.query('SELECT 1');
            await runner.manager.transaction(async (manager) => manager.query(INSERT, [randomUUID(), 'kept']));

            expect(await names()).toEqual(['kept']);
        }, TIMEOUT);

        it('a runner that is used outside a transaction and never released holds nothing', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.query('SELECT 1');

            expect(await dataSource.query('SELECT 1 AS "one"')).toEqual([{ one: 1 }]);
            await repositories.parents.save(repositories.parents.create(parent('a')));
            expect(await repositories.parents.findManyBy({})).toHaveLength(1);

            await closeDatabase(dataSource);
            expect(dataSource.isInitialized).toBe(false);
        }, TIMEOUT);

        it('a runner outside the open transaction sees none and cannot end it', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();
            const other = dataSource.createQueryRunner();

            await runner.startTransaction();
            await runner.query(INSERT, [randomUUID(), 'mine']);

            expect([runner.isTransactionActive, other.isTransactionActive]).toEqual([true, false]);
            await expect(other.rollbackTransaction()).rejects.toThrow(TransactionNotStartedError);
            await expect(other.commitTransaction()).rejects.toThrow(TransactionNotStartedError);
            // a release of the other runner leaves the transaction's runner state alone
            await other.release();

            await runner.commitTransaction();

            expect(await names()).toEqual(['mine']);
        }, TIMEOUT);

        it('a transaction begun with a plain BEGIN holds the connection until its ROLLBACK', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.query('BEGIN');
            await runner.query(INSERT, [randomUUID(), 'undone']);

            const other = dataSource.query(INSERT, [randomUUID(), 'other']);

            expect(await stateOf(other)).toBe('pending');

            await runner.query('ROLLBACK');
            await other;

            expect(await names()).toEqual(['other']);
        }, TIMEOUT);
    });

    describe('foreign keys', () => {
        const ORPHAN = `INSERT INTO "${CHILDREN}" ("id", "parent_id", "label") VALUES (?, ?, 'orphan')`;

        it('a runner\'s clearDatabase is one unit: no statement of another caller runs while it has foreign keys off', async () => {
            await setup();

            const [cleared, orphan] = await Promise.allSettled([
                dataSource.createQueryRunner().clearDatabase(),
                dataSource.query(ORPHAN, [randomUUID(), randomUUID()]),
            ]);

            // the insert ran after the tables were dropped, never between the pragma and the transaction
            expect(cleared.status).toBe('fulfilled');
            expect(orphan).toMatchObject({ status: 'rejected', reason: { message: expect.stringContaining('no such table') } });
        }, TIMEOUT);

        it('a migration that fails leaves foreign keys enforced for other callers during and after it', async () => {
            const Failing = migration('Failing1795000000002', async (queryRunner) => {
                await queryRunner.query('SELECT * FROM "no_such_table"');
            });

            await setup({ migrations: [Failing] });

            const [migrated, orphan] = await Promise.allSettled([
                dataSource.runMigrations({ transaction: 'all' }),
                dataSource.query(ORPHAN, [randomUUID(), randomUUID()]),
            ]);

            expect(migrated.status).toBe('rejected');
            expect(orphan).toMatchObject({ status: 'rejected', reason: { message: expect.stringContaining('FOREIGN KEY') } });
            await expect(dataSource.query(ORPHAN, [randomUUID(), randomUUID()])).rejects.toThrow('FOREIGN KEY');
        }, TIMEOUT);
    });

    describe('a transaction nobody owns', () => {
        it('two nested transactions at once on one manager: once the outer one settled, the connection is free and nothing of it stays', async () => {
            await setup();

            // TypeORM sends the same SAVEPOINT twice, the second fails and its ROLLBACK TO SAVEPOINT is swallowed
            const outcome = await dataSource.transaction(async (manager) => Promise.all([
                manager.transaction(async (inner) => inner.query(INSERT, [randomUUID(), 'a'])),
                manager.transaction(async (inner) => inner.query(INSERT, [randomUUID(), 'b'])),
            ])).then(() => 'fulfilled', () => 'rejected');

            expect(outcome).toBe('rejected');
            expect(queueOf(dataSource).unit).toBeUndefined();
            expect(isInTransaction(dataSource)).toBe(false);
            // no wait behind it, no deadline: the next caller runs at once, outside any transaction
            expect(await stateOf(dataSource.query(INSERT, [randomUUID(), 'next']))).toBe('fulfilled');
            expect(await names()).toEqual(['next']);
        }, TIMEOUT);

        it('an outer transaction that commits leaves no transaction behind either', async () => {
            await setup();

            await dataSource.transaction(async (manager) => {
                await manager.transaction(async (inner) => inner.query(INSERT, [randomUUID(), 'a']));
                await manager.transaction(async (inner) => inner.query(INSERT, [randomUUID(), 'b']));
            });

            expect(queueOf(dataSource).unit).toBeUndefined();
            expect(await names()).toEqual(['a', 'b']);
        }, TIMEOUT);

        it('a transaction a runner opened by hand is never ended by the guard', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.startTransaction();
            await runner.manager.transaction(async (inner) => inner.query(INSERT, [randomUUID(), 'held']));

            // the runner's own transaction is still open: its owner ends it
            expect(isInTransaction(dataSource)).toBe(true);
            await runner.commitTransaction();
            expect(await names()).toEqual(['held']);
        }, TIMEOUT);
    });

    describe('a transaction opened by hand and never ended', () => {
        it('work behind it is refused at the deadline, and the transaction goes on', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.startTransaction();
            await runner.query(INSERT, [randomUUID(), 'held']);

            const query = dataSource.query('SELECT 1');
            const save = repositories.parents.save(repositories.parents.create(parent('refused')));
            const transaction = dataSource.transaction(async (manager) => manager.query(INSERT, [randomUUID(), 'refused too']));

            clock.advance(WAIT_MS - 1);
            expect(await stateOf(Promise.race([query, save, transaction]))).toBe('pending');

            clock.advance(1);

            for (const refused of [query, save, transaction]) {
                const error = await refused.then(() => undefined, (reason: unknown) => reason);

                expect(error).toBeInstanceOf(DatabaseBusyError);
                expect(error).toBeInstanceOf(DatabaseUnavailableError);
                expect(error).toMatchObject({
                    code: 'database_unavailable',
                    operation: 'wait',
                    waitedMs: WAIT_MS,
                    holder: 'transaction',
                    message: `The database could not complete the wait: a transaction is still open on this data source after ${WAIT_MS} ms. ` +
                        'Inside a transaction opened by hand on a query runner, use that runner or its manager, and end every transaction you open.',
                });
            }

            // the holder is not touched: it goes on and commits, and the data source is free again
            await runner.query(INSERT, [randomUUID(), 'held too']);
            await runner.commitTransaction();

            expect(await names()).toEqual(['held', 'held too']);
        }, TIMEOUT);

        it('work behind an operation that has not returned is refused at the deadline, without speaking of a transaction', async () => {
            const { promise: never, resolve: finish } = Promise.withResolvers<void>();
            const Waiting = migration('Waiting1795000000003', async () => {
                await never;
            });

            await setup({ migrations: [Waiting] });

            const migrating = dataSource.runMigrations({ transaction: 'none' });

            await settle();

            const query = dataSource.query('SELECT 1');

            clock.advance(WAIT_MS);

            const error = await query.then(() => undefined, (reason: unknown) => reason);

            expect(error).toBeInstanceOf(DatabaseBusyError);
            expect(error).toMatchObject({
                holder: 'operation',
                message: `The database could not complete the wait: an operation on this data source has not returned after ${WAIT_MS} ms. ` +
                    'Work it waits for must run inside it (through its query runner, manager or callback), not beside it.',
            });
            expect((error as Error).message).not.toContain('transaction');

            finish();
            await migrating;
        }, TIMEOUT);

        it('a waiter\'s deadline starts again with every holder', async () => {
            await setup();

            const first = dataSource.createQueryRunner();
            const second = dataSource.createQueryRunner();

            await first.startTransaction();

            const next = second.startTransaction();
            const query = dataSource.query('SELECT 1 AS "one"');

            clock.advance(WAIT_MS - 1);
            await first.commitTransaction();
            await next;

            // the query waited the whole deadline, but not behind one holder
            clock.advance(WAIT_MS - 1);
            expect(await stateOf(query)).toBe('pending');

            await second.commitTransaction();
            expect(await query).toEqual([{ one: 1 }]);
        }, TIMEOUT);

        it('work through another handle inside it is refused, never joined', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.startTransaction();

            const outside = dataSource.getRepository(fixture.schemas.parent).find();

            clock.advance(WAIT_MS);
            await expect(outside).rejects.toThrow(DatabaseBusyError);
            await runner.rollbackTransaction();
        }, TIMEOUT);

        it('closeDatabase finishes at the deadline and the transaction is rolled back', async () => {
            await setup();

            const runner = dataSource.createQueryRunner();

            await runner.startTransaction();
            await runner.query(INSERT, [randomUUID(), 'held']);

            const waiting = dataSource.query('SELECT 1');
            const closing = closeDatabase(dataSource);

            clock.advance(WAIT_MS - 1);
            expect(await stateOf(closing)).toBe('pending');

            clock.advance(1);
            await closing;

            expect(dataSource.isInitialized).toBe(false);
            await expect(waiting).rejects.toThrow(DatabaseBusyError);
            // the holder's next statement fails on the closed connection instead of waiting
            await expect(runner.query('SELECT 1')).rejects.toThrow();
            await expect(runner.commitTransaction()).rejects.toThrow();
        }, TIMEOUT);

        it('a callback that waits for work outside its scope is refused at the deadline and rolled back', async () => {
            await setup();

            // bound outside the transaction: the query does not run inside the callback's scope
            const outside = AsyncResource.bind(() => dataSource.query('SELECT 1'));
            const transaction = dataSource.transaction(async (manager) => {
                await manager.query(INSERT, [randomUUID(), 'undone']);
                await outside();
            });

            await settle();
            clock.advance(WAIT_MS);

            await expect(transaction).rejects.toThrow(DatabaseBusyError);
            expect(await names()).toEqual([]);
        }, TIMEOUT);
    });

    describe('closing', () => {
        it('a direct destroy() waits for the work queued before it', async () => {
            await setup();

            const { promise: gate, resolve: open } = Promise.withResolvers<void>();
            const transaction = dataSource.transaction(async (manager) => {
                await gate;
                await manager.query(INSERT, [randomUUID(), 'a']);

                return manager.query(`SELECT count(*) AS "n" FROM "${PARENTS}"`);
            });
            const query = dataSource.query('SELECT 2 AS "two"');
            const destroyed = dataSource.destroy();

            expect(await stateOf(destroyed)).toBe('pending');
            open();

            expect(await transaction).toEqual([{ n: 1 }]);
            expect(await query).toEqual([{ two: 2 }]);
            await destroyed;
            expect(dataSource.isInitialized).toBe(false);
        }, TIMEOUT);

        it('two closes at once close once', async () => {
            await setup();

            await Promise.all([closeDatabase(dataSource), closeDatabase(dataSource)]);
            expect(dataSource.isInitialized).toBe(false);
        }, TIMEOUT);
    });

    describe('subscribers', () => {
        /** Writes an audit row for every parent insert, through the handle `pick` takes from the event. */
        function auditor(pick: (event: {
            manager: { query: QueryRunner['query'] };
            queryRunner: QueryRunner;
            connection: DataSource
        }) => { query(sql: string, parameters?: unknown[]): Promise<unknown> }): EntitySubscriberInterface {
            return {
                async beforeInsert(event) {
                    await pick(event).query(`SELECT count(*) FROM "${PARENTS}"`);
                },
                async afterInsert(event) {
                    if (event.metadata.tableName !== PARENTS) {
                        return;
                    }

                    await pick(event).query(AUDIT, [randomUUID(), (event.entity as { name: string }).name]);
                },
            };
        }

        it.each([
            ['event.manager', (event: { manager: unknown }) => event.manager],
            ['event.queryRunner', (event: { queryRunner: unknown }) => event.queryRunner],
            ['event.connection', (event: { connection: unknown }) => event.connection],
            ['a transaction of event.connection', (event: { connection: DataSource }) => ({ query: (sql: string, parameters?: unknown[]) => event.connection.transaction((manager) => manager.query(sql, parameters)) })],
        ] as const)('%s works for the operation that fired the event, beside other callers', async (_name, pick) => {
            await setup();
            dataSource.subscribers.push(auditor(pick as Parameters<typeof auditor>[0]));

            const repository = dataSource.getRepository(fixture.schemas.parent);

            // a single save, no other caller
            await repository.save(parent('single'));

            const failing = dataSource.transaction(async (manager) => {
                await manager.getRepository(fixture.schemas.parent).save(parent('undone'));

                throw new Error('rolled back');
            });

            await Promise.all([
                repository.save(parent('a')),
                dataSource.query('SELECT 1'),
                repository.save(parent('b')),
                expect(failing).rejects.toThrow('rolled back'),
                dataSource.query('SELECT 1'),
                repository.save(parent('c')),
            ]);

            // every audit row was written in its save's transaction: the rolled back save left none
            expect(await names()).toEqual(['a', 'b', 'c', 'single']);
            expect(await names(RECORDS)).toEqual(['a', 'b', 'c', 'single']);
        }, TIMEOUT);

        it('an afterLoad subscriber reads through every handle of its event beside parallel finds', async () => {
            await setup();

            const repository = dataSource.getRepository(fixture.schemas.parent);
            let loads = 0;

            await repository.save([parent('a'), parent('b')]);
            dataSource.subscribers.push({
                async afterLoad(_entity, event) {
                    await event!.manager.query('SELECT 1');
                    await event!.connection.query('SELECT 1');
                    await event!.queryRunner.query('SELECT 1');
                    loads += 1;
                },
            });

            const [first, second] = await Promise.all([
                repository.find(),
                repository.find(),
                dataSource.query('SELECT 1'),
                dataSource.transaction(async (manager) => manager.getRepository(fixture.schemas.parent).find()),
            ]);

            expect([first.length, second.length, loads]).toEqual([2, 2, 6]);
        }, TIMEOUT);
    });

    describe('migrations', () => {
        // no timestamp at the end of its name: TypeORM refuses it before it releases its runner
        const Misnamed = migration('Misnamed', async () => undefined);

        /** Writes through the data source of the runner it is given: another handle than the runner. */
        const Notes = migration('Notes1795000000001', async (queryRunner) => {
            await queryRunner.query('CREATE TABLE "notes" ("name" varchar PRIMARY KEY)');
            await queryRunner.connection.query('INSERT INTO "notes" ("name") VALUES (\'first\')');
            await queryRunner.manager.transaction(async (manager) => manager.query('INSERT INTO "notes" ("name") VALUES (\'second\')'));
        }, async (queryRunner) => {
            await queryRunner.connection.query('DELETE FROM "notes"');
            await queryRunner.query('DROP TABLE "notes"');
        });

        it('a runMigrations that fails before it releases its runner leaves the data source usable', async () => {
            await setup({ migrations: [Misnamed] });

            await expect(dataSource.runMigrations()).rejects.toThrow('migration name is wrong');
            await expect(dataSource.showMigrations()).rejects.toThrow('migration name is wrong');

            expect(await dataSource.query('SELECT 1 AS "one"')).toEqual([{ one: 1 }]);
            await repositories.parents.save(repositories.parents.create(parent('a')));

            await closeDatabase(dataSource);
            expect(dataSource.isInitialized).toBe(false);
        }, TIMEOUT);

        it.each(['all', 'each', 'none'] as const)('a migration\'s up and down reach the data source of their runner (transaction %s)', async (transaction) => {
            await setup({ migrations: [Notes] });

            expect(await dataSource.showMigrations()).toBe(true);
            await dataSource.runMigrations({ transaction });
            expect(await names('notes')).toEqual(['first', 'second']);

            await dataSource.undoLastMigration({ transaction });
            expect(await dataSource.query('SELECT count(*) AS "n" FROM sqlite_master WHERE "name" = \'notes\'')).toEqual([{ n: 0 }]);
        }, TIMEOUT);

        it('a migration under an executor of the caller\'s own runner reaches the data source too, beside other callers', async () => {
            await setup({ migrations: [Notes] });

            const runner = dataSource.createQueryRunner();
            const executor = new MigrationExecutor(dataSource, runner);

            executor.transaction = 'each';

            await Promise.all([
                executor.executePendingMigrations(),
                dataSource.query(INSERT, [randomUUID(), 'beside']),
                repositories.parents.save(repositories.parents.create(parent('adapter'))),
            ]);

            expect(await names('notes')).toEqual(['first', 'second']);
            expect(await names()).toEqual(['adapter', 'beside']);
        }, TIMEOUT);

        it('a schema build that fails leaves the data source usable', async () => {
            await setup();

            // the build fails inside its transaction: the table it wants to create exists as a view
            await dataSource.query(`DROP TABLE "${CHILDREN}"`);
            await dataSource.query(`CREATE VIEW "${CHILDREN}" AS SELECT 1 AS "id"`);
            await expect(dataSource.synchronize()).rejects.toThrow();

            expect(await dataSource.query('SELECT 1 AS "one"')).toEqual([{ one: 1 }]);
            await repositories.parents.save(repositories.parents.create(parent('a')));
            expect(await names()).toEqual(['a']);
        }, TIMEOUT);
    });
});
