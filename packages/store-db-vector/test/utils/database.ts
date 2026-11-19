/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { DataSourceOptions } from 'typeorm';
import { DataSource } from 'typeorm';
import { createDatabase } from 'typeorm-extension';
import { describe, inject } from 'vitest';
import { VectorTableName } from '../../src/entities/constants.ts';
import {
    KNOWLEDGE_VECTOR_ENTITIES,
    KNOWLEDGE_VECTOR_MIGRATIONS,
    KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
} from '../../src/schema/index.ts';

export type PostgresConnection = {
    host: string;
    port: number;
    username: string;
    password: string;
};

declare module 'vitest' {
    // Vitest's augmentation name is fixed by its public API.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface ProvidedContext {
        postgres: PostgresConnection;
    }
}

export const postgres: PostgresConnection | undefined = inject('postgres');

export function describePostgres(name: string, fn: () => void): void {
    describe.skipIf(!postgres)(name, fn);
}

/** A new, empty database on the test server; resolves with its name. */
export async function createTestDatabase(): Promise<string> {
    if (!postgres) {
        throw new Error('Postgres is not available.');
    }

    const database = `chamvi_test_${randomUUID().replaceAll('-', '')}`;

    await createDatabase({
        options: {
            type: 'postgres',
            ...postgres,
            database,
        },
        initialDatabase: 'postgres',
        ifNotExist: false,
        synchronize: false,
    });

    return database;
}

export type TestDataSourceOptions = {
    /** The database to connect to (default a new one). */
    database?: string;
    /** Run the migrations after initializing (default true). */
    migrate?: boolean;
    /** Replaces the knowledge vector entities, migrations and migrations table. */
    schema?: Pick<DataSourceOptions, 'entities' | 'migrations' | 'migrationsTableName'>;
};

/**
 * A data source on the knowledge vector schema, as `vectorStoreModule()`
 * builds it: its own migrations table, no extension installed on connect
 * (the migration creates it).
 */
export async function createTestDataSource(opts: TestDataSourceOptions = {}): Promise<DataSource> {
    if (!postgres) {
        throw new Error('Postgres is not available.');
    }

    const dataSource = new DataSource({
        type: 'postgres',
        ...postgres,
        database: opts.database ?? await createTestDatabase(),
        installExtensions: false,
        ...(opts.schema ?? {
            entities: KNOWLEDGE_VECTOR_ENTITIES,
            migrations: KNOWLEDGE_VECTOR_MIGRATIONS,
            migrationsTableName: KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
        }),
        extra: { max: 10 },
    } as DataSourceOptions);

    await dataSource.initialize();

    if (opts.migrate !== false) {
        try {
            await dataSource.runMigrations({ transaction: 'each' });
        } catch (error) {
            // the caller never gets the data source to close
            await dataSource.destroy();

            throw error;
        }
    }

    return dataSource;
}

/** Empties the knowledge vector tables. */
export async function truncateTables(dataSource: DataSource): Promise<void> {
    const tables = Object.values(VectorTableName).map((name) => `"${name}"`).join(', ');

    await dataSource.query(`TRUNCATE ${tables}`);
}

/** How often `untilLockWait` asks before it gives up. */
const LOCK_WAIT_POLLS = 10_000;

/**
 * Resolves once `count` statements of this data source's database wait
 * for a lock another transaction holds: the deterministic order a spec
 * needs between a statement it issued and a commit it then lets happen.
 */
export async function untilLockWait(dataSource: DataSource, count = 1): Promise<void> {
    for (let poll = 0; poll < LOCK_WAIT_POLLS; poll++) {
        const [{ waiting }] = await dataSource.query(
            `SELECT count(*)::int AS waiting FROM pg_stat_activity
             WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
        );

        if (waiting >= count) {
            return;
        }
    }

    throw new Error('No statement started waiting for a lock.');
}
