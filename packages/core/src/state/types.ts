/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { IStateDocumentRepository, IStateRepository } from '@chamvi/store';
import type { IQuery } from '@rapiq/core';

export type StateSchema = Record<string, StandardSchemaV1>;
export type Infer<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

export interface IAgentState<S extends StateSchema = StateSchema> {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    collection<K extends keyof S & string>(name: K): {
        list(q?: { where?: Partial<Infer<S[K]>>; limit?: number }): Promise<Array<{ id: string } & Infer<S[K]>>>;
        /** Validates `doc` via the collection's Standard Schema; throws ValidationError and stores nothing on failure. */
        upsert(id: string, doc: Infer<S[K]>): Promise<void>;
        remove(id: string): Promise<void>;
    };
}

export type StateServiceContext = {
    /** The key-value port. */
    repository: IStateRepository;
    /** The document port. */
    documentRepository: IStateDocumentRepository;
};

export type StateFindOptions = { limit?: number; offset?: number };

export type StateDocumentFindOptions = { where?: Record<string, unknown>; limit?: number };

/** One key of an agent's state. */
export type StateEntryValue = { key: string; value: unknown };

/** One document of a collection: its id and the document. */
export type StateDocumentValue = { id: string; doc: unknown };

/**
 * The operations of `StateService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IStateService {
    /** The value of the key; `undefined` when the agent holds none (a stored falsy value is present). */
    findOne(agent: string, key: string): Promise<unknown>;

    /** As `findOne`; RepositoryNotFoundError when the key is absent. */
    findOneOrFail(agent: string, key: string): Promise<unknown>;

    /** Stores `value` under the key, replacing a stored one; `undefined` removes the key. Resolves the stored value. */
    set(agent: string, key: string, value: unknown): Promise<unknown>;

    /**
     * One agent's entries ordered by key in code-point order; every entry
     * (from `offset`) without `limit`.
     */
    find(agent: string, options?: StateFindOptions): Promise<StateEntryValue[]>;

    /**
     * An agent's keys by a rapiq query over the entry fields (`key`,
     * `value`), for an API listing: its filters joined with the agent's,
     * its sorts, then `key` in code-point order, its pagination.
     */
    list(agent: string, query: IQuery): Promise<StateEntryValue[]>;

    /** As `find`; RepositoryNotFoundError when the selected page is empty. */
    findOrFail(agent: string, options?: StateFindOptions): Promise<StateEntryValue[]>;

    /**
     * The documents of a collection, ordered by document id in code-point
     * order; `where` matches by top-level equality (an `undefined` value
     * matches an object document lacking the key).
     */
    findDocuments(
        agent: string,
        collection: string,
        options?: StateDocumentFindOptions,
    ): Promise<StateDocumentValue[]>;

    /**
     * A collection's documents by a rapiq query, for an API listing: its
     * top-level `eq` filters as the top-level equality of `findDocuments`
     * (a field path is a document key), its limit and offset, ordered by
     * document id. Any other condition and any sort is a ValidationError.
     */
    listDocuments(agent: string, collection: string, query: IQuery): Promise<StateDocumentValue[]>;

    /** As `findDocuments`; RepositoryNotFoundError when the selected page is empty. */
    findDocumentsOrFail(
        agent: string,
        collection: string,
        options?: StateDocumentFindOptions,
    ): Promise<StateDocumentValue[]>;

    /** Stores the document, replacing a stored one of that id; `undefined` is stored as `null`. */
    upsertDocument(agent: string, collection: string, id: string, doc: unknown): Promise<StateDocumentValue>;

    /** Removes the document; a missing one is a no-op. */
    deleteDocument(agent: string, collection: string, id: string): Promise<void>;
}
