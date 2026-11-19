/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryEntityRepository } from '@chamvi/store-memory';
import type { MemoryRepositoryOptions } from '@chamvi/store-memory';
import { compareCodePoints } from '../helpers.ts';
import { KNOWLEDGE_CHUNK_ENTITY, KNOWLEDGE_COLLECTION_ENTITY } from '../constants.ts';
import type {
    IKnowledgeChunkRepository,
    KnowledgeChunkMatch,
    KnowledgeChunkRecord,
    KnowledgeSearchOptions,
} from '../types.ts';

/**
 * Cosine similarity of two vectors of one length, 0 when one of them is
 * the zero vector.
 */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
    let dot = 0;
    let left = 0;
    let right = 0;

    for (const [index, value] of a.entries()) {
        const other = b[index]!;

        dot += value * other;
        left += value * value;
        right += other * other;
    }

    if (left === 0 || right === 0) {
        return 0;
    }

    return dot / Math.sqrt(left * right);
}

/**
 * Knowledge chunks in the registry (key `key`,
 * `(collectionId, document, generation, index)` unique, `collectionId`
 * references the collection; no reference to the document), stored as
 * given. `search` is an exhaustive cosine scan.
 */
export class MemoryKnowledgeChunkRepository extends MemoryEntityRepository<KnowledgeChunkRecord> implements IKnowledgeChunkRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: KNOWLEDGE_CHUNK_ENTITY,
            registry: options.registry,
            key: ['key'],
            unique: [['collectionId', 'document', 'generation', 'index']],
            references: [{ field: 'collectionId', entity: KNOWLEDGE_COLLECTION_ENTITY }],
        });
    }

    /**
     * The rows matching the where, each locked, read again by its key and
     * rewritten if it still matches, in the caller's transaction or one of
     * its own: a row a concurrent delete or replace removed or moved is
     * skipped, never written back.
     */
    async updateOrigin(
        where: {
            collectionId: string;
            document: string;
            generation: number;
        },
        origin: { title?: string; source?: string },
    ): Promise<number> {
        if (!this.tx) {
            return this.transaction((repository) => repository.updateOrigin(where, origin));
        }

        let updated = 0;

        for (const { key } of await this.findManyBy(where)) {
            const row = await this.findOneBy({ key });

            if (
                !row ||
                row.collectionId !== where.collectionId ||
                row.document !== where.document ||
                row.generation !== where.generation
            ) {
                continue;
            }

            const next = { ...row };

            delete next.title;
            delete next.source;

            if (origin.title !== undefined) {
                next.title = origin.title;
            }

            if (origin.source !== undefined) {
                next.source = origin.source;
            }

            await this.upsert(next);
            updated++;
        }

        return updated;
    }

    async search(
        collectionId: string,
        generation: number,
        vector: number[],
        options: KnowledgeSearchOptions,
    ): Promise<KnowledgeChunkMatch[]> {
        const matches: KnowledgeChunkMatch[] = [];

        for (const chunk of await this.findManyBy({ collectionId, generation })) {
            // a vector of another length is another model's: never compared
            if (chunk.vector.length !== vector.length) {
                continue;
            }

            const score = cosineSimilarity(vector, chunk.vector);

            if (options.minScore !== undefined && score < options.minScore) {
                continue;
            }

            matches.push({
                document: chunk.document,
                index: chunk.index,
                text: chunk.text,
                score,
                ...(chunk.title === undefined ? {} : { title: chunk.title }),
                ...(chunk.source === undefined ? {} : { source: chunk.source }),
            });
        }

        return matches
            .sort((a, b) => (b.score - a.score) ||
                compareCodePoints(a.document, b.document) ||
                (a.index - b.index))
            .slice(0, Math.max(0, options.topK));
    }
}
