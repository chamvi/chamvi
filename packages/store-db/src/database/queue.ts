/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    DataSource,
    EntityManager,
    MigrationInterface,
    QueryRunner,
} from 'typeorm';
import { SERIALIZED_DRIVERS } from '../entity/constants.ts';
import {
    acquireQueue,
    createUnit,
    dropQueueHold,
    isInTransaction,
    passQueue,
    queueOf,
    runInUnit,
    scopedUnit,
    serialize,
} from '../entity/helpers/serialize/index.ts';
import type { Queue, QueueUnit } from '../entity/types.ts';
import type { QueueDataSourceOptions } from './types.ts';

/*
 * The guard of a better-sqlite3 data source. The driver has one
 * connection and one query runner object for every caller, so the guard
 * hands each `createQueryRunner()` call a runner of its own over that
 * object and lets one unit of work use the connection at a time (the
 * queue in `entity/helpers/serialize/`, shared with the repository
 * base).
 *
 * 1. A unit is one statement, one open transaction (from its outermost
 *    BEGIN to the COMMIT or ROLLBACK that leaves the connection without
 *    one), or one whole operation (a `serialize` callback, the data
 *    source's `synchronize`, `dropDatabase`, `runMigrations`,
 *    `undoLastMigration`, `showMigrations` and `destroy`, a runner's
 *    `clearDatabase`). Obtaining a runner takes nothing and
 *    `release()` gives nothing back: only a call in flight or an open
 *    transaction holds the connection.
 * 2. A call joins the open unit, and never waits for it, when it comes
 *    through a runner that is part of the unit (the one that opened it,
 *    its manager and repositories, a runner that joined before) or from
 *    code inside the unit's scope: the callback of a `transaction()`, a
 *    subscriber or entity listener of an operation of the unit, a
 *    migration's `up`/`down`, through whatever handle that code uses.
 * 3. Every other call waits until the open unit ended: no statement runs
 *    inside a transaction of another caller, and a runner outside the
 *    unit sees no transaction (`isTransactionActive` is false, a
 *    `commitTransaction()` or `rollbackTransaction()` is refused as not
 *    started), so it cannot commit, roll back or nest into it.
 * 4. Nothing waits without an end. A transaction opened by hand and left
 *    open, or a callback that waits for work outside its scope, is a
 *    holder nobody else can end: work behind it is refused with
 *    `DatabaseBusyError` after the deadline, and closing the data source
 *    takes the connection at the deadline (SQLite rolls the open
 *    transaction back on close).
 * 5. Subscribers get the runner and manager of the operation that fired
 *    the event; `manager`, `data` and `broadcaster` belong to each
 *    runner, every other state to the shared one.
 */

/**
 * The runner methods that are a unit of their own outside one: those
 * that reach the connection themselves (every other method goes through
 * them), and `clearDatabase`, which switches foreign keys off around its
 * transaction.
 */
const UNIT_METHODS = ['query', 'startTransaction', 'beforeMigration', 'afterMigration', 'loadPragmaRecords', 'clearDatabase'];

/** The runner methods that end a transaction: for a runner that is part of the open one only. */
const END_METHODS = ['commitTransaction', 'rollbackTransaction'];

/** The data source operations that are one unit from start to end. */
const WHOLE_OPERATIONS = ['synchronize', 'dropDatabase', 'runMigrations', 'undoLastMigration', 'showMigrations'] as const;

/** What a runner sees of the transaction while another caller's unit holds the connection. */
const NO_TRANSACTION = new Map<PropertyKey, unknown>([['isTransactionActive', false], ['transactionDepth', 0]]);

/** The state every runner keeps for itself. */
const OWN_STATE: PropertyKey[] = ['manager', 'data'];

type Method = (...args: unknown[]) => unknown;

const guarded = new WeakSet<DataSource>();

function define(target: object, key: string, value: unknown): void {
    Object.defineProperty(target, key, {
        value,
        configurable: true,
        writable: true,
    });
}

/** The open unit when `runner` is part of it or this code runs inside it (the runner then becomes part of it). */
function join(queue: Queue, runner: object): QueueUnit | undefined {
    const { unit } = queue;

    if (!unit || unit.members.has(runner)) {
        return unit;
    }

    if (scopedUnit(queue)) {
        unit.members.add(runner);
        unit.owned = true;

        return unit;
    }

    return undefined;
}

/** Runs `fn` inside the scope of the unit `runner` is part of, so what `fn` reaches through any handle joins it. */
function within<R>(queue: Queue, runner: object, fn: () => R): R {
    const unit = join(queue, runner);

    return unit ? runInUnit(unit, fn) : fn();
}

