/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, InvalidAgentDefinitionError } from '@chamvi/core';
import type * as storeDb from '@chamvi/store-db';
import type { DatabaseKind } from '@chamvi/store-db';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import type { ListSchema } from '@chamvi/http';
import type { DataSource } from 'typeorm';
import type { AppConfig } from '../../config/types.ts';
import type { Env } from '../../env/types.ts';
import type { ILogger } from '../../logger/types.ts';
import { APP_ERROR_CODE, AppToken, ModuleName } from '../../module/constants.ts';
import { throwIfStopped } from '../../module/helpers.ts';
import type { AppContext } from '../../module/types.ts';
import { STORE_CONNECT_TIMEOUT_MS, STORE_NOT_MIGRATED_HINT } from '../repository/constants.ts';
import { DATABASE_DESCRIPTOR } from './constants.ts';
import {
    buildDescriptor,
    readDatabaseEnv,
    readSchemas,
    readWaitTimeout,
} from './helpers.ts';
import { DatabaseToken, dataSourceToken } from './token.ts';
import type { DatabaseDescriptor, DatabaseModuleOptions } from './types.ts';

type StoreDb = typeof storeDb;

/**
 * A database for an app's own tables (never chamvi's store): PostgreSQL
 * on `DATABASE_URL`, else SQLite in memory. `setup` connects (loading
 * TypeORM's driver, `@chamvi/store-db` and typeorm-extension only then),
 * migrates PostgreSQL under the lock `chamvi:db:<name>` into the
 * database's own migrations table (start, job and `migrate` mode, when
 * `CHAMVI_MIGRATE` is on; with it off pending migrations fail the start
 * as `store_not_migrated`), synchronizes SQLite, and registers the data
 * source under `dataSourceToken(name)`. A check writes nothing to
 * PostgreSQL and fails on pending migrations exactly when chamvi's store
 * module does. The data source closes after the engine drained (its
 * `drained` hook, registered once every module set up, so after theirs),
 * or in `teardown` when no engine drains. Every failure of the database
 * is a `DatabaseUnavailableError` with the operation and the driver's
 * code only; a configuration error an `InvalidAgentDefinitionError`.
 */
