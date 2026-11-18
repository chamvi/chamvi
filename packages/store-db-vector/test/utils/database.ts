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
        await dataSource.runMigrations({ transaction: 'each' });
    }

    return dataSource;
}
