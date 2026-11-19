/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The SQLite driver an app's database uses without a URL, and the npm package it is installed as. */
export const SQLITE_DRIVER = 'better-sqlite3';

/** The database of SQLite in memory: it lives as long as the process (or the data source). */
export const SQLITE_MEMORY = ':memory:';

/** The protocols of a PostgreSQL URL (chamvi's config reads `DATABASE_URL` with the same). */
export const POSTGRES_PROTOCOLS: readonly string[] = ['postgres:', 'postgresql:'];

/**
 * An app database's migrations table: a plain lower-case identifier, no
 * schema, no quotes, at most 63 characters (PostgreSQL's limit), so its
 * spelling is the table's name and two databases compare by it.
 */
export const DATABASE_MIGRATIONS_TABLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/** TypeORM's default migrations table, which chamvi's own store records its migrations in. */
export const CHAMVI_MIGRATIONS_TABLE = 'migrations';

/**
 * What an app database's migrations table cannot start with: the prefix
 * of the tables of chamvi's own store, and TypeORM's metadata table.
 */
export const RESERVED_TABLE_PREFIXES: readonly string[] = ['chamvi_', 'typeorm_metadata'];

/**
 * The migrations tables of chamvi's own app databases (the knowledge
 * vector store): the only `chamvi_` names an app database may record its
 * migrations in.
 */
export const CHAMVI_OWNED_MIGRATIONS_TABLES: readonly string[] = ['chamvi_vector_migrations'];

/**
 * TypeORM's errors of an entity or metadata mistake (their messages name
 * entities, properties and columns), reported as a configuration error;
 * `TypeORMError` itself is what its metadata builder throws for a
 * relation to an entity the data source does not list.
 */
export const CONFIGURATION_ERRORS: readonly string[] = [
    'TypeORMError',
    'MissingPrimaryColumnError',
    'DataTypeNotSupportedError',
    'ColumnTypeUndefinedError',
    'EntityMetadataNotFoundError',
    'CircularRelationsError',
    'InitializedRelationError',
    'MetadataAlreadyExistsError',
    'MetadataWithSuchNameAlreadyExistsError',
    'MissingJoinColumnError',
    'MissingJoinTableError',
    'UsingJoinColumnIsNotAllowedError',
    'UsingJoinColumnOnlyOnOneSideAllowedError',
    'UsingJoinTableIsNotAllowedError',
    'UsingJoinTableOnlyOnOneSideAllowedError',
    'MissingDeleteDateColumnError',
];

/** How much of TypeORM's message a configuration error keeps. */
export const CONFIGURATION_MESSAGE_MAX_LENGTH = 500;

/** The npm package of each driver an app database loads. */
export const DRIVER_PACKAGES: Readonly<Record<string, string>> = {
    postgres: 'pg',
    'better-sqlite3': 'better-sqlite3',
};

/** TypeORM's name of the error a missing driver package raises. */
export const DRIVER_MISSING_ERROR = 'DriverPackageNotInstalledError';
