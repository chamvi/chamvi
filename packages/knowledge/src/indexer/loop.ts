/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { KnowledgeErrorContext } from '../knowledge/types.ts';
import { lockKey } from '../service/helpers/index.ts';
import type { IKnowledgeService } from '../service/types.ts';
import { KNOWLEDGE_LOCK_TTL_MS, KNOWLEDGE_RETRY_MAX_MS, KNOWLEDGE_RETRY_MS } from './constants.ts';
import {
    backoffOf,
    claimLockFence,
    createIndexLock,
    dueDelayOf,
    idleWaitOf,
    isConfigurationError,
    isLeaseLost,
    messageOf,
    retryDelayOf,
    wait,
    writeOptionsOf,
} from './helpers/index.ts';
import type { CollectionLoopInput, KnowledgeIndexLock, KnowledgeWakeReason } from './types.ts';

/**
 * Stores a failure on the declared record (never on a managed one), only while
 * the lock is still this owner's (renewed, and the write fenced; a pass
 * without a fence claims it first, and with no record records nothing): a
 * lost lock leaves the record to its holder.
 * The failure count and the time of the next attempt go with it, so every
 * replica backs off together. Whether it was stored.
 */
async function recordErrorUnderLock(
    service: IKnowledgeService,
    name: string,
    error: unknown,
    clock: IClock,
    lock: KnowledgeIndexLock,
): Promise<boolean> {
    if (!await lock.renew()) {
        return false;
    }

    if (lock.fence === undefined) {
        // a pass that failed before it had a fence: never a write without one
        await claimLockFence(service, name, lock);

        if (lock.fence === undefined) {
            return false;
        }
    }

    const record = await service.findOneCollection(name);

    if (record?.kind !== 'declared') {
        return false;
    }

    const now = new Date(clock.now());
    const failures = (record.failures ?? 0) + 1;

    await service.saveCollection({
        ...record,
        error: messageOf(error),
        failures,
        retryAt: new Date(now.getTime() + backoffOf(failures)),
        updatedAt: now,
    }, writeOptionsOf(lock));

    return true;
}

/**
 * Keeps one collection current: runs `pass` under the store lock
 * `knowledge:<name>`, then idles until a wake (`wake.notify()`) or, with
 * `idleMs`, until that long after the last successful pass, and runs it
 * again. An interval pass is skipped while the stored `syncedAt` is younger
 * than `idleMs` (another replica ran it; checked again under the lock), so
 * replicas share one pass per interval; a wake always runs one. While
 * another owner holds the lock, waits `KNOWLEDGE_RETRY_MS` and tries again,
 * so this replica's own sources are synced once the lock is free (an
 * unchanged document embeds nothing). A failure is stored with the time of
 * the next attempt (still under the lock, so no replica's later sync is
 * overwritten) and reported; every replica waits for that time before it
 * takes the lock again (5 s doubling to `KNOWLEDGE_RETRY_MAX_MS` per failure
 * in a row, across replicas), except on its own first attempt, and a wake
 * meanwhile waits for it too. A configuration error
 * (InvalidAgentDefinitionError) is stored and reported once and ends the
 * loop. A failed lock acquire or store read is only reported and retried on
 * this loop's own backoff. Each pass first renews the lock (no pass when it
 * fails) and claims the collection's fence (`lock.fence`) with the lock's
 * token; a claim or write the fence refuses (`LeaseLostError`: another owner
 * took the lock) ends the pass like a lost lock: nothing reported or stored,
 * no backoff. With `checkMs`, an idle loop also reads its record that often:
 * a missing one (deleted on another replica), an orphaned one (marked by a
 * replica that does not declare it) or one no pass completed yet
 * runs a pass whatever `idleMs` says; a synced one costs that read only. Never rejects; an abort ends it.
 */
