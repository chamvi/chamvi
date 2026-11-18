/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    KNOWLEDGE_CHUNK_ENTITY,
    KNOWLEDGE_COLLECTION_ENTITY,
    KNOWLEDGE_DOCUMENT_ENTITY,
} from '@chamvi/knowledge';
import type { IKnowledgeCollectionRepository, KnowledgeCollectionRecord } from '@chamvi/knowledge';
import { EntityRepositoryAdapter } from '@chamvi/store-db';
import type { EntityTransaction } from '@chamvi/store-db';
import type { DataSource, EntityManager } from 'typeorm';
import { KnowledgeChunkEntity, KnowledgeCollectionEntity, KnowledgeDocumentEntity } from '../entities/index.ts';
import { DatabaseKnowledgeChunkRepository } from './chunk.ts';
import { DatabaseKnowledgeDocumentRepository } from './document.ts';
import { fromCollectionEntity, toCollectionEntity } from './helpers.ts';

/**
 * Knowledge collections in `chamvi_vector_collections` (`name` unique,
 * `COLLATE "C"`), stored as given, with their documents and chunks as
 * child repositories on the same data source or manager; a transaction
 * binds all three to its manager. Inside a transaction a single-row read
 * of a collection takes `FOR UPDATE`, so every write that reads its
 * collection first waits for another in flight, and one that waited on a
 * row deleted meanwhile reads none.
 */
export class DatabaseKnowledgeRepository
    extends EntityRepositoryAdapter<KnowledgeCollectionRecord, KnowledgeCollectionEntity>
    implements IKnowledgeCollectionRepository {
    readonly documents: DatabaseKnowledgeDocumentRepository;

    readonly chunks: DatabaseKnowledgeChunkRepository;

    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(KnowledgeCollectionEntity), {
            entity: KNOWLEDGE_COLLECTION_ENTITY,
            alias: 'knowledgeCollection',
            target: KnowledgeCollectionEntity,
            toEntity: toCollectionEntity,
            fromEntity: fromCollectionEntity,
            related: [
                { target: KnowledgeDocumentEntity, entity: KNOWLEDGE_DOCUMENT_ENTITY },
                { target: KnowledgeChunkEntity, entity: KNOWLEDGE_CHUNK_ENTITY },
            ],
        });

        this.documents = new DatabaseKnowledgeDocumentRepository(source);
        this.chunks = new DatabaseKnowledgeChunkRepository(source);
    }

    withManager(manager: EntityManager): this {
        return new DatabaseKnowledgeRepository(manager) as this;
    }

    protected override bindTo(
        source: EntityRepositoryAdapter<KnowledgeCollectionRecord, KnowledgeCollectionEntity>,
        transaction: EntityTransaction,
    ): void {
        super.bindTo(source, transaction);

        const parent = source as DatabaseKnowledgeRepository;

        this.bindChild(this.documents, parent.documents);
        this.bindChild(this.chunks, parent.chunks);
    }
}
