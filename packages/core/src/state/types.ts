/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { IStateDocumentRepository, IStateRepository } from '@chamvi/store';

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
