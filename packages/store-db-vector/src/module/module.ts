/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken, DatabaseModule } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createMemoryKnowledgeRepository } from '@chamvi/knowledge';
import { KNOWLEDGE_REPOSITORY_MODULE_NAME, KnowledgeToken } from '@chamvi/knowledge/module';
import * as storeDb from '@chamvi/store-db';
import { DatabaseKnowledgeRepository } from '../repositories/index.ts';
import {
    KNOWLEDGE_VECTOR_DATABASE,
    KNOWLEDGE_VECTOR_ENTITIES,
    KNOWLEDGE_VECTOR_MIGRATIONS,
    KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
} from '../schema/index.ts';
import { VECTOR_STORE_MIGRATIONS_DIRECTORY } from './constants.ts';
import type { VectorStoreModuleOptions } from './types.ts';

/** Refuses a `url` that is no PostgreSQL URL; the message never carries the value. */
function readUrl(options: VectorStoreModuleOptions | undefined): string | undefined {
    const url = options?.url;

    if (url === undefined) {
        return undefined;
    }

    if (typeof url !== 'string' || !URL.canParse(url) || !storeDb.POSTGRES_PROTOCOLS.includes(new URL(url).protocol)) {
        throw new InvalidAgentDefinitionError('vectorStoreModule() url must be a postgres: or postgresql: URL.');
    }

    return url;
}

/**
 * The knowledge vector store as an app database: the `databaseModule()`
 * named `vector` (descriptor, data source token and the lock
 * `chamvi:db:vector`, so `chamvi migration --database vector` finds it),
 * on PostgreSQL only, its migrations in `chamvi_vector_migrations`, no
 * extension installed on connect (its migration creates `vector`). It
 * connects, migrates and checks as every app database does, then
 * registers a `DatabaseKnowledgeRepository` under
 * `KnowledgeToken.REPOSITORY` (in a check that passes with migrations
 * pending, an empty in-memory one: the stored-collection rules are not
 * checked while vector migrations are pending). The module is named
 * `chamvi:knowledge-repository`, which `knowledgeModule()` depends on
 * optionally: it then indexes into these tables.
 */
export class VectorStoreModule extends DatabaseModule {
    override readonly name: string = KNOWLEDGE_REPOSITORY_MODULE_NAME;

    /** `options.url`, which wins over `DATABASE_URL`. */
    protected url: string | undefined;

    constructor(options?: VectorStoreModuleOptions) {
        const url = readUrl(options);

        super({
            name: KNOWLEDGE_VECTOR_DATABASE,
            entities: KNOWLEDGE_VECTOR_ENTITIES,
            migrations: KNOWLEDGE_VECTOR_MIGRATIONS,
            migrationsTableName: KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
            migrationsDirectory: VECTOR_STORE_MIGRATIONS_DIRECTORY,
            postgres: true,
            installExtensions: false,
        });

        this.url = url;
    }

    override async setup(container: IContainer): Promise<void> {
        if (this.url !== undefined) {
            this.env = { ...container.resolve(AppToken.CONTEXT).env, DATABASE_URL: this.url };
        }

        await super.setup(container);

        // a check that passed with vector migrations pending (the start would apply them) reads no vector table:
        // the knowledge's check then reads an empty repository, so the stored-collection rules are not checked
        const { check } = container.resolve(AppToken.CONTEXT);
        let pending: boolean;

        try {
            pending = check === true && (await storeDb.pendingDatabaseMigrations(this.dataSource!)).length > 0;
        } catch (error) {
            // orkos never tears down a module whose setup threw: close what the base opened
            await this.closeQuietly(container.resolve(AppToken.LOGGER));

            throw this.toConfigurationError(storeDb, error);
        }

        const repository = pending ? createMemoryKnowledgeRepository() : new DatabaseKnowledgeRepository(this.dataSource!);

        container.register(KnowledgeToken.REPOSITORY, { useValue: repository });
    }
}

/**
 * The pgvector store of `knowledgeModule()`: PostgreSQL from `DATABASE_URL`
 * or `{ url }` (neither fails the setup with an
 * `InvalidAgentDefinitionError`). See `VectorStoreModule`.
 */
export function vectorStoreModule(options?: VectorStoreModuleOptions): IModule {
    return new VectorStoreModule(options);
}