export class DatabaseModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE];

    readonly [DATABASE_DESCRIPTOR]: DatabaseDescriptor;

    /** The connect timeout of PostgreSQL, the one chamvi's store uses. */
    protected connectTimeoutMs: number = STORE_CONNECT_TIMEOUT_MS;

    protected env: Env | undefined;

    /** SQLite's wait limit for the one connection, when the app set one. */
    protected waitTimeoutMs: number | undefined;

    /** The list schemas checked against the entities in `setup`. */
    protected schemas: ListSchema[];

    /** The data source this module opened, until it is closed. */
    protected dataSource: DataSource | undefined;

    protected closeDatabase: StoreDb['closeDatabase'] | undefined;

    /** The `drained` hook that closes the data source is registered. */
    protected hooked = false;

    constructor(options: DatabaseModuleOptions) {
        const descriptor = buildDescriptor(options);

        this[DATABASE_DESCRIPTOR] = descriptor;
        this.name = descriptor.lockName;
        this.env = options.env;
        this.waitTimeoutMs = readWaitTimeout(options);
        this.schemas = readSchemas(options, descriptor.name);
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const config = container.resolve(AppToken.CONFIG);
        const logger = container.resolve(AppToken.LOGGER);
        const descriptor = this[DATABASE_DESCRIPTOR];
        const { url, production } = readDatabaseEnv(this.env ?? context.env, context.mode);

        this.assertOwnTable(container, descriptor);
        container.registerMany(DatabaseToken.DESCRIPTORS, { useValue: descriptor });

        // lazy: an app without a database module never loads TypeORM's drivers or typeorm-extension
        const db = await import('@chamvi/store-db');

        this.assertTypedColumns(db, descriptor);

        const { kind, options } = this.configured(db, () => db.buildDatabaseOptions({
            ...(url !== undefined && { url }),
            entities: [...descriptor.entities],
            migrations: [...descriptor.migrations],
            migrationsTableName: descriptor.migrationsTableName,
            connectTimeoutMs: this.connectTimeoutMs,
            production,
            mode: context.mode,
        }));

        throwIfStopped(context);

        this.dataSource = await this.connect(db, options, descriptor);
        this.closeDatabase = db.closeDatabase;

        // orkos never tears down a module whose setup threw: close what was opened here
        try {
            throwIfStopped(context);
            // the metadata exists once connected: a schema mistake fails before anything is migrated or served
            this.configured(db, () => db.validateEntitySchemas(this.dataSource!, this.schemas));
            await this.prepare(db, context, config, kind, this.dataSource);
        } catch (error) {
            await this.closeQuietly(logger);

            throw error;
        }

        container.register(dataSourceToken(descriptor.name), { useValue: this.dataSource });

        if (kind === 'sqlite' && !config.dev) {
            logger.warn(`DATABASE_URL unset: the database "${descriptor.name}" runs on SQLite in memory; restarts lose its rows.`);
        }
    }

    async onReady(container: IContainer): Promise<void> {
        // registered after every module's setup, so the drained hooks of the modules using the data source run first
        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                drained: () => this.close(),
            },
        });
        this.hooked = true;
    }

    async teardown(container: IContainer): Promise<void> {
        // an engine drains in its own teardown, after this one: its drained hook closes the data source then
        if (this.hooked && container.has(AppToken.ENGINE)) {
            return;
        }

        await this.close();
    }

    /** Runs `fn`; a `DatabaseOptionsError` of it becomes the app's configuration error, naming the database. */
    protected configured<R>(db: StoreDb, fn: () => R): R {
        try {
            return fn();
        } catch (error) {
            throw this.toConfigurationError(db, error);
        }
    }

    protected toConfigurationError(db: StoreDb, error: unknown): unknown {
        if (error instanceof db.DatabaseOptionsError) {
            return new InvalidAgentDefinitionError(`The database "${this[DATABASE_DESCRIPTOR].name}": ${error.message}`);
        }

        return error;
    }

    protected async connect(db: StoreDb, options: Parameters<StoreDb['connectDatabase']>[0], descriptor: DatabaseDescriptor): Promise<DataSource> {
        try {
            return await db.connectDatabase(options, this.waitTimeoutMs === undefined ? {} : { waitTimeoutMs: this.waitTimeoutMs });
        } catch (error) {
            if (error instanceof db.DatabaseDriverMissingError) {
                const on = error.packageName === 'better-sqlite3' ? 'SQLite without DATABASE_URL' : 'PostgreSQL';

                throw new InvalidAgentDefinitionError(`The database "${descriptor.name}" runs on ${on}: ${error.message}`);
            }

            throw this.toConfigurationError(db, error);
        }
    }

    /** Synchronizes SQLite; migrates PostgreSQL, or in a check (and with migrate off) only counts the pending migrations. */
    protected async prepare(db: StoreDb, context: AppContext, config: AppConfig, kind: DatabaseKind, dataSource: DataSource): Promise<void> {
        if (kind === 'sqlite') {
            await db.synchronizeDatabase(dataSource);

            return;
        }

        const migrate = context.mode === 'migrate' || config.store.migrate;

        if (migrate && !context.check) {
            try {
                await db.migrateDatabase(dataSource, { lockName: this[DATABASE_DESCRIPTOR].lockName });
            } catch (error) {
                throw this.toConfigurationError(db, error);
            }

            return;
        }

        // a check with migrate on writes nothing and passes: the start would migrate
        if (context.check && migrate) {
            return;
        }

        let pending: string[];

        try {
            pending = await db.pendingDatabaseMigrations(dataSource);
        } catch (error) {
            throw this.toConfigurationError(db, error);
        }

        if (pending.length > 0) {
            throw new ChamviError({
                code: APP_ERROR_CODE.STORE_NOT_MIGRATED,
                message: `The database "${this[DATABASE_DESCRIPTOR].name}" has ${pending.length} pending migration(s); ${STORE_NOT_MIGRATED_HINT}`,
            });
        }
    }

    /** Two databases recording their migrations in one table would run each other's. */
    protected assertOwnTable(container: IContainer, descriptor: DatabaseDescriptor): void {
        const others = container.has(DatabaseToken.DESCRIPTORS) ? container.resolveAll(DatabaseToken.DESCRIPTORS) : [];
        const other = others.find((candidate) => candidate.migrationsTableName === descriptor.migrationsTableName);

        if (other) {
            throw new InvalidAgentDefinitionError(
                `The databases "${other.name}" and "${descriptor.name}" both record their migrations in "${descriptor.migrationsTableName}".`,
            );
        }
    }

    /**
     * Refuses a column TypeORM typed as `Object` (a union such as
     * `Date | null`): it would become a wrong column type silently. A column
     * without any decorator metadata never gets here: TypeORM throws when
     * the entity is imported.
     */
    protected assertTypedColumns(db: StoreDb, descriptor: DatabaseDescriptor): void {
        const untyped = db.findUntypedColumns([...descriptor.entities]);

        if (untyped.length === 0) {
            return;
        }

        const columns = untyped.map((column) => `${column.entity}#${column.property}`).join(', ');

        throw new InvalidAgentDefinitionError(
            `The database "${descriptor.name}" has columns whose type could not be derived: ${columns}. ` +
            'Give each a column type, or declare the property with one type (Date, not Date | null), ' +
            'with emitDecoratorMetadata on and reflect-metadata imported first.',
        );
    }

    protected async close(): Promise<void> {
        const { dataSource, closeDatabase } = this;

        this.dataSource = undefined;

        if (dataSource && closeDatabase) {
            await closeDatabase(dataSource);
        }
    }

    /** Closes after a failed setup; a failure is logged at debug, the setup error is the one that matters. */
    protected async closeQuietly(logger: ILogger): Promise<void> {
        try {
            await this.close();
        } catch (error) {
            logger.debug(`Closing the database "${this[DATABASE_DESCRIPTOR].name}" after a failed setup failed.`, { error });
        }
    }
}

/**
 * A database for an app's own tables: PostgreSQL on `DATABASE_URL` (the
 * same database as chamvi's store, its own tables and migrations table),
 * else SQLite in memory for development. See `DatabaseModule`.
 */
export function databaseModule(options: DatabaseModuleOptions): IModule {
    return new DatabaseModule(options);
}
