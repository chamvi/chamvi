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
    KnowledgeDocumentDetails,
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
 * A pass's fence token: the collection row's id and its fence counter
 * (`advanceFence()`). A collection deleted and created again is another row,
 * so the token of the old one never matches the new one.
 */
export type KnowledgeFence = {
    id: string;
    fence: number;
};

/**
 * With `fence`, a write applies only while the collection's row has that
 * id and fence (`LeaseLostError` on the lock `knowledge:<name>` otherwise,
 * nothing written); a missing collection is `RepositoryNotFoundError`.
 */
export type KnowledgeWriteOptions = {
    fence?: KnowledgeFence;
    /**
     * `saveCollection` only: insert, never replace; a stored row of the name
     * is `LeaseLostError` on the lock `knowledge:<name>` (another owner
     * created it), nothing written.
     */
    create?: boolean;
};

/**
 * Knowledge collections, their documents and chunk vectors, with every
 * rule of their storage. Values are copied in and out; every method is
 * atomic on its own. The writes a pass makes take `KnowledgeWriteOptions`. Documents and chunks need their collection
 * (`RepositoryNotFoundError` otherwise); chunks may be written before
 * their document's record.
 */
export interface IKnowledgeService {
    /**
     * Inserts the collection of that name, or replaces every field of the
     * stored one, keeping its row id and fence; resolves the stored row.
     */
    saveCollection(collection: KnowledgeCollection, options?: KnowledgeWriteOptions): Promise<KnowledgeCollectionRecord>;
    /**
     * Counts the collection's fence up by one and answers the new token
     * (`undefined` for a missing collection); itself never fenced. A pass
     * calls it once it holds the lock `knowledge:<name>`, so the writes of a
     * pass that lost the lock are refused.
     */
    advanceFence(name: string): Promise<KnowledgeFence | undefined>;
    findOneCollection(name: string): Promise<KnowledgeCollection | undefined>;
    /** As `findOneCollection`, rejecting a missing one with `RepositoryNotFoundError`. */
    findOneCollectionOrFail(name: string): Promise<KnowledgeCollection>;
    /** Every collection, in name code-point order. */
    findCollections(): Promise<KnowledgeCollection[]>;
    /** Deletes the collection with its documents and chunks; whether it existed. */
    deleteCollection(name: string): Promise<boolean>;
    /** Inserts or replaces the document of that collection and id. */
    saveDocument(document: KnowledgeDocument, options?: KnowledgeWriteOptions): Promise<void>;
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
        options?: KnowledgeWriteOptions,
    ): Promise<boolean>;
    /**
     * Rewrites the document's title, source and metadata (a detail not
     * given is removed) and the title and source of its chunks of every
     * generation, stamping
     * `updatedAt`, only while the stored document has that version's hash,
     * title and source (atomic check and write); `false` for a missing
     * document or another version. Unfenced: an API write.
     */
    updateDetails(
        collection: string,
        id: string,
        version: KnowledgeDocumentVersion,
        details: KnowledgeDocumentDetails,
    ): Promise<boolean>;
    /** Deletes the document and its chunks of every generation; whether the document existed. */
    deleteDocument(collection: string, id: string, options?: KnowledgeWriteOptions): Promise<boolean>;
    /** Atomically replaces the document's chunks of one generation (`[]` removes them). */
    replaceChunks(
        collection: string,
        document: string,
        generation: number,
        chunks: KnowledgeChunkInput[],
        options?: KnowledgeWriteOptions,
    ): Promise<void>;
    /** Deletes every chunk of that generation. */
    deleteGeneration(collection: string, generation: number, options?: KnowledgeWriteOptions): Promise<void>;
    /** Deletes every chunk of the collection outside that generation. */
    deleteGenerationsExcept(collection: string, generation: number, options?: KnowledgeWriteOptions): Promise<void>;
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
