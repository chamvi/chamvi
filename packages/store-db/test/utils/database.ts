/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createDatabase } from 'typeorm-extension';
import { describe, inject } from 'vitest';
import {
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    migrateStore,
} from '../../src/schema/index.ts';
import { TableName } from '../../src/entities/constants.ts';

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

export type TestDataSourceOptions = {
    /** Run migrateStore after initializing (default true). */
    migrate?: boolean;
    /** Pool size (default 25). */
    max?: number;
    /** A schema to create and use as the connections' search_path instead of public. */
    schema?: string;
    /** The driver's schema option, independent of the search_path. */
    driverSchema?: string;
    /** TypeORM's migrationsTableName option. */
    migrationsTableName?: string;
    /** The server encoding of the database (default the server's, UTF8); created from template0 with the C locale. */
    encoding?: string;
};

export async function createTestDataSource(opts: TestDataSourceOptions = {}): Promise<DataSource> {
    if (!postgres) {
        throw new Error('Postgres is not available.');
    }

    const database = `chamvi_test_${randomUUID().replaceAll('-', '')}`;

    if (opts.encoding) {
        const admin = new DataSource({
            type: 'postgres',
            ...postgres,
            database: 'postgres',
        });

        await admin.initialize();

        try {
            await admin.query(`CREATE DATABASE "${database}" ENCODING '${opts.encoding}' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
        } finally {
            await admin.destroy();
        }
    } else {
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
    }

    const dataSource = new DataSource({
        type: 'postgres',
        ...postgres,
        database,
        entities: STORE_ENTITIES,
        migrations: STORE_MIGRATIONS,
        ...(opts.driverSchema ? { schema: opts.driverSchema } : {}),
        ...(opts.migrationsTableName ? { migrationsTableName: opts.migrationsTableName } : {}),
        extra: {
            max: opts.max ?? 25,
            options: `-c TimeZone=America/New_York${opts.schema ? ` -c search_path=${opts.schema}` : ''}`,
        },
    });

    await dataSource.initialize();

    if (opts.schema) {
        await dataSource.query(`CREATE SCHEMA "${opts.schema}"`);
    }

    if (opts.migrate !== false) {
        await migrateStore(dataSource);
    }

    return dataSource;
}

export async function truncateRepository(dataSource: DataSource): Promise<void> {
    const tables = Object.values(TableName).map((name) => `"${name}"`).join(', ');

    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY`);
}

/** How often `untilLockWait` asks before it gives up. */
const LOCK_WAIT_POLLS = 10_000;

/**
 * Resolves once `count` statements of this data source's database wait
 * for a lock (a row lock another transaction holds): the deterministic
 * order a spec needs between a statement it issued and a commit it then
 * lets happen. Asks `pg_stat_activity` until it sees the waits.
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
