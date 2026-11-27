/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ConnectionEntryRecord,
    ConnectionRecord,
    ConnectionSecretRecord,
    Lock,
} from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The entries of connections: the generic entity port on
 * `ConnectionEntryRecord` (key `id`, `(connectionId, key)` unique; `upsert`
 * replaces by `(connectionId, key)` and keeps the stored id). An entry of
 * a missing connection is `EntityRelationError` naming `connection`.
 */
export interface IConnectionEntryRepository extends IEntityRepository<ConnectionEntryRecord> {}

/**
 * The secrets of connections: the generic entity port on
 * `ConnectionSecretRecord` (key `id`, `(connectionId, name)` unique;
 * `upsert` replaces by `(connectionId, name)` and keeps the stored id). A
 * secret of a missing connection is `EntityRelationError` naming
 * `connection`.
 */
export interface IConnectionSecretRepository extends IEntityRepository<ConnectionSecretRecord> {}

/**
 * The connection port: the generic entity port on `ConnectionRecord` (key
 * `id`, `name` unique; a sort by `name` orders by code point), with the
 * aggregate's child tables as repositories of their own. Inside
 * `transaction(fn)` the handed-in repository's `entries` and `secrets` are
 * bound to the same transaction: a rejected `fn` restores the connection
 * and its children alike. Remove a connection's entries and secrets
 * before the connection: what a remove of a connection that still has
 * children does is the driver's (memory refuses it with
 * `EntityRelationError`, the database's foreign keys cascade).
 */
export interface IConnectionRepository extends IEntityRepository<ConnectionRecord> {
    readonly entries: IConnectionEntryRepository;

    readonly secrets: IConnectionSecretRepository;

    /**
     * The lock row of the lease named `name` (its key: the fence's
     * `lock`), or `null`. Inside `transaction()` the row is locked against
     * changes: no takeover, renew, release or purge of the lease commits
     * before the transaction ends, and one in flight is waited for. Read it
     * after the connection row's lock. It decides nothing: the caller
     * compares the owner and the expiry.
     */
    findFence(name: string): Promise<Lock | null>;
}
