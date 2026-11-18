/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    KnowledgeChunkEntity,
    KnowledgeCollectionEntity,
    KnowledgeDocumentEntity,
} from '../entities/index.ts';
import { KnowledgeVector1795037128304 } from '../migrations/index.ts';

/** The database name of the knowledge vector store (`chamvi migration --database vector`). */
export const KNOWLEDGE_VECTOR_DATABASE = 'vector';

/** The table its migrations are recorded in, apart from chamvi's store's `migrations`. */
export const KNOWLEDGE_VECTOR_MIGRATIONS_TABLE = 'chamvi_vector_migrations';

export const KNOWLEDGE_VECTOR_ENTITIES = [
    KnowledgeCollectionEntity,
    KnowledgeDocumentEntity,
    KnowledgeChunkEntity,
];

export const KNOWLEDGE_VECTOR_MIGRATIONS = [
    KnowledgeVector1795037128304,
];
