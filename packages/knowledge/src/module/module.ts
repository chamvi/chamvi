/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AppToken, ModuleName, envString } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { provideKnowledgeContext } from '../context/module.ts';
import { createKnowledge } from '../knowledge/module.ts';
import type { IKnowledge } from '../knowledge/types.ts';
import { createMemoryKnowledgeRepository } from '../repository/memory.ts';
import { knowledgeRoutes } from '../routes/module.ts';
import { KNOWLEDGE_MODEL_VARIABLE, KNOWLEDGE_MODULE_NAME, MEMORY_KNOWLEDGE_WARNING } from './constants.ts';
import { assertEnvModel, checkModuleOptions } from './helpers.ts';
import type { KnowledgeModuleOptions } from './types.ts';

/**
 * The app's knowledge collections (`.knowledge`, built in `setup`). The
 * options are checked and `CHAMVI_KNOWLEDGE_MODEL` is read (from
 * `options.env ?? process.env`, winning over `embeddingModel`) when the
 * factory is called. In start and job mode and a check, `setup` builds
 * `createKnowledge()` over the repository (default in memory, warned outside
 * dev), the store's locks, the managed collections' model, the app's model
 * resolver (`AppToken.MODELS`, for string models) and clock, its indexing
 * errors going to the app logger (`knowledge error`); a configuration error
 * fails the setup (an unresolvable variable names it, never its value). In
 * start mode outside a check, unless `routes: false`, it contributes
 * `knowledgeRoutes()` to `AppToken.HTTP_ROUTES`. `onReady` refuses a declared name the store holds as a
 * managed collection (read-only, so a check runs it too). The lifecycle hook
 * provides the knowledge on the engine (`injectKnowledgeContext(ctx)`) and, in
 * start mode only, starts the indexing once the app started (`started`) and
 * stops it first in the shutdown (`stopping`); a job or a check never
 * indexes. `teardown` stops it too. Migrate mode does nothing.
 */
export class KnowledgeModule implements IModule {
    readonly name: string = KNOWLEDGE_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE, ModuleName.ENGINE];

    protected options: KnowledgeModuleOptions;

    /** `CHAMVI_KNOWLEDGE_MODEL`, read when the factory is called. */
    protected envModel: string | undefined;

    protected instance: IKnowledge | undefined;

    constructor(options?: KnowledgeModuleOptions) {
        this.options = checkModuleOptions(options);
        this.envModel = envString(this.options.env ?? process.env, KNOWLEDGE_MODEL_VARIABLE);
    }

    /** The knowledge, once `setup` built it; InvalidAgentDefinitionError before. */
    get knowledge(): IKnowledge {
        if (!this.instance) {
            throw new InvalidAgentDefinitionError('knowledgeModule().knowledge is available once the app set the module up.');
        }

        return this.instance;
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        const config = container.resolve(AppToken.CONFIG);
        const logger = container.resolve(AppToken.LOGGER);
        const {
            repository,
            collections,
            owner,
            routes,
        } = this.options;
        // an engine module of the user's may register no resolver: string models then fail here
        const models = container.has(AppToken.MODELS) ? container.resolve(AppToken.MODELS) : undefined;
        const { envModel } = this;

        if (envModel !== undefined) {
            assertEnvModel(envModel, models);
        }

        const embeddingModel = envModel ?? this.options.embeddingModel;

        const knowledge = createKnowledge({
            repository: repository ?? createMemoryKnowledgeRepository(),
            locks: container.resolve(AppToken.STORE).locks,
            ...(collections !== undefined && { collections }),
            ...(embeddingModel !== undefined && { embeddingModel }),
            ...(models !== undefined && { models }),
            clock: container.resolve(AppToken.CLOCK),
            ...(owner !== undefined && { owner }),
            onError: (error, { collection }) => logger.error('knowledge error', error, collection === undefined ? {} : { collection }),
        });

        if (!repository && !config.dev) {
            logger.warn(MEMORY_KNOWLEDGE_WARNING);
        }

        this.instance = knowledge;

        // only a long-lived start indexes: a job or a check must not write the store or spend on embeddings
        const indexes = context.mode === 'start' && !context.check;

        if (indexes && routes !== false) {
            for (const route of knowledgeRoutes(knowledge)) {
                container.registerMany(AppToken.HTTP_ROUTES, { useValue: route });
            }
        }

        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => provideKnowledgeContext(engine, knowledge),
                ...(indexes && {
                    started: () => knowledge.start(),
                    stopping: () => knowledge.stop(),
                }),
            },
        });
    }

    async onReady(): Promise<void> {
        await this.instance?.check();
    }

    async teardown(): Promise<void> {
        await this.instance?.stop();
    }
}

/** The knowledge module (`chamvi:knowledge`); see `KnowledgeModule`. */
export function knowledgeModule(options?: KnowledgeModuleOptions): KnowledgeModule {
    return new KnowledgeModule(options);
}
