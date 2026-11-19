/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { KNOWLEDGE_CHUNK_ENTITY, KNOWLEDGE_COLLECTION_ENTITY } from '@chamvi/knowledge';
import type {
    IKnowledgeChunkRepository,
    KnowledgeChunkMatch,
    KnowledgeChunkRecord,
    KnowledgeSearchOptions,
} from '@chamvi/knowledge';
import { EntityRepositoryAdapter } from '@chamvi/store-db';
import type { DataSource, EntityManager } from 'typeorm';
import { KnowledgeChunkEntity, KnowledgeCollectionEntity } from '../entities/index.ts';
import { fromChunkEntity, toChunkEntity, toVectorParameter } from './helpers.ts';

/** A row of `search`'s statement. */
type SearchRow = {
    document: string;
    index: number;
    text: string;
    title: string | null;
    source: string | null;
    score: number | string;
};

/**
 * Knowledge chunks in `chamvi_vector_chunks` (`(collection_id, document,
 * generation, index)` unique, removed with their collection; no reference
 * to the document), stored as given (text sanitized). `search` is an exact
 * scan of one collection's generation by pgvector's cosine distance.
 */
export class DatabaseKnowledgeChunkRepository
    extends EntityRepositoryAdapter<KnowledgeChunkRecord, KnowledgeChunkEntity>
    implements IKnowledgeChunkRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(KnowledgeChunkEntity), {
            entity: KNOWLEDGE_CHUNK_ENTITY,
            alias: 'knowledgeChunk',
            target: KnowledgeChunkEntity,
            toEntity: toChunkEntity,
            fromEntity: fromChunkEntity,
            related: [{ target: KnowledgeCollectionEntity, entity: KNOWLEDGE_COLLECTION_ENTITY }],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseKnowledgeChunkRepository(manager) as this;
    }

    async search(
        collectionId: string,
        generation: number,
        vector: number[],
        options: KnowledgeSearchOptions,
    ): Promise<KnowledgeChunkMatch[]> {
        const limit = Math.trunc(options.topK);

        // no row can be returned (memory slices to none): no statement
        if (!(limit > 0) || vector.length === 0) {
            return [];
        }

        // the ORM has no vector operator: `<=>` is pgvector's cosine distance, NaN (a zero vector on
        // either side) counts as orthogonal, as memory scores it 0
        const distance = 'COALESCE(NULLIF("chunk"."embedding" <=> CAST(:query AS vector), \'NaN\'), 1)';
        const statement = this.repository.createQueryBuilder('chunk')
            .select('chunk.document', 'document')
            .addSelect('chunk.index', 'index')
            .addSelect('chunk.text', 'text')
            .addSelect('chunk.title', 'title')
            .addSelect('chunk.source', 'source')
            .addSelect(`1 - ${distance}`, 'score')
            .where({ collectionId, generation })
            // vector_dims (raw: no ORM operator): a vector of another length is another model's, never compared
            .andWhere('vector_dims("chunk"."embedding") = :dimensions', { dimensions: vector.length })
            .setParameter('query', toVectorParameter(vector))
            .orderBy(distance, 'ASC')
            .addOrderBy('chunk.document', 'ASC')
            .addOrderBy('chunk.index', 'ASC');

        if (options.minScore !== undefined) {
            // PostgreSQL may evaluate WHERE conditions in any order: the CASE keeps `<=>` off another length
            statement.andWhere(
                `CASE WHEN vector_dims("chunk"."embedding") = :dimensions THEN 1 - ${distance} >= :minScore ELSE false END`,
                { minScore: options.minScore },
            );
        }

        if (Number.isFinite(limit)) {
            statement.limit(limit);
        }

        const rows = await this.persist(() => statement.getRawMany<SearchRow>(), 'search');

        return rows.map((row) => ({
            document: row.document,
            index: row.index,
            text: row.text,
            score: Number(row.score),
            ...(row.title === null ? {} : { title: row.title }),
            ...(row.source === null ? {} : { source: row.source }),
        }));
    }
}
