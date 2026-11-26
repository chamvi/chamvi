/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/errors';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { MemoryRegistry } from '@chamvi/store-memory';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import type { DataSource } from 'typeorm';
import { APP_ERROR_CODE, AppToken, ModuleName } from '../../module/constants.ts';
import { throwIfStopped } from '../../module/helpers/index.ts';
import type { ILogger } from '../../logger/types.ts';
import type { AppContext } from '../../module/types.ts';
import {
    MEMORY_CONVERSATION_WARNING,
    MEMORY_STORE_WARNING,
    STORE_CONNECT_TIMEOUT_MS,
    STORE_NOT_MIGRATED_HINT,
} from './constants.ts';
import { destroyQuietly, maskPassword } from './helpers.ts';
import { registerDatabaseRepositories, registerMemoryRepositories } from './register.ts';
import type { StoreModuleOptions } from './types.ts';

/**
 * Registers the repositories: on memory (one registry), or on PostgreSQL
 * through one data source (a given one, or one built from the URL).
 * `@chamvi/app` builds every service from the registered repository tokens
 * in the same setup step; a module of the same name that registers the
 * repository tokens replaces this one (a third-party store).
 */
export class StoreModule implements IModule {
    readonly name: string = ModuleName.STORE;

    readonly dependencies = [ModuleName.CONFIG];

    protected options: StoreModuleOptions;

    /** A data source this module initialized, destroyed in teardown. */
    protected created: DataSource | undefined;

    /** The connect timeout of a data source built from a URL. */
    protected connectTimeoutMs: number = STORE_CONNECT_TIMEOUT_MS;

    /** The rows, locks and references of every memory repository of this module (memory stores only). */
    protected registry: MemoryRegistry | undefined;

    constructor(options: StoreModuleOptions = {}) {
        this.options = options;
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const config = container.resolve(AppToken.CONFIG);
        const logger = container.resolve(AppToken.LOGGER);

        const url = this.options.url ?? config.store.url;
        const migrate = context.mode === 'migrate' || config.store.migrate;

        if (this.options.dataSource) {
            if (!this.options.dataSource.isInitialized) {
                throw new InvalidAgentDefinitionError('storeModule({ dataSource }) needs an initialized data source.');
            }

            container.register(AppToken.DATA_SOURCE, { useValue: this.options.dataSource });
            await this.prepare(context, this.options.dataSource, migrate);
            await registerDatabaseRepositories(container, this.options.dataSource);

            return;
        }

        if (typeof url === 'string') {
            const dataSource = await this.connect(container, logger, context, url, migrate);

            await registerDatabaseRepositories(container, dataSource);

            return;
        }

        this.registry ??= new MemoryRegistry();
        registerMemoryRepositories(container, this.registry);

        if (!config.dev) {
            logger.warn(MEMORY_STORE_WARNING);
        }

        if (context.conversations) {
            logger.warn(MEMORY_CONVERSATION_WARNING);
        }
    }

    async teardown(): Promise<void> {
        const dataSource = this.created;

        this.created = undefined;

        if (dataSource?.isInitialized) {
            await dataSource.destroy();
        }
    }

    protected async connect(
        container: IContainer,
        logger: ILogger,
        context: AppContext,
        url: string,
        migrate: boolean,
    ): Promise<DataSource> {
        // lazy: an in-memory app never loads TypeORM
        const { DataSource: DataSourceClass } = await import('typeorm');
        const { STORE_ENTITIES, STORE_MIGRATIONS } = await import('@chamvi/store-db');

        const dataSource = new DataSourceClass({
            type: 'postgres',
            url,
            entities: STORE_ENTITIES,
            migrations: STORE_MIGRATIONS,
            connectTimeoutMS: this.connectTimeoutMs,
        });

        throwIfStopped(context);

        try {
            await dataSource.initialize();
        } catch (error) {
            await destroyQuietly(dataSource, logger, url);

            throw maskPassword(error, url);
        }

        container.register(AppToken.DATA_SOURCE, { useValue: dataSource });

        // orkos never tears down a module whose setup threw, so close what was opened here
        try {
            await this.prepare(context, dataSource, migrate);

            this.created = dataSource;

            return dataSource;
        } catch (error) {
            await destroyQuietly(dataSource, logger, url);

            throw maskPassword(error, url);
        }
    }

    /**
     * Refuses a legacy schema, then migrates; with migrations off (or in a
     * check) refuses a store with pending migrations, writing nothing. A
     * check with migrations on writes nothing and passes: the start would
     * migrate.
     */
    protected async prepare(context: AppContext, dataSource: DataSource, migrate: boolean): Promise<void> {
        const {
            assertStoreNotLegacy,
            migrateStore,
            pendingMigrations,
        } = await import('@chamvi/store-db');

        // Temporary: remove in the chamvi version after the uuid baseline.
        if (context.check || !migrate) {
            await assertStoreNotLegacy(dataSource);
        }

        if (!migrate) {
            const pending = await pendingMigrations(dataSource);

            if (pending.length > 0) {
                throw new ChamviError({
                    code: APP_ERROR_CODE.STORE_NOT_MIGRATED,
                    message: `The store has ${pending.length} pending migration(s); ${STORE_NOT_MIGRATED_HINT}`,
                });
            }
        } else if (!context.check) {
            throwIfStopped(context);
            await migrateStore(dataSource);
        }

        throwIfStopped(context);
    }
}

export function storeModule(options?: StoreModuleOptions): IModule {
    return new StoreModule(options);
}
