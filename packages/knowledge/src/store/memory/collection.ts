/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';
import type { MemoryRepositoryOptions, MemoryTransaction } from '@chamvi/store-memory';
import { KNOWLEDGE_COLLECTION_ENTITY } from '../constants.ts';
import type { IKnowledgeCollectionRepository, KnowledgeCollectionRecord } from '../types.ts';
import { MemoryKnowledgeChunkRepository } from './chunk.ts';
import { MemoryKnowledgeDocumentRepository } from './document.ts';

/**
 * Knowledge collections in the registry (key `id`, `name` unique),
 * stored as given, with their documents and chunks as child repositories
 * on the same registry; a transaction binds all three. Nothing survives
 * the process, so every restart re-embeds.
 */
export class MemoryKnowledgeCollectionRepository extends MemoryEntityRepository<KnowledgeCollectionRecord> implements IKnowledgeCollectionRepository {
    documents: MemoryKnowledgeDocumentRepository;

    chunks: MemoryKnowledgeChunkRepository;

    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: KNOWLEDGE_COLLECTION_ENTITY,
            registry: options.registry,
            key: ['id'],
            unique: [['name']],
        });

        this.documents = new MemoryKnowledgeDocumentRepository(options);
        this.chunks = new MemoryKnowledgeChunkRepository(options);
    }

    protected override bind(transaction: MemoryTransaction): this {
        const bound = super.bind(transaction);

        bound.documents = this.bindChild(this.documents, transaction);
        bound.chunks = this.bindChild(this.chunks, transaction);

        return bound;
    }
}

/** Fresh, empty in-memory knowledge repositories on a registry of their own. */
export function createMemoryKnowledgeRepository(): IKnowledgeCollectionRepository {
    return new MemoryKnowledgeCollectionRepository({ registry: new MemoryRegistry() });
}
