/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSourceOptions, EntitySchema } from 'typeorm';
import type { QueueOptions } from '../entity/types.ts';

/** Where an app's database lives: PostgreSQL on a URL, else SQLite in memory. */
export type DatabaseKind = 'postgres' | 'sqlite';

/** An entity of an app's database: a decorated class, or an `EntitySchema`. */
export type DatabaseEntity = (abstract new (...args: never[]) => unknown) | EntitySchema<any>;

/** A migration class of an app's database. */
export type DatabaseMigration = new (...args: never[]) => unknown;

/** The lifecycle the options are for: `migrate` needs a URL. */
export type DatabaseMode = 'start' | 'job' | 'migrate';

export type DatabaseOptionsInput = {
    /** A `postgres:` or `postgresql:` URL; absent: SQLite in memory. */
    url?: string;
    /** `NODE_ENV` is `production`: SQLite in memory (no URL) is refused. */
    production: boolean;
    mode: DatabaseMode;
    entities: DatabaseEntity[];
    /** Run on PostgreSQL only; SQLite takes its schema from the entities. */
    migrations: DatabaseMigration[];
    /** A plain lower-case identifier (`DATABASE_MIGRATIONS_TABLE_PATTERN`), never `migrations`. */
    migrationsTableName: string;
    /** How long PostgreSQL may take to accept the first connection. */
    connectTimeoutMs: number;
    /**
     * PostgreSQL only: whether TypeORM installs the extensions the
     * entities' column types need; default TypeORM's (it does).
     */
    installExtensions?: boolean;
};

export type DatabaseOptions = {
    kind: DatabaseKind;
    options: DataSourceOptions;
};

/**
 * How a guarded better-sqlite3 data source bounds a wait for its one
 * connection: `waitTimeoutMs` (default 30 seconds) on `clock` (default:
 * the system clock).
 */
export type QueueDataSourceOptions = QueueOptions;

export type MigrateDatabaseOptions = {
    /** The advisory lock the migrations run under, never chamvi's own (`chamvi:migrations`). */
    lockName: string;
};

/** A column whose type TypeORM derived as `Object`: the entity's class name and the property. */
export type UntypedColumn = {
    entity: string;
    property: string;
};
