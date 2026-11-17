/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The key a database module carries its descriptor under; `Symbol.for`,
 * so a reader of another installed copy of the package still finds it.
 */
export const DATABASE_DESCRIPTOR: unique symbol = Symbol.for('chamvi.database.descriptor') as never;

/** The name of a database module without one: its data source is `DatabaseToken.DATA_SOURCE`. */
export const DEFAULT_DATABASE_NAME = 'default';

/** The prefix of a database module's name and of the advisory lock its migrations run under: `chamvi:db:<name>`. */
export const DATABASE_PREFIX = 'chamvi:db:';

/**
 * The names no database module may take: `store` is what `chamvi
 * migration --database` calls chamvi's own store (`@chamvi/store-db`'s
 * `STORE_DATABASE`; a spec pins both).
 */
export const RESERVED_DATABASE_NAMES: readonly string[] = ['store'];

/** What a database's name must look like (the agent-name rule). */
export const DATABASE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A migrations table: a plain lower-case identifier, no schema (TypeORM
 * splits `public.migrations` into a schema and chamvi's own table), no
 * quotes, at most 63 characters; the same rule as `@chamvi/store-db`'s
 * `DATABASE_MIGRATIONS_TABLE_PATTERN` (a spec pins both), kept here so
 * `databaseModule()` refuses at `createApp` without loading store-db.
 */
export const MIGRATIONS_TABLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/** TypeORM's default migrations table, which chamvi's own store records its migrations in. */
export const RESERVED_MIGRATIONS_TABLE = 'migrations';

/**
 * What a migrations table cannot start with (the prefix of the tables of
 * chamvi's own store, TypeORM's metadata table): the same list as
 * `@chamvi/store-db`'s `RESERVED_TABLE_PREFIXES` (a spec pins both).
 */
export const RESERVED_MIGRATIONS_TABLE_PREFIXES: readonly string[] = ['chamvi_', 'typeorm_metadata'];
