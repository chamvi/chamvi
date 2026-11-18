/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '@chamvi/store';

/** `declared`: defined in code and owned by it; `managed`: created and filled through the API. */
export type KnowledgeCollectionKind = 'declared' | 'managed';

export type KnowledgeCollectionStatus = 'pending' | 'ready' | 'stale' | 'orphaned';

/** The embedding model and chunker a generation of chunks was written with. */
export type KnowledgeTarget = {
    generation: number;
    model: string;
    dimensions?: number;
    chunker: string;
};

export type KnowledgeCollection = {
    name: string;
    kind: KnowledgeCollectionKind;
    trusted: boolean;
    /** The generation searches are served from; 0 = never indexed. */
    generation: number;
    /** Model identity of the served generation. */
    model: string;
    /** Vector length of the served generation, once known. */
    dimensions?: number;
    /** Chunker version of the served generation. */
    chunker: string;
    /** A re-embed in progress: the generation written next, not served yet. */
    pending?: KnowledgeTarget;
    /**
     * The highest generation number ever given to a re-embed, so an abandoned
     * one's number is never reused (its documents still name it).
     */
    lastGeneration?: number;
    status: KnowledgeCollectionStatus;
    /** The last indexing failure, cleared by a successful index. */
    error?: string;
    /** Failed attempts since the last successful index; the backoff doubles per failure. */
    failures?: number;
    /** No replica tries again before it (the backoff shared across replicas). */
    retryAt?: Date;
    /** The end of the last successful pass. */
    syncedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
};

/**
 * `pending`: accepted, its chunks not written for its `hash` yet; `ready`:
 * searchable at its `generation`; `failed`: the provider refused it (`error`).
 */
export type KnowledgeDocumentStatus = 'pending' | 'ready' | 'failed';

export type KnowledgeDocument = {
    collection: string;
    id: string;
    content: string;
    /** `contentHash(content)`. */
    hash: string;
    title?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    status: KnowledgeDocumentStatus;
    /** Why it `failed`; absent otherwise. */
    error?: string;
    /** The generation its chunks were written for `hash`. */
    generation: number;
    updatedAt: Date;
};

export type KnowledgeDocumentFindOptions = {
    status?: KnowledgeDocumentStatus;
    limit?: number;
    offset?: number;
};

export type KnowledgeDocumentPage = {
    data: KnowledgeDocument[];
    /** Documents matching the filter, before `limit`/`offset`. */
    total: number;
};

/**
 * The version of a document `updateDocument()` writes to: its hash and the
 * title and source its chunks carry (absent matches absent only).
 */
export type KnowledgeDocumentVersion = {
    hash: string;
    title?: string;
    source?: string;
};

/** The title and source `updateDetails()` writes; one not given is removed. */
export type KnowledgeDocumentDetails = {
    title?: string;
    source?: string;
};

/** The fields `updateDocument()` writes; an `error` not given is removed. */
export type KnowledgeDocumentPatch = {
    status: KnowledgeDocumentStatus;
    error?: string;
    generation?: number;
};

/**
 * A passage with its vector; `start`/`end` are UTF-16 offsets into the
 * document's content. `title`/`source` are the document's at the time the
 * chunk was written: search results show them, so a replaced document never
 * shows its new details next to its old text.
 */
export type KnowledgeChunkInput = {
    index: number;
    text: string;
    start: number;
    end: number;
    vector: number[];
    title?: string;
    source?: string;
};

export type KnowledgeMatch = {
    collection: string;
    /** The document id. */
    document: string;
    /** The chunk index within the document. */
    index: number;
    text: string;
    /** Cosine similarity, 1 for the same direction. */
    score: number;
    /** The chunk's copy of its document's title. */
    title?: string;
    /** The chunk's copy of its document's source. */
    source?: string;
};

export type KnowledgeSearchOptions = {
    topK: number;
    /** Matches scoring below it are dropped. */
    minScore?: number;
};

/**
 * The row of a collection: the collection with its row `id` (a uuid v7
 * given at creation and never changed, so a collection deleted and created
 * again under its name is another row) and its `fence` counter (0 for a new
 * row). `name` is unique.
 */
export type KnowledgeCollectionRecord = KnowledgeCollection & {
    id: string;
    fence: number;
};

/**
 * The row of a document: the document with its row `key` (a uuid v7) and
 * its collection's row id in place of the collection's name;
 * `(collectionId, id)` is unique.
 */
export type KnowledgeDocumentRecord = Omit<KnowledgeDocument, 'collection'> & {
    key: string;
    collectionId: string;
};

/**
 * The row of a chunk: a chunk of one document and generation with its row
 * `key` (a uuid v7); `(collectionId, document, generation, index)` is
 * unique. It references the collection only: chunks may be written before
 * their document's record.
 */
export type KnowledgeChunkRecord = KnowledgeChunkInput & {
    key: string;
    collectionId: string;
    /** The document id. */
    document: string;
    generation: number;
};

/** A match of `IKnowledgeChunkRepository.search`, before the collection's name is added. */
export type KnowledgeChunkMatch = Omit<KnowledgeMatch, 'collection'>;

/**
 * The chunks of collections: the generic entity port on
 * `KnowledgeChunkRecord` (key `key`), with one finder. A chunk of a missing
 * collection is `EntityRelationError` naming the collection.
 */
export interface IKnowledgeChunkRepository extends IEntityRepository<KnowledgeChunkRecord> {
    /**
     * The `topK` chunks of the collection's generation closest to `vector`
     * by cosine similarity, highest score first, ties by document id (code
     * point), then chunk index; a score below `minScore` is dropped. Only
     * chunks whose vector has the length of `vector` take part (two models
     * never meet in one search).
     */
    search(
        collectionId: string,
        generation: number,
        vector: number[],
        options: KnowledgeSearchOptions,
    ): Promise<KnowledgeChunkMatch[]>;
}

/**
 * The documents of collections: the generic entity port on
 * `KnowledgeDocumentRecord` (key `key`, `(collectionId, id)` unique;
 * `upsert` replaces by `(collectionId, id)` and keeps the stored key). A
 * document of a missing collection is `EntityRelationError` naming the
 * collection.
 */
export interface IKnowledgeDocumentRepository extends IEntityRepository<KnowledgeDocumentRecord> {}

/**
 * The knowledge port: the generic entity port on `KnowledgeCollectionRecord`
 * (key `id`, `name` unique; a sort by `name` orders by code point), with
 * the aggregate's documents and chunks as repositories of their own. Inside
 * `transaction(fn)` the handed-in repository's `documents` and `chunks`
 * are bound to the same transaction. Remove a collection's chunks and
 * documents before the collection.
 */
export interface IKnowledgeCollectionRepository extends IEntityRepository<KnowledgeCollectionRecord> {
    readonly documents: IKnowledgeDocumentRepository;

    readonly chunks: IKnowledgeChunkRepository;
}