/** A unit of `runner`'s own, once the connection is free. */
async function open(queue: Queue, runner: object, shared: QueryRunner): Promise<QueueUnit> {
    const unit = createUnit();

    unit.members.add(runner);
    unit.owned = true;

    await acquireQueue(queue, unit);

    if (!isInTransaction(queue.dataSource)) {
        // whatever the last holder left behind (a BEGIN that failed, a COMMIT sent as a plain query)
        Object.assign(shared, { isTransactionActive: false, transactionDepth: 0 });
    }

    return unit;
}

/** A broadcaster of `runner`: its events name this runner and its manager, and its subscribers run inside the runner's unit. */
function createBroadcaster(queue: Queue, runner: QueryRunner, shared: QueryRunner): QueryRunner['broadcaster'] {
    const Broadcaster = shared.broadcaster.constructor as new (queryRunner: QueryRunner) => QueryRunner['broadcaster'];

    return new Proxy(new Broadcaster(runner), {
        get(target, key) {
            const value: unknown = Reflect.get(target, key, target);

            if (typeof value !== 'function') {
                return value;
            }

            return (...args: unknown[]) => within(queue, runner, () => (value as Method).apply(target, args));
        },
    });
}

/** A query runner of one `createQueryRunner()` call over the driver's one shared runner (rules 1 to 3 and 5). */
function createRunner(queue: Queue, shared: QueryRunner): QueryRunner {
    const own = new Map<PropertyKey, unknown>([['data', {}]]);

    const runner: QueryRunner = new Proxy(shared, {
        get(target, key) {
            if (own.has(key)) {
                return own.get(key);
            }

            if (NO_TRANSACTION.has(key) && queue.unit && !queue.unit.members.has(runner) && !scopedUnit(queue)) {
                return NO_TRANSACTION.get(key);
            }

            // methods run with this runner as `this`, so what they call comes back through it
            return Reflect.get(target, key, runner);
        },
        set(target, key, value) {
            if (OWN_STATE.includes(key)) {
                own.set(key, value);

                return true;
            }

            return Reflect.set(target, key, value);
        },
    });

    const call = async (name: string, args: unknown[], unit: QueueUnit) => {
        unit.holds += 1;

        try {
            return await (Reflect.get(shared, name) as Method).apply(runner, args);
        } finally {
            dropQueueHold(queue, unit);
        }
    };

    for (const name of UNIT_METHODS.filter((method) => method in shared)) {
        own.set(name, async (...args: unknown[]) => call(name, args, join(queue, runner) ?? await open(queue, runner, shared)));
    }

    for (const name of END_METHODS) {
        own.set(name, async (...args: unknown[]) => {
            const unit = join(queue, runner);

            // outside the open unit the runner sees no transaction: TypeORM refuses it as not started
            return unit ? call(name, args, unit) : (Reflect.get(shared, name) as Method).apply(runner, args);
        });
    }

    own.set('release', async () => {
        // the shared runner's table cache and sql memory belong to the unit that holds the connection
        if (!queue.unit || join(queue, runner)) {
            await shared.release.call(runner);
        }
    });
    own.set('broadcaster', createBroadcaster(queue, runner, shared));

    return runner;
}

/**
 * Ends the transaction a `transaction()` call left open although it
 * settled and nothing of it is in flight: TypeORM sends one SAVEPOINT
 * twice for two nested transactions started at once on one manager,
 * swallows the failing ROLLBACK TO SAVEPOINT, and leaves the connection
 * in the outer BEGIN with nobody to end it. Rolled back, the connection
 * is free again; without this every later caller would wait the deadline
 * and be refused, until the data source closed.
 */
function endAbandoned(queue: Queue, unit: QueueUnit | undefined): void {
    if (!unit || queue.unit !== unit || unit.holds > 0 || !isInTransaction(queue.dataSource)) {
        return;
    }

    const { driver } = queue.dataSource as { driver: { databaseConnection?: { exec(sql: string): unknown }; createQueryRunner(mode: 'master'): QueryRunner } };

    driver.databaseConnection?.exec('ROLLBACK');
    Object.assign(driver.createQueryRunner('master'), { isTransactionActive: false, transactionDepth: 0 });
    passQueue(queue);
}

/**
 * `manager.transaction(fn)` runs `fn` inside its transaction's unit; a
 * call that opened its own unit (not one inside another unit) ends what
 * it leaves open once it settled (`endAbandoned`).
 */
