/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DatabaseEntity, DatabaseMigration } from '../database/types.ts';

/** What `chamvi migration <operation>` does. */
export type MigrationOperation = 'generate' | 'run' | 'revert' | 'status' | 'drift';

/**
 * An app's database as the migration commands see it: what `@chamvi/app`'s
 * `readDatabaseDescriptors()` returns (typed structurally here, since
 * `@chamvi/store-db` does not depend on the app).
 */
export type MigrationDescriptor = Readonly<{
    name: string;
    entities: readonly DatabaseEntity[];
    migrations: readonly DatabaseMigration[];
    /** An absolute path: where `generate` writes. */
    migrationsDirectory: string;
    migrationsTableName: string;
    /** The advisory lock the database module migrates under; absent (an older `@chamvi/app`): `chamvi:db:<name>`. */
    lockName?: string;
}>;

export type MigrationOperationInput = {
    operation: MigrationOperation;
    /** The app's databases (none for an app without a database module). */
    descriptors: readonly MigrationDescriptor[];
    /**
     * A descriptor's name, or `store` for chamvi's own store; may be left
     * out when the app has exactly one database.
     */
    database?: string;
    /** `generate` only: the migration's class name, PascalCase. */
    name?: string;
    /** `DATABASE_URL`: the database `run`, `revert`, `status` and `drift` work on. */
    url?: string;
    /** `CHAMVI_MIGRATION_DATABASE_URL`: the throwaway database `generate` builds the schema in. */
    scratchUrl?: string;
    /** One line of the command's output (no URL, no parameter, no row ever reaches it). */
    write(line: string): void;
    /** `generate`'s timestamp (default `Date.now()`). */
    now?: () => number;
    /** How long PostgreSQL may take to accept the first connection (default 10 s). */
    connectTimeoutMs?: number;
};

/** The database an operation works on: an app's, or chamvi's own store. */
export type MigrationTarget = {
    name: string;
    entities: DatabaseEntity[];
    migrations: DatabaseMigration[];
    /** Undefined: the store outside this repository's sources, where `generate` cannot write. */
    migrationsDirectory: string | undefined;
    /** Undefined: TypeORM's default (`migrations`), chamvi's own store. */
    migrationsTableName: string | undefined;
    lockName: string;
    /** chamvi's own store (`migrateStore`, its legacy-schema check). */
    store: boolean;
};

/** `CHAMVI_MIGRATION_DATABASE_URL`, parsed once: every step of `generate` connects with these. */
export type ScratchDatabase = {
    /** The scratch database's name. */
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    /** The `sslmode` of the URL as the driver's `ssl` option; absent: no TLS. */
    ssl?: boolean | { rejectUnauthorized: false };
    /** The URL's `application_name`. */
    applicationName?: string;
};

/** Explicit PostgreSQL connection options (never a URL) of a database on the scratch server. */
export type ScratchConnection = {
    type: 'postgres';
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl?: boolean | { rejectUnauthorized: false };
    applicationName?: string;
};

/** How a PostgreSQL URL names its database, spelling aside. */
export type DatabaseIdentity = {
    /** Normalized hosts; `loopback` for every name of this machine. */
    hosts: Set<string>;
    /** Undefined: the URL gives none (the driver's default). */
    port: number | undefined;
    /** Lower-cased; empty: the URL names none (the driver falls back to the user's name or the environment). */
    names: Set<string>;
};
