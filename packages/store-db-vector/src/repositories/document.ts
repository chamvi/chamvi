/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { KNOWLEDGE_COLLECTION_ENTITY, KNOWLEDGE_DOCUMENT_ENTITY } from '@chamvi/knowledge';
import type { IKnowledgeDocumentRepository, KnowledgeDocumentRecord } from '@chamvi/knowledge';
import { EntityRepositoryAdapter } from '@chamvi/store-db';
import type { DataSource, EntityManager } from 'typeorm';
import { KnowledgeCollectionEntity, KnowledgeDocumentEntity } from '../entities/index.ts';
import { fromDocumentEntity, toDocumentEntity } from './helpers.ts';

/**
 * Knowledge documents in `chamvi_vector_documents` (`id` `COLLATE "C"`,
 * `(collection_id, id)` unique, removed with their collection), stored
 * as given (text sanitized); `upsert` replaces by `(collectionId, id)`.
 */
export class DatabaseKnowledgeDocumentRepository
    extends EntityRepositoryAdapter<KnowledgeDocumentRecord, KnowledgeDocumentEntity>
    implements IKnowledgeDocumentRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(KnowledgeDocumentEntity), {
            entity: KNOWLEDGE_DOCUMENT_ENTITY,
            alias: 'knowledgeDocument',
            target: KnowledgeDocumentEntity,
            toEntity: toDocumentEntity,
            fromEntity: fromDocumentEntity,
            related: [{ target: KnowledgeCollectionEntity, entity: KNOWLEDGE_COLLECTION_ENTITY }],
            upsertKey: ['collectionId', 'id'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseKnowledgeDocumentRepository(manager) as this;
    }
}
