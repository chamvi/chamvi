/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import { EntityConflictError } from '@chamvi/store';
import type { IIdempotencyRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import type { IIdempotencyService, IdempotencyClaim, IdempotencyServiceContext } from './types.ts';

/**
 * Idempotency keys over an `IIdempotencyRepository`: the first caller per
 * `(scope, key)` claims it for its run until the claim expires; a key
 * claimed at T with `ttlMs` expires at exactly `T + ttlMs`. The clock is
 * read after the locked read.
 */
export class IdempotencyService implements IIdempotencyService {
    protected repository: IIdempotencyRepository;

    protected clock: IClock;

    constructor(ctx: IdempotencyServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async claim(scope: string, key: string, runId: string, ttlMs: number): Promise<IdempotencyClaim> {
        const current = await this.repository.findOneBy({ scope, key });

        if (current) {
            if (current.expiresAt.getTime() > this.clock.now().getTime()) {
                return { created: false, runId: current.runId };
            }

            const claimed = await this.takeOver(scope, key, runId, ttlMs);

            if (claimed) {
                return claimed;
            }
        }

        for (;;) {
            try {
                await this.repository.transaction(async (repository) => {
                    await repository.save(repository.create({
                        id: uuidv7(),
                        scope,
                        key,
                        runId,
                        expiresAt: new Date(this.clock.now().getTime() + ttlMs),
                    }));
                });

                return { created: true, runId };
            } catch (error) {
                if (!(error instanceof EntityConflictError)) {
                    throw error;
                }
            }

            // the key is claimed: in a new transaction, taken over only once that claim expired
            const claimed = await this.takeOver(scope, key, runId, ttlMs);

            if (claimed) {
                return claimed;
            }

            // purged between the insert and the read: insert again
        }
    }

    async purgeExpired(now: Date = this.clock.now()): Promise<number> {
        return this.repository.transaction((repository) => repository.removeExpiredBy(now));
    }

    protected async takeOver(scope: string, key: string, runId: string, ttlMs: number): Promise<IdempotencyClaim | undefined> {
        return this.repository.transaction(async (repository) => {
            const stored = await repository.findOneBy({ scope, key });

            if (!stored) {
                return undefined;
            }

            const now = this.clock.now().getTime();

            if (stored.expiresAt.getTime() > now) {
                return { created: false, runId: stored.runId };
            }

            repository.merge(stored, { runId, expiresAt: new Date(now + ttlMs) });
            await repository.save(stored);

            return { created: true, runId };
        });
    }
}
