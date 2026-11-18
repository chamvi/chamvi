/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ListSchema } from '@chamvi/http';
import type { DatabaseEntity, DatabaseMigration } from '@chamvi/store-db';
import type { TypedToken } from 'eldin';
import type { DataSource } from 'typeorm';
import type { Env } from '../../env/types.ts';

export type DatabaseModuleOptions = {
    /**
     * Where `DATABASE_URL` and `NODE_ENV` are read; default the app's env
     * (`start({ env })`, else `process.env`). `DATABASE_URL` is read as
     * chamvi's config reads it (a `postgres:` or `postgresql:` URL,
     * required in `migrate` mode). Without it the database is SQLite in
     * memory through `better-sqlite3` (install it): it lives as long as
     * the process, so a restart loses its rows, as chamvi's memory store
     * does; refused when `NODE_ENV` is `production`.
     */
    env?: Env;
    /** The decorated entity classes (or `EntitySchema`s) of the app's own tables. */
    entities: DatabaseEntity[];
    /**
     * The migration classes, run on PostgreSQL only (SQLite takes its
     * schema from the entities). Classes, not a folder: a built entry
     * cannot load `.ts` files.
     */
    migrations: DatabaseMigration[];
    /**
     * The list schemas (`defineSchema()`) of the app's list endpoints over
     * these entities. `setup` checks each against its entity's metadata,
     * after connecting and before migrating or serving (also in a check):
     * a schema naming no entity, an entity the database does not hold, a
     * field, filter, sort, default sort or key field that is no column of
     * it, or a relation that is no relation of it fails the start with
     * an `InvalidAgentDefinitionError` naming the database, the schema and
     * the name.
     */
    schemas?: ListSchema[];
    /** Where `chamvi migration generate` writes; nothing else reads it. Relative paths resolve against the working directory. */
    migrationsDirectory: URL | string;
    /**
     * The table the migrations are recorded in: a plain lower-case
     * identifier (no schema, no quotes), never `migrations`, which is
     * chamvi's own, and no name starting with `chamvi_` (but for
     * `chamvi_vector_migrations`, chamvi's knowledge vector store) or
     * `typeorm_metadata`.
     */
    migrationsTableName: string;
    /**
     * The data source closes in a `drained` lifecycle hook this module
     * registers in its `onReady`: a module that uses the data source in
     * its own `drained` hook registers that hook in its `setup` (an
     * `onReady` registration after this module's runs after the close).
     *
     * Names the module (`chamvi:db:<name>`), its data source token
     * (`dataSourceToken(name)`) and the advisory lock its migrations run
     * under (`chamvi:db:<name>`); default `default`. A lower-case slug.
     */
    name?: string;
    /**
     * Require PostgreSQL: without `DATABASE_URL` the setup fails with an
     * `InvalidAgentDefinitionError` instead of running on SQLite in
     * memory; default `false`.
     */
    postgres?: boolean;
    /**
     * PostgreSQL only: whether TypeORM installs the extensions the
     * entities' column types need (`CREATE EXTENSION`); default TypeORM's
     * (it does). `false` for a database whose extensions an operator
     * installs.
     */
    installExtensions?: boolean;
    /**
     * SQLite only (no `DATABASE_URL`): how long, in milliseconds, work may
     * wait for the one connection behind a single holder (a transaction
     * left open, an operation that does not return) before it is refused
     * with `DatabaseBusyError`; default 30 seconds. A positive integer.
     * PostgreSQL ignores it: its pool has a connection per caller.
     */
    waitTimeoutMs?: number;
};

/** What a database module declares, readable without connecting (`readDatabaseDescriptors`). */
export type DatabaseDescriptor = Readonly<{
    name: string;
    entities: readonly DatabaseEntity[];
    migrations: readonly DatabaseMigration[];
    /** An absolute path. */
    migrationsDirectory: string;
    migrationsTableName: string;
    /** The advisory lock its migrations run under: `chamvi:db:<name>`, also the module's name unless a subclass overrides it. */
    lockName: string;
}>;

export type DatabaseTokens = {
    /** The data source of the database named `default`: `dataSourceToken()`. */
    DATA_SOURCE: TypedToken<DataSource>;
    /** A collection: the descriptor of every database module set up. */
    DESCRIPTORS: TypedToken<DatabaseDescriptor>;
};