function scopeTransactions(queue: Queue, manager: EntityManager): EntityManager {
    const { transaction } = manager;

    define(manager, 'transaction', async (...args: unknown[]) => {
        const own = !scopedUnit(queue) && !(manager.queryRunner && queue.unit?.members.has(manager.queryRunner));
        let opened: QueueUnit | undefined;

        try {
            return await (transaction as Method).apply(manager, args.map((arg) => {
                if (typeof arg !== 'function') {
                    return arg;
                }

                return (inner: EntityManager) => {
                    const runner = inner.queryRunner ?? inner;

                    opened ??= own ? join(queue, runner) : undefined;

                    return within(queue, runner, () => (arg as Method)(inner));
                };
            }));
        } finally {
            endAbandoned(queue, opened);
        }
    });

    return manager;
}

/** A migration's `up` and `down` run inside the unit of the runner they are given. */
function scopeMigrations(queue: Queue, migrations: MigrationInterface[], scoped: WeakSet<Method>): void {
    for (const migration of migrations) {
        for (const name of ['up', 'down'] as const) {
            const run = migration[name] as Method | undefined;

            if (typeof run !== 'function' || scoped.has(run)) {
                continue;
            }

            const inside: Method = (queryRunner) => within(queue, queryRunner as object, () => run.call(migration, queryRunner));

            scoped.add(inside);
            define(migration, name, inside);
        }
    }
}

/**
 * Runs a whole operation and leaves foreign keys enforced when it found
 * them enforced: TypeORM switches them off around a migration and not
 * back on when the migration fails.
 */
async function keepForeignKeys<R>(dataSource: DataSource, work: () => Promise<R>): Promise<R> {
    type Connection = { open: boolean; pragma(source: string, options?: { simple: boolean }): unknown };

    const connection = () => (dataSource.driver as { databaseConnection?: Connection }).databaseConnection;
    const enforced = () => connection()?.open === true && connection()?.pragma('foreign_keys', { simple: true }) === 1;
    const before = enforced();

    try {
        return await work();
    } finally {
        // inside a transaction the pragma does nothing: the operation that owns it switches it back
        if (before && connection()?.open === true && !enforced() && !isInTransaction(dataSource)) {
            connection()?.pragma('foreign_keys = ON');
        }
    }
}

/**
 * Makes a better-sqlite3 data source safe to use from concurrent
 * callers: every use of it (`query()`, `transaction()`, repositories,
 * query builders, `createQueryRunner()` with a transaction of its own,
 * `synchronize()`, migrations, the repository base) is one unit of work
 * on its one connection, units run one after the other, and work inside
 * a unit joins it (the rules at the top of this file). Call it before
 * the data source is used; idempotent; returns the data source unchanged
 * for any other driver.
 *
 * Limits: inside a transaction opened by hand on a query runner
 * (`startTransaction()`), use that runner or its manager: work through
 * another handle waits for the transaction and is refused with
 * `DatabaseBusyError` after `waitTimeoutMs`, as is any work behind a
 * transaction that is never ended. The connection `queryRunner.connect()`
 * returns is not guarded. A `MigrationExecutor` or schema builder driven
 * by hand is not one unit: it is guarded statement by statement and
 * transaction by transaction, so other callers' units may run between
 * its steps; `dataSource.runMigrations()`, `undoLastMigration()` and
 * `synchronize()` are one unit each.
 */
export function queueDataSource(dataSource: DataSource, options: QueueDataSourceOptions = {}): DataSource {
    if (!SERIALIZED_DRIVERS.includes(dataSource.options.type)) {
        return dataSource;
    }

    const queue = queueOf(dataSource, options);

    if (guarded.has(dataSource)) {
        return dataSource;
    }

    guarded.add(dataSource);

    const createEntityManager = dataSource.createEntityManager.bind(dataSource);
    const destroy = dataSource.destroy.bind(dataSource);
    const scoped = new WeakSet<Method>();
    let migrations: unknown;

    define(dataSource, 'createQueryRunner', (mode?: 'master' | 'slave') => {
        if (migrations !== dataSource.migrations) {
            ({ migrations } = dataSource);
            scopeMigrations(queue, dataSource.migrations, scoped);
        }

        // the driver is read on every call: it hands out one runner object until the data source is closed
        const runner = createRunner(queue, dataSource.driver.createQueryRunner(mode ?? 'master'));

        Object.assign(runner, { manager: dataSource.createEntityManager(runner) });

        return runner;
    });
    define(dataSource, 'createEntityManager', (queryRunner?: QueryRunner) => scopeTransactions(queue, createEntityManager(queryRunner)));
    scopeTransactions(queue, dataSource.manager);

    for (const name of WHOLE_OPERATIONS) {
        const operation = dataSource[name].bind(dataSource) as Method;

        define(dataSource, name, (...args: unknown[]) => serialize(dataSource, () => keepForeignKeys(dataSource, async () => operation(...args))));
    }

    // closing waits its turn, and at the deadline takes the connection from a holder that never ends
    define(dataSource, 'destroy', () => serialize(dataSource, destroy, { takeover: true }));

    return dataSource;
}
