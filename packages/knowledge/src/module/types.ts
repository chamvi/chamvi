/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TypedToken } from 'eldin';
import type { EmbeddingModelRef, KnowledgeCollectionDefinition } from '../collection/types.ts';
import type { IKnowledgeCollectionRepository } from '../store/types.ts';

export type KnowledgeModuleOptions = {
    /** The declared collections (`knowledgeCollection()`); string models resolve through the app's providers. */
    collections?: readonly KnowledgeCollectionDefinition[];
    /**
     * Wins over a repository a backend module registered
     * (`KnowledgeToken.REPOSITORY`); without either an in-memory repository
     * (every restart re-embeds; warned outside dev).
     */
    repository?: IKnowledgeCollectionRepository;
    /** The indexer's lock owner; default `${hostname}-${pid}`. */
    owner?: string;
    /**
     * The model of managed collections (a string resolves through the app's
     * providers); `CHAMVI_KNOWLEDGE_MODEL` wins over it. Without either,
     * creating a managed collection is refused.
     */
    embeddingModel?: EmbeddingModelRef;
    /** Where `CHAMVI_KNOWLEDGE_MODEL` is read, when the factory is called; default `process.env`. */
    env?: Record<string, string | undefined>;
    /** `false` contributes no `knowledgeRoutes()` to the http app. */
    routes?: false;
};

export type KnowledgeTokens = {
    /** The collection repository of a backend module (`chamvi:knowledge-repository`). */
    REPOSITORY: TypedToken<IKnowledgeCollectionRepository>;
};
