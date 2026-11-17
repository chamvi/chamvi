/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { DataSource } from 'typeorm';
import { TEST_CONNECT_TIMEOUT_MS, TEST_MIGRATIONS_TABLE } from './constants.ts';
import { loadDatabaseStore, testDatabaseName } from './helpers.ts';
import type { TestDataSourceOptions, TestDatabaseStore } from './types.ts';

async function createPostgresDataSource(db: TestDatabaseStore, options: TestDataSourceOptions, url: string): Promise<DataSource> {
    const name = testDatabaseName();
    const server = () => db.connectDatabase({
        type: 'postgres',
        url,
        entities: [],
        logging: false,
        connectTimeoutMS: TEST_CONNECT_TIMEOUT_MS,
    });
    // CREATE and DROP DATABASE have no ORM form; the name is generated, so quoting it is enough
    const drop = async () => {
        const admin = await server();

        try {
            await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        } finally {
            await db.closeDatabase(admin);
        }
    };
    const admin = await server();

    try {
        await admin.query(`CREATE DATABASE "${name}"`);
    } finally {
        await db.closeDatabase(admin);
    }

    const target = new URL(url);

    target.pathname = `/${name}`;

    let dataSource: DataSource;

    try {
        const { options: connection } = db.buildDatabaseOptions({
            url: target.href,
            production: false,
            mode: 'start',
            entities: options.entities,
            migrations: [],
            migrationsTableName: TEST_MIGRATIONS_TABLE,
            connectTimeoutMs: TEST_CONNECT_TIMEOUT_MS,
        });

        dataSource = await db.connectDatabase(connection);
        // a throwaway database: its schema comes from the entities, as on SQLite
        await dataSource.synchronize();
    } catch (error) {
        await drop().catch(() => {});

        throw error;
    }

    const destroy = dataSource.destroy.bind(dataSource);

    Object.defineProperty(dataSource, 'destroy', {
        configurable: true,
        writable: true,
        value: async () => {
            // the database is this helper's own: dropped even when closing failed (FORCE ends what stayed open)
            try {
                await destroy();
            } finally {
                await drop();
            }
        },
    });

    return dataSource;
}

/**
 * A data source for a spec of an app's database code, built as an app's
 * `databaseModule` builds its own (`@chamvi/store-db`'s options, UTC,
 * no logging), its schema synchronized from `entities`:
 *
 * - default: SQLite in memory, guarded as the app's is (`queueDataSource`:
 *   transactions and statements of concurrent callers run one after the
 *   other, so a compare-and-set in a transaction holds as in the app);
 * - with `url`: a new database of its own on that PostgreSQL server,
 *   its schema from `synchronize()` as on SQLite: a database this helper
 *   created and drops again is throwaway, never an app's real one (which
 *   only migrations change).
 *
 * Each call is a database of its own (one per spec file, or per test).
 * The caller destroys the data source (`destroy()`), which also drops a
 * PostgreSQL database again, even when closing it fails. Needs `@chamvi/store-db`, `typeorm` and the
 * driver (`better-sqlite3` or `pg`); none of them is loaded before the
 * first call.
 */
export async function createTestDataSource(options: TestDataSourceOptions): Promise<DataSource> {
    const db = await loadDatabaseStore();

    if (options.url !== undefined) {
        const protocol = URL.canParse(options.url) ? new URL(options.url).protocol : undefined;

        if (protocol === undefined || !db.POSTGRES_PROTOCOLS.includes(protocol)) {
            throw new InvalidAgentDefinitionError(`createTestDataSource's url must be a URL with one of the protocols ${db.POSTGRES_PROTOCOLS.join(', ')}.`);
        }

        return createPostgresDataSource(db, options, options.url);
    }

    const { options: connection } = db.buildDatabaseOptions({
        production: false,
        mode: 'start',
        entities: options.entities,
        migrations: [],
        migrationsTableName: TEST_MIGRATIONS_TABLE,
        connectTimeoutMs: TEST_CONNECT_TIMEOUT_MS,
    });
    const dataSource = await db.connectDatabase(connection);

    try {
        await db.synchronizeDatabase(dataSource);
    } catch (error) {
        await db.closeDatabase(dataSource).catch(() => {});

        throw error;
    }

    return dataSource;
}
