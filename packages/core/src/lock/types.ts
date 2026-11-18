/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILockRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';

export type LockServiceContext = {
    repository: ILockRepository;
    /** Read after each locked read: a lease is compared with a fresh time. */
    clock: IClock;
};

/**
 * The operations of `LockService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface ILockService {
    /**
     * Takes the lease of `key` for `owner` until now + `ttlMs`; resolves
     * false while another lease of the key is unexpired (also one of the
     * same owner). An expired lease is taken over.
     *
     * A held key is refused on one plain read (no transaction, no insert
     * that would raise a unique violation): a refusal may rest on an
     * unlocked read, an insert or a takeover never does. A key the plain
     * read found expired goes straight to the locked takeover; only a key
     * it found free (or one gone by the locked read) tries the insert.
     */
    acquire(key: string, owner: string, ttlMs: number): Promise<boolean>;

    /**
     * Extends the lease to now + `ttlMs`; resolves true only while `owner`
     * holds it unexpired, false when the lease is absent, expired (also
     * when nobody took it over), released or held by another owner. It
     * never creates a lease.
     */
    renew(key: string, owner: string, ttlMs: number): Promise<boolean>;

    /** Ends the lease of `owner` (expired or not); a lease of another owner, or none, stays as it is. */
    release(key: string, owner: string): Promise<void>;

    /** Whether `owner` holds the lease of `key` unexpired now. */
    holds(key: string, owner: string): Promise<boolean>;

    /** Deletes the leases expired at `now` (default: the clock's time); resolves how many. */
    purgeExpired(now?: Date): Promise<number>;
}
