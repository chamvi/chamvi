/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { DatabaseDriverMissingError } from '../error/driver-missing.ts';
import { DRIVER_MISSING_ERROR, DRIVER_PACKAGES } from './constants.ts';
import { queued, toConfigurationError, toUnavailable } from './helpers.ts';
import { queueDataSource } from './queue.ts';
import type { QueueDataSourceOptions } from './types.ts';

/** Destroys a data source a failed step opened; its own failure is not the one that matters. */
async function destroyQuietly(dataSource: DataSource): Promise<void> {
    try {
        await closeDatabase(dataSource);
    } catch {
        // the failure being reported is the caller's
    }
}

/**
 * A data source on `options`, connected; on better-sqlite3 it is guarded
 * for concurrent use (`queueDataSource`, with `queue`'s wait limit and
 * clock; ignored on PostgreSQL). A missing driver package is a
 * `DatabaseDriverMissingError` naming the package; an entity mistake
 * (TypeORM's metadata errors) a `DatabaseOptionsError` with TypeORM's
 * message; any other failure a
 * `DatabaseUnavailableError` (operation `connect`, the driver's code
 * only), with whatever was opened closed again.
 */
export async function connectDatabase(options: DataSourceOptions, queue: QueueDataSourceOptions = {}): Promise<DataSource> {
    let dataSource: DataSource;

    try {
        // the driver is loaded here, so a process loads only the one it uses
        dataSource = queueDataSource(new DataSource(options), queue);
    } catch (error) {
        if (isObject(error) && error.name === DRIVER_MISSING_ERROR) {
            throw new DatabaseDriverMissingError(DRIVER_PACKAGES[options.type] ?? options.type);
        }

        throw toUnavailable('connect', error);
    }

    try {
        await dataSource.initialize();
    } catch (error) {
        await destroyQuietly(dataSource);

        throw toConfigurationError(error) ?? toUnavailable('connect', error);
    }

    return dataSource;
}

/** Creates the entities' schema (SQLite only, never PostgreSQL), in the data source's queue. */
export async function synchronizeDatabase(dataSource: DataSource): Promise<void> {
    try {
        await queued(dataSource, () => dataSource.synchronize());
    } catch (error) {
        throw toUnavailable('synchronize', error);
    }
}

/**
 * Closes the data source once the work queued before ended; a no-op
 * when it is closed. It always finishes: behind a holder that does not
 * end (a transaction left open on better-sqlite3) it waits the queue's
 * deadline, then closes anyway, which rolls that transaction back.
 */
export async function closeDatabase(dataSource: DataSource): Promise<void> {
    try {
        await queued(dataSource, async () => {
            if (dataSource.isInitialized) {
                await dataSource.destroy();
            }
        }, { takeover: true });
    } catch (error) {
        throw toUnavailable('close', error);
    }
}
