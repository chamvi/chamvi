/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ILockRepository, IModelResolver } from '@chamvi/core';
import type { EmbeddingModel } from 'ai';
import type { EmbeddingModelRef, KnowledgeCollectionDefinition, ResolvedKnowledgeCollection } from '../collection/types.ts';
import type { IKnowledgeRepository, KnowledgeCollection, KnowledgeDocumentStatus } from '../repository/types.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';

/** What an error reported through `onError` concerns. */
export type KnowledgeErrorContext = {
    collection?: string;
};

export type KnowledgeOptions = {
    repository: IKnowledgeRepository;
    /** The store's locks: one indexer per collection across replicas. */
    locks: ILockRepository;
    collections?: readonly KnowledgeCollectionDefinition[];
    /** Resolves string model refs (`embedding()`); the app's resolver in an app. */
    models?: IModelResolver;
    /**
     * The embedding model of managed collections (resolved here like a
     * declared collection's); without it no managed collection can be created.
     */
    embeddingModel?: EmbeddingModelRef;
    /** Default systemClock. */
    clock?: IClock;
    /** The lock owner; default `${hostname}-${pid}`. */
    owner?: string;
    /** Receives indexing errors; default console.error. */
    onError?: (error: unknown, context: KnowledgeErrorContext) => void;
};

/** What `putDocument()` did. */
export type KnowledgeDocumentPutResult = {
    /** The document's status now (`pending` once accepted for embedding). */
    status: KnowledgeDocumentStatus;
    /** False when content and details matched the stored document. */
    changed: boolean;
};

/** The declared and managed collections, their repository and their indexing. */
export interface IKnowledge {
    readonly repository: IKnowledgeRepository;
    /** A declared collection, or undefined. */
    collection(name: string): ResolvedKnowledgeCollection | undefined;
    /** The embedding model of a stored model identity; InvalidAgentDefinitionError for an unknown one. */
    embedding(model: string): EmbeddingModel;
    /** Starts indexing the declared and managed collections in the background. */
    start(): void;
    /**
     * Runs a pass over that collection now (after a stored backoff); calls
     * while a pass runs coalesce into one more pass after it. A stale
     * managed collection is re-embedded at the default model.
     * InvalidRunStateError before `start()`, ValidationError for a name
     * this app does not index (also one whose loop a configuration error
     * ended, until the next `start()`).
     */
    sync(name: string): void;
    /**
     * Creates a managed collection (untrusted, generation 1, at the default
     * embedding model). ValidationError for a bad name; InvalidRunStateError
     * for a name this app declares or any stored record holds, and without
     * an `embeddingModel`.
     */
    createCollection(name: string): Promise<KnowledgeCollection>;
    /**
     * Deletes a managed or orphaned collection with its documents and chunks
     * (false when there is none), after this instance's loop of it stopped
     * and released its lock; InvalidRunStateError for a name this app
     * declares or a declared record.
     */
    deleteCollection(name: string): Promise<boolean>;
    /**
     * Stores a document of a managed collection: unchanged content and
     * details answer `changed: false`; new metadata only is stored as is;
     * anything else is stored `pending` (its previous chunks keep serving)
     * and embedded in the background. ValidationError for invalid input
     * (content 1 to MANAGED_CONTENT_MAX_CHARS characters),
     * RepositoryNotFoundError for a missing collection, InvalidRunStateError
     * for one that is not managed.
     */
    putDocument(collection: string, input: KnowledgeDocumentInput): Promise<KnowledgeDocumentPutResult>;
    /** Deletes a document of a managed collection and its chunks; errors as `putDocument`. */
    deleteDocument(collection: string, id: string): Promise<boolean>;
    /** A copy of the record, `stale` when it is managed and serves another model or chunker than the default. */
    view(record: KnowledgeCollection): KnowledgeCollection;
    /** Stops indexing and waits for it. */
    stop(): Promise<void>;
    /** Runs every source's check and refuses declared names the store holds as managed collections (read-only). */
    check(): Promise<void>;
}
