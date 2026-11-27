/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import { uuidv7 } from 'uuidv7';
import type { ILockRepository } from '@chamvi/store';
import type { Lock } from '@chamvi/core-kit';
import type { IClock } from '../clock/index.ts';
import { InvalidRunStateError } from '../errors/index.ts';
import type { ILockService, LockServiceContext } from './types.ts';

/**
 * Leases on keys over an `ILockRepository`: one owner per key until its
 * lease expires. A lease taken or renewed at T with `ttlMs` expires at
 * exactly `T + ttlMs`: it is held at `T + ttlMs - 1` and can be taken over
 * at `T + ttlMs`.
 *
 * Every change of a lock row is the insert of a new row, or happens in a
 * transaction after a locked single-row read of that row (takeover,
 * renew, release), so a reader that locks the row (the connection fence)
 * sees either the lease before or after a change, never a change in
 * flight. The clock is read after the locked read.
 *
 * Every insert and takeover stores a new fencing token from
 * `ILockRepository.nextToken()`, issued in the same transaction before
 * its insert or locked read (a takeover whose token is not above the
 * stored lease's takes another after the read, and refuses with an
 * InvalidRunStateError if that one is not above it either); a renewal keeps it. Tokens
 * skipped by a refused takeover or a failed insert leave gaps, never repeats.
 */
export class LockService implements ILockService {
    protected repository: ILockRepository;

    protected clock: IClock;

    constructor(ctx: LockServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async acquire(key: string, owner: string, ttlMs: number): Promise<number | undefined> {
        const current = await this.repository.findOneBy({ key });

        if (current) {
            if (current.expiresAt.getTime() > this.clock.now()) {
                return undefined;
            }

            const taken = await this.takeOver(key, owner, ttlMs);

            if (taken !== undefined) {
                return taken ?? undefined;
            }
        }

        for (;;) {
            try {
                return await this.repository.transaction(async (repository) => {
                    const token = await repository.nextToken();

                    await repository.save(repository.create({
                        id: uuidv7(),
                        key,
                        owner,
                        expiresAt: new Date(this.clock.now() + ttlMs),
                        token,
                    }));

                    return token;
                });
            } catch (error) {
                if (!(error instanceof EntityConflictError)) {
                    throw error;
                }
            }

            // the key is leased: in a new transaction, taken over only once that lease expired
            const taken = await this.takeOver(key, owner, ttlMs);

            if (taken !== undefined) {
                return taken ?? undefined;
            }

            // released or purged between the insert and the read: insert again
        }
    }

    async renew(key: string, owner: string, ttlMs: number): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const lock = await repository.findOneBy({ key });

            if (!lock) {
                return false;
            }

            // after the row lock: a takeover that just committed is compared with a fresh time
            const now = this.clock.now();

            if (lock.owner !== owner || lock.expiresAt.getTime() <= now) {
                return false;
            }

            repository.merge(lock, { expiresAt: new Date(now + ttlMs) });
            await repository.save(lock);

            return true;
        });
    }

    async release(key: string, owner: string): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const lock = await repository.findOneBy({ key });

            if (lock && lock.owner === owner) {
                await repository.remove(lock);
            }
        });
    }

    async holds(key: string, owner: string): Promise<boolean> {
        const lock = await this.repository.findOneBy({ key });

        return !!lock && lock.owner === owner && lock.expiresAt.getTime() > this.clock.now();
    }

    async purgeExpired(now: Date = new Date(this.clock.now())): Promise<number> {
        return this.repository.transaction((repository) => repository.removeExpiredBy(now));
    }

    /**
     * In one transaction: the lease of `key` read locked, then taken over
     * by `owner` with a new token if it expired. Resolves the token when
     * taken, null when the lease is unexpired, undefined when none is stored.
     */
    protected async takeOver(key: string, owner: string, ttlMs: number): Promise<number | null | undefined> {
        return this.repository.transaction(async (repository) => {
            // before the locked read, as on the insert path: a storage that locks its counter
            // takes it first in every transaction, so a takeover and an insert never wait on
            // each other in opposite orders; a token taken for a held lease is skipped
            let token = await repository.nextToken();
            const lock: Lock | null = await repository.findOneBy({ key });

            if (!lock) {
                return undefined;
            }

            const now = this.clock.now();

            if (lock.expiresAt.getTime() > now) {
                return null;
            }

            if (token <= lock.token) {
                // a counter that is not commit-ordered issued it before the stored lease committed:
                // one issued after the locked read is above it, so a later holder's token is higher
                token = await repository.nextToken();
            }

            if (token <= lock.token) {
                // a key's tokens only ever increase: a lower one would let the expired holder pass a fence again
                throw new InvalidRunStateError(`The lock "${key}" was not taken over: the issued token ${token} is not above the stored token ${lock.token}.`);
            }

            repository.merge(lock, {
                owner,
                expiresAt: new Date(now + ttlMs),
                token,
            });
            await repository.save(lock);

            return token;
        });
    }
}
