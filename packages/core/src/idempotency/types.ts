/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IIdempotencyRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';

export type IdempotencyServiceContext = {
    repository: IIdempotencyRepository;
    /** Read after each locked read: a claim is compared with a fresh time. */
    clock: IClock;
};

/** The outcome of a claim: whether this caller created it, and the run the key belongs to. */
export type IdempotencyClaim = {
    created: boolean;
    runId: string;
};

/**
 * The operations of `IdempotencyService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IIdempotencyService {
    /**
     * Claims `(scope, key)` for `runId` until now + `ttlMs`. Resolves
     * `{ created: true, runId }` for the caller that claimed it (also one
     * taking over an expired claim), else `{ created: false, runId }` with
     * the run of the unexpired claim.
     *
     * A claimed key is refused on one plain read (no transaction, no
     * insert that would raise a unique violation): a refusal may rest on
     * an unlocked read, an insert or a takeover never does. A key the
     * plain read found expired goes straight to the locked takeover; only
     * a key it found free (or one gone by the locked read) tries the
     * insert.
     */
    claim(scope: string, key: string, runId: string, ttlMs: number): Promise<IdempotencyClaim>;

    /** The unexpired claim of `(scope, key)` (`created: false`), else undefined; one plain read. */
    findOne(scope: string, key: string): Promise<IdempotencyClaim | undefined>;

    /**
     * Gives up the unexpired claim of `(scope, key)` when it belongs to
     * `runId`: it expires now, so the next claim takes it over. A claim of
     * another run, an expired one or a missing key is left alone.
     */
    release(scope: string, key: string, runId: string): Promise<void>;

    /** Deletes the claims expired at `now` (default: the clock's time); resolves how many. */
    purgeExpired(now?: Date): Promise<number>;
}
