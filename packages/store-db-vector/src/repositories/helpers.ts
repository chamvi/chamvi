/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    KnowledgeChunkRecord,
    KnowledgeCollectionRecord,
    KnowledgeDocumentRecord,
} from '@chamvi/knowledge';
import type { DeepPartial } from 'typeorm';
import type { KnowledgeChunkEntity, KnowledgeCollectionEntity, KnowledgeDocumentEntity } from '../entities/index.ts';

/**
 * Text as PostgreSQL stores it: NUL, which a text column refuses, and lone
 * surrogates, which UTF-8 cannot encode, become U+FFFD (as store-db's jsonb
 * transformers do for JSON). Each replaces one UTF-16 code unit, so chunk
 * offsets into a document's content hold. Anything but a string (absent,
 * a where's array) passes as given.
 */
export function sanitizeText<T>(value: T): T {
    return (typeof value === 'string' ? value.replaceAll('\0', '�').toWellFormed() : value) as T;
}

/** A copy without the properties a row holds as NULL (or a partial row lacks). */
function present<T extends object>(row: Record<string, unknown>): T {
    return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined)) as T;
}

/** The columns of a (partial) collection: an absent property maps to absent columns, `pending` to the four `pending_*` ones. */
export function toCollectionEntity(value: Partial<KnowledgeCollectionRecord>): DeepPartial<KnowledgeCollectionEntity> {
    const { pending } = value;

    return structuredClone({
        id: value.id,
        name: value.name,
        kind: value.kind,
        trusted: value.trusted,
        generation: value.generation,
        model: value.model,
        dimensions: value.dimensions,
        chunker: value.chunker,
        pendingGeneration: pending?.generation,
        pendingModel: pending?.model,
        pendingDimensions: pending?.dimensions,
        pendingChunker: pending?.chunker,
        lastGeneration: value.lastGeneration,
        status: value.status,
        error: sanitizeText(value.error),
        failures: value.failures,
        retryAt: value.retryAt,
        syncedAt: value.syncedAt,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        fence: value.fence,
    }) as DeepPartial<KnowledgeCollectionEntity>;
}

export function fromCollectionEntity(row: KnowledgeCollectionEntity): KnowledgeCollectionRecord {
    const record = present<KnowledgeCollectionRecord>({
        id: row.id,
        name: row.name,
        kind: row.kind,
        trusted: row.trusted,
        generation: row.generation,
        model: row.model,
        dimensions: row.dimensions,
        chunker: row.chunker,
        lastGeneration: row.lastGeneration,
        status: row.status,
        error: row.error,
        failures: row.failures,
        retryAt: row.retryAt,
        syncedAt: row.syncedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        // a number also when an insert merged the column's default back as the driver's string,
        // which TypeORM does without the column transformer
        fence: Number(row.fence),
    });

    // a re-embed in progress exactly while its generation is set
    if (row.pendingGeneration !== null && row.pendingGeneration !== undefined) {
        record.pending = present({
            generation: row.pendingGeneration,
            model: row.pendingModel,
            dimensions: row.pendingDimensions,
            chunker: row.pendingChunker,
        });
    }

    return record;
}

export function toDocumentEntity(value: Partial<KnowledgeDocumentRecord>): DeepPartial<KnowledgeDocumentEntity> {
    return structuredClone({
        key: value.key,
        collectionId: value.collectionId,
        id: value.id,
        content: sanitizeText(value.content),
        hash: value.hash,
        title: sanitizeText(value.title),
        source: sanitizeText(value.source),
        // jsonb: sanitized by the column's transformer
        metadata: value.metadata,
        status: value.status,
        error: sanitizeText(value.error),
        generation: value.generation,
        updatedAt: value.updatedAt,
    }) as DeepPartial<KnowledgeDocumentEntity>;
}

export function fromDocumentEntity(row: KnowledgeDocumentEntity): KnowledgeDocumentRecord {
    return present<KnowledgeDocumentRecord>({
        key: row.key,
        collectionId: row.collectionId,
        id: row.id,
        content: row.content,
        hash: row.hash,
        title: row.title,
        source: row.source,
        metadata: row.metadata,
        status: row.status,
        error: row.error,
        generation: row.generation,
        updatedAt: row.updatedAt,
    });
}

export function toChunkEntity(value: Partial<KnowledgeChunkRecord>): DeepPartial<KnowledgeChunkEntity> {
    return structuredClone({
        key: value.key,
        collectionId: value.collectionId,
        document: value.document,
        generation: value.generation,
        index: value.index,
        text: sanitizeText(value.text),
        start: value.start,
        end: value.end,
        embedding: value.vector,
        title: sanitizeText(value.title),
        source: sanitizeText(value.source),
    }) as DeepPartial<KnowledgeChunkEntity>;
}

export function fromChunkEntity(row: KnowledgeChunkEntity): KnowledgeChunkRecord {
    return present<KnowledgeChunkRecord>({
        key: row.key,
        collectionId: row.collectionId,
        document: row.document,
        generation: row.generation,
        index: row.index,
        text: row.text,
        start: row.start,
        end: row.end,
        vector: row.embedding,
        title: row.title,
        source: row.source,
    });
}

/** A vector as the text pgvector parses (`[1,0.5]`). */
export function toVectorParameter(vector: readonly number[]): string {
    return `[${vector.join(',')}]`;
}
