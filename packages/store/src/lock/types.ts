/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '../entity/types.ts';

/** A lease on a key: the row a lock stores. */
export type Lock = {
    /** The row's storage id (a uuid); a takeover of the key keeps it. */
    id: string;
    /** The leased key, unique. */
    key: string;
    /** Who holds the lease. */
    owner: string;
    /** When the lease ends: from this time on it counts as expired. */
    expiresAt: Date;
    /**
     * The fencing token of the lease: from `ILockRepository.nextToken()`,
     * issued on every insert and takeover, kept by a renewal.
     */
    token: number;
};

/**
 * The lock port: the generic entity port on `Lock` (key `id`, `key`
 * unique). A save of a created lock whose `key` is stored is
 * `EntityConflictError`.
 */
export interface ILockRepository extends IEntityRepository<Lock> {
    /**
     * Delete every lock whose `expiresAt` is at or before `time` and
     * resolve how many it deleted. A row a transaction holds is checked
     * once that transaction ended, so a lock renewed or taken over past
     * `time` meanwhile stays.
     */
    removeExpiredBy(time: Date): Promise<number>;

    /**
     * Issue the next fencing token: a positive safe integer strictly above
     * every token this storage issued before, for any key, and at least
     * the wall clock in microseconds (`max(last + 1, ms * 1000)`), so a
     * recreated or switched lock store never issues one below a token a
     * previous store handed out. Inside a transaction it is issued in it.
     */
    nextToken(): Promise<number>;
}
