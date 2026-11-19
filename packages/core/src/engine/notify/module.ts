/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { InvalidRunStateError } from '../../errors/index.ts';
import { untilAborted } from '../../run/helpers.ts';
import type { NotifyContext, NotifyDelivery } from './types.ts';

/**
 * One attempt to send a notification once per key: the deadline (claimTtlMs)
 * starts before the store lock `notify:<key>` is taken with the same TTL, so
 * the attempt is aborted no later than the lock expires and no other replica
 * sends while it is inside `send`. Under the lock `pending()` re-reads
 * whether it is still due; then `send` (raced against the attempt's signal)
 * and `record`. An InvalidRunStateError (moved on meanwhile) ends the attempt
 * quietly, any other failure goes to `fail`; the lock is released after the
 * attempt (a release failure reaches onError). The store waits (`acquire`,
 * `pending`, `record`) are raced against the same signal; a lock granted after
 * the race was lost is released by an untracked continuation.
 */
export async function deliverOnce(ctx: NotifyContext, delivery: NotifyDelivery): Promise<void> {
    const lockKey = `notify:${delivery.key}`;
    const attempt = randomUUID();
    const deadline = new AbortController();
    const timer = ctx.clock.setTimeout(() => deadline.abort(delivery.timeout()), ctx.claimTtlMs);

    timer.unref?.();

    const signal = AbortSignal.any([delivery.signal, deadline.signal]);
    let acquired: number | undefined;

    try {
        const acquiring = ctx.lockService.acquire(lockKey, attempt, ctx.claimTtlMs);

        try {
            acquired = await untilAborted(acquiring, signal);
        } catch (error) {
            // The wait lost to the deadline or a drain: a lock the store grants later is released
            // by a continuation the delivery set does not track (idle() and drain() stay unchanged).
            acquiring.then(
                (token) => (token !== undefined ?
                    ctx.lockService.release(lockKey, attempt) :
                    undefined),
            ).catch((releaseError: unknown) => ctx.onError(releaseError, delivery.run));

            throw error;
        }

        if (acquired === undefined || !await untilAborted(delivery.pending(), signal)) {
            return;
        }

        signal.throwIfAborted();

        await untilAborted(delivery.send(signal), signal);
        await untilAborted(delivery.record(signal), signal);
    } catch (error) {
        if (!(error instanceof InvalidRunStateError)) {
            delivery.fail(error, signal);
        }
    } finally {
        timer.clear();

        if (acquired !== undefined) {
            await ctx.lockService.release(lockKey, attempt).catch((releaseError: unknown) => ctx.onError(releaseError, delivery.run));
        }
    }
}
