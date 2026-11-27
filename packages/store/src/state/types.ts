/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StateDocument, StateEntry } from '@chamvi/core-kit';
import type { EntityFindManyResult, IEntityRepository } from '../entity/types.ts';

/** One page of `findContaining`: without `limit`, every row from `offset`. */
export type StateDocumentPage = {
    limit?: number;
    offset?: number;
};

/**
 * The key-value port: the generic entity port on `StateEntry` (key `id`,
 * `(agent, key)` unique; `key` sorts by code point). `upsert` inserts, or
 * replaces the `value` of the row with the same `(agent, key)` and keeps
 * its stored `id`.
 */
export interface IStateRepository extends IEntityRepository<StateEntry> {}

/**
 * The document port: the generic entity port on `StateDocument` (key
 * `id`, `(agent, collection, documentId)` unique; `documentId` sorts by
 * code point). `upsert` inserts, or replaces the `doc` of the row with the
 * same `(agent, collection, documentId)` and keeps its stored `id`.
 */
export interface IStateDocumentRepository extends IEntityRepository<StateDocument> {
    /**
     * The documents of one collection whose `doc` is an object holding
     * every entry of `where` at its top level: a value matches an equal
     * value (objects and arrays by deep equality, `null` an explicit
     * `null`), `undefined` matches an object lacking the key. An empty
     * `where` matches every document of the collection. Ordered by
     * `documentId` (code point), paged by `page`; the total counts the
     * whole selection. Locks nothing.
     */
    findContaining(
        agent: string,
        collection: string,
        where: Record<string, unknown>,
        page: StateDocumentPage,
    ): Promise<EntityFindManyResult<StateDocument>>;
}
