/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type {
    IKnowledgeCollectionRepository,
    KnowledgeChunkInput,
    KnowledgeCollection,
    KnowledgeCollectionRecord,
    KnowledgeDocument,
    KnowledgeDocumentFindOptions,
    KnowledgeDocumentPage,
    KnowledgeDocumentPatch,
    KnowledgeDocumentVersion,
    KnowledgeMatch,
    KnowledgeSearchOptions,
} from '../store/types.ts';

/** What a `KnowledgeService` is built from. */
export type KnowledgeServiceContext = {
    repository: IKnowledgeCollectionRepository;
    clock: IClock;
};

/**
 * Knowledge collections, their documents and chunk vectors, with every
 * rule of their storage. Values are copied in and out; every method is
 * atomic on its own. Documents and chunks need their collection
 * (`RepositoryNotFoundError` otherwise); chunks may be written before
 * their document's record.
 */
export interface IKnowledgeService {
    /**
     * Inserts the collection of that name, or replaces every field of the
     * stored one, keeping its row id and fence; resolves the stored row.
     */
    saveCollection(collection: KnowledgeCollection): Promise<KnowledgeCollectionRecord>;
    findOneCollection(name: string): Promise<KnowledgeCollection | undefined>;
    /** As `findOneCollection`, rejecting a missing one with `RepositoryNotFoundError`. */
    findOneCollectionOrFail(name: string): Promise<KnowledgeCollection>;
    /** Every collection, in name code-point order. */
    findCollections(): Promise<KnowledgeCollection[]>;
    /** Deletes the collection with its documents and chunks; whether it existed. */
    deleteCollection(name: string): Promise<boolean>;
    /** Inserts or replaces the document of that collection and id. */
    saveDocument(document: KnowledgeDocument): Promise<void>;
    findOneDocument(collection: string, id: string): Promise<KnowledgeDocument | undefined>;
    /** As `findOneDocument`, rejecting a missing one with `RepositoryNotFoundError`. */
    findOneDocumentOrFail(collection: string, id: string): Promise<KnowledgeDocument>;
    /** The collection's document ids, in code-point order. */
    findDocumentIds(collection: string): Promise<string[]>;
    /**
     * The collection's documents (filtered by `status`), in id code-point
     * order, paged by `offset` and `limit` (unbounded without); `total`
     * counts the matches before paging.
     */
    findDocuments(collection: string, options?: KnowledgeDocumentFindOptions): Promise<KnowledgeDocumentPage>;
    /**
     * Applies the patch only while the stored document has that version's
     * hash, title and source (atomic check and write); `false` for a missing
     * document or another version.
     */
    updateDocument(
        collection: string,
        id: string,
        version: KnowledgeDocumentVersion,
        patch: KnowledgeDocumentPatch,
    ): Promise<boolean>;
    /** Deletes the document and its chunks of every generation; whether the document existed. */
    deleteDocument(collection: string, id: string): Promise<boolean>;
    /** Atomically replaces the document's chunks of one generation (`[]` removes them). */
    replaceChunks(
        collection: string,
        document: string,
        generation: number,
        chunks: KnowledgeChunkInput[],
    ): Promise<void>;
    /** Deletes every chunk of that generation. */
    deleteGeneration(collection: string, generation: number): Promise<void>;
    /** Deletes every chunk of the collection outside that generation. */
    deleteGenerationsExcept(collection: string, generation: number): Promise<void>;
    /**
     * The `topK` chunks of the generation closest to `vector` by cosine
     * similarity, highest score first, ties by document id (code point),
     * then chunk index; chunks of another vector length are skipped; `[]`
     * for an unknown collection.
     */
    search(
        collection: string,
        generation: number,
        vector: number[],
        options: KnowledgeSearchOptions,
    ): Promise<KnowledgeMatch[]>;
}
