/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, DataSourceOptions } from 'typeorm';

export type TestDataSourceOptions = {
    /** The entity classes (or `EntitySchema`s) whose tables the data source holds. */
    entities: NonNullable<DataSourceOptions['entities']>;
    /**
     * A PostgreSQL server (`postgres:` or `postgresql:` URL whose user may
     * create databases): the data source is a new database of its own
     * there, dropped again when the data source is destroyed. Default:
     * SQLite in memory (`better-sqlite3`).
     */
    url?: string;
};

/**
 * What `createTestDataSource` uses of `@chamvi/store-db`, typed
 * structurally: the kit names it in no dependency field (store-db tests
 * with the kit, a field would close a cycle) and loads it by a variable
 * specifier.
 */
export type TestDatabaseStore = {
    POSTGRES_PROTOCOLS: readonly string[];
    buildDatabaseOptions(input: {
        url?: string;
        production: boolean;
        mode: 'start';
        entities: NonNullable<DataSourceOptions['entities']>;
        migrations: never[];
        migrationsTableName: string;
        connectTimeoutMs: number;
    }): { options: DataSourceOptions };
    connectDatabase(options: DataSourceOptions): Promise<DataSource>;
    synchronizeDatabase(dataSource: DataSource): Promise<void>;
    closeDatabase(dataSource: DataSource): Promise<void>;
};
