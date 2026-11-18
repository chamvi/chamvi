/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryEntityRepository } from '@chamvi/store-memory';
import type { MemoryRepositoryOptions } from '@chamvi/store-memory';
import { KNOWLEDGE_COLLECTION_ENTITY, KNOWLEDGE_DOCUMENT_ENTITY } from '../constants.ts';
import type { IKnowledgeDocumentRepository, KnowledgeDocumentRecord } from '../types.ts';

/**
 * Knowledge documents in the registry (key `key`, `(collectionId, id)`
 * unique, `collectionId` references the collection), stored as given;
 * `upsert` replaces by `(collectionId, id)`.
 */
export class MemoryKnowledgeDocumentRepository extends MemoryEntityRepository<KnowledgeDocumentRecord> implements IKnowledgeDocumentRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: KNOWLEDGE_DOCUMENT_ENTITY,
            registry: options.registry,
            key: ['key'],
            unique: [['collectionId', 'id']],
            references: [{ field: 'collectionId', entity: KNOWLEDGE_COLLECTION_ENTITY }],
            upsertKey: ['collectionId', 'id'],
        });
    }
}
