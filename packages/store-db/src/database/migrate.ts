/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';
import { withDatabaseLock } from 'typeorm-extension';
import { pendingMigrations } from '../schema/module.ts';
import { assertLockName, toConfigurationError, toUnavailable } from './helpers.ts';
import type { MigrateDatabaseOptions } from './types.ts';

/** The migrate in flight per data source: the next one starts after it, since each names its migrations' `up` for its own run. */
const migrating = new WeakMap<DataSource, Promise<unknown>>();

async function migrate(dataSource: DataSource, options: MigrateDatabaseOptions): Promise<string[]> {
    // which migration runs: a failure names its class, never its statement
    let current: string | undefined;
    const restore: Array<() => void> = [];

    for (const migration of dataSource.migrations) {
        const { up } = migration;

        migration.up = async (queryRunner) => {
            current = migration.name ?? migration.constructor.name;
            await up.call(migration, queryRunner);
            current = undefined;
        };
        restore.push(() => {
            migration.up = up;
        });
    }

    try {
        const queryRunner = dataSource.createQueryRunner();

        try {
            return await withDatabaseLock(queryRunner, options.lockName, async () => {
                const executor = new MigrationExecutor(dataSource, queryRunner);

                executor.transaction = 'each';

                return (await executor.executePendingMigrations()).map((migration) => migration.name);
            });
        } finally {
            await queryRunner.release();
        }
    } catch (error) {
        // outside a migration's own code a TypeORM error without a driver is a mistake in the migration classes
        throw (current === undefined ? toConfigurationError(error) : undefined) ?? toUnavailable('migrate', error, current);
    } finally {
        restore.forEach((undo) => undo());
    }
}

/**
 * Runs the pending migrations of an app's database (its data source's
 * `migrations`, recorded in its `migrationsTableName`) under the
 * advisory lock `lockName`, each in its own transaction, so processes
 * starting at once run each migration once; calls on one data source run
 * one after the other. A mistake in the migration classes (a class name
 * without a timestamp) is a `DatabaseOptionsError` with TypeORM's
 * message; any other failure a `DatabaseUnavailableError` (operation
 * `migrate`, the driver's code and the failing migration's class name
 * only); the lock is released either way. Resolves with the names of the
 * migrations this call ran (decided under the lock). An empty lock name
 * is refused before anything runs.
 */
export async function migrateDatabase(dataSource: DataSource, options: MigrateDatabaseOptions): Promise<string[]> {
    assertLockName(options?.lockName);

    const run = (migrating.get(dataSource) ?? Promise.resolve()).then(() => migrate(dataSource, options));
    const settled = run.then(() => undefined, () => undefined);

    migrating.set(dataSource, settled);

    return run;
}

/**
 * The names of the app database's migrations not run yet, in order.
 * Read-only: a missing migrations table is never created. A mistake in
 * the migration classes is a `DatabaseOptionsError`; any other failure a
 * `DatabaseUnavailableError` (operation `read`, the driver's code only).
 */
export async function pendingDatabaseMigrations(dataSource: DataSource): Promise<string[]> {
    try {
        return await pendingMigrations(dataSource);
    } catch (error) {
        throw toConfigurationError(error) ?? toUnavailable('read', error);
    }
}