export async function runCollection(input: CollectionLoopInput): Promise<void> {
    const {
        name,
        service,
        locks,
        owner,
        clock,
        signal,
        wake,
        idleMs,
        checkMs,
    } = input;
    const key = lockKey(name);
    const context: KnowledgeErrorContext = { collection: name };
    const report = (error: unknown) => input.onError(error, context);
    // this loop's own backoff, for store failures that leave no stored retry time
    let delay = KNOWLEDGE_RETRY_MS;
    let first = true;
    // what started the next pass: only an interval one is skipped for a younger pass
    let reason: 'start' | Exclude<KnowledgeWakeReason, 'abort'> = 'start';
    const backOff = async () => {
        await wait(clock, delay, signal);
        delay = Math.min(delay * 2, KNOWLEDGE_RETRY_MAX_MS);
    };

    while (!signal.aborted) {
        const honourRetry = !first;
        let token: number | undefined;

        first = false;

        try {
            const dueIn = reason === 'timeout' ? await dueDelayOf(service, name, clock, idleMs) : 0;

            if (dueIn !== 0) {
                const woken = await wake.wait(clock, idleWaitOf(dueIn, checkMs), signal);

                if (woken === 'abort') {
                    return;
                }

                reason = woken;

                continue;
            }

            const retryIn = honourRetry ? await retryDelayOf(service, name, clock) : 0;

            if (retryIn > 0) {
                await wait(clock, retryIn, signal);

                if (signal.aborted) {
                    return;
                }
            }

            token = await locks.acquire(key, owner, KNOWLEDGE_LOCK_TTL_MS);
        } catch (error) {
            if (signal.aborted) {
                return;
            }

            report(error);
            await backOff();

            continue;
        }

        if (token !== undefined) {
            const lock = createIndexLock(locks, key, owner, clock, token);
            let failure: { error: unknown; stored: boolean } | undefined;
            // a claim or write refused for a fence another owner claimed: the lock is lost
            let fenced = false;
            let deferred = false;
            let dueIn: number | undefined = 0;

            try {
                // another replica may have failed between our wait and the acquire
                deferred = honourRetry && await retryDelayOf(service, name, clock) > 0;

                if (!deferred && reason === 'timeout') {
                    // or run this interval's pass
                    dueIn = await dueDelayOf(service, name, clock, idleMs);
                }

                // the reads above may have outlasted the lease: no pass once another owner may hold it
                if (!deferred && dueIn === 0 && await lock.renew()) {
                    // a wake from here on asks for one more pass
                    wake.clear();
                    // a newer holder's claim refuses this one (LeaseLostError): no pass then
                    await claimLockFence(service, name, lock);
                    await input.pass(lock, report);
                }
            } catch (error) {
                if (isLeaseLost(error)) {
                    fenced = true;
                } else {
                    failure = { error, stored: false };

                    if (!signal.aborted) {
                        failure.stored = await recordErrorUnderLock(service, name, error, clock, lock).catch((recordError: unknown) => {
                            if (!isLeaseLost(recordError)) {
                                report(recordError);
                            }

                            return false;
                        });
                    }
                }
            } finally {
                await locks.release(key, owner).catch(report);
            }

            if (signal.aborted) {
                return;
            }

            if (deferred) {
                continue;
            }

            if (failure) {
                report(failure.error);

                if (isConfigurationError(failure.error)) {
                    return;
                }

                if (!failure.stored) {
                    await backOff();
                }

                continue;
            }

            if (!lock.lost && !fenced) {
                delay = KNOWLEDGE_RETRY_MS;

                // a pass ran (dueIn 0): the next is an interval away
                const woken = await wake.wait(clock, idleWaitOf(dueIn === 0 ? idleMs : dueIn, checkMs), signal);

                if (woken === 'abort') {
                    return;
                }

                reason = woken;

                continue;
            }
        }

        // the holder may sync other sources than this replica's: wait for the
        // lock and sync ours (content hashes make an unchanged sync embed nothing)
        await wait(clock, KNOWLEDGE_RETRY_MS, signal);
    }
}
