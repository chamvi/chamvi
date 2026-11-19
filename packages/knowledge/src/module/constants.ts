/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { IKnowledgeCollectionRepository } from '../store/types.ts';
import type { KnowledgeTokens } from './types.ts';

export const KNOWLEDGE_MODULE_NAME = 'chamvi:knowledge';

/**
 * The module name a knowledge repository backend takes
 * (`vectorStoreModule()` of `@chamvi/store-db-vector`): the knowledge module
 * depends on it optionally, so the backend sets up first; a second backend
 * in one app fails as a duplicate module.
 */
export const KNOWLEDGE_REPOSITORY_MODULE_NAME = 'chamvi:knowledge-repository';

/** The container keys of the knowledge module. */
export const KnowledgeToken: KnowledgeTokens = {
    /** The collection repository a backend module registers in its `setup`; `knowledgeModule()` uses it unless given `repository`. */
    REPOSITORY: new TypedToken<IKnowledgeCollectionRepository>('chamvi.knowledge-repository'),
};

/** Logged once per setup outside dev when no repository is given or registered. */
export const MEMORY_KNOWLEDGE_WARNING = 'Knowledge is kept in memory: every restart re-embeds.';

/** The managed collections' embedding model, read by `knowledgeModule()`; wins over its `embeddingModel`. */
export const KNOWLEDGE_MODEL_VARIABLE = 'CHAMVI_KNOWLEDGE_MODEL';
