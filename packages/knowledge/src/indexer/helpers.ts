/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ILockService } from '@chamvi/core';
import { ErrorCode } from '@chamvi/core';
import { isObject } from 'smob';
import { CHUNKER_VERSION } from '../chunk/constants.ts';
import type { ResolvedKnowledgeCollection } from '../collection/types.ts';
import type { IKnowledgeService, KnowledgeFence, KnowledgeWriteOptions } from '../service/types.ts';
import type { KnowledgeCollection, KnowledgeDocument } from '../store/types.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';
import { KNOWLEDGE_LOCK_TTL_MS } from './constants.ts';
import type { KnowledgeIndexLock, KnowledgeWake, KnowledgeWakeReason } from './types.ts';

export function messageOf(error: unknown): string {
    return Error.isError(error) ? error.message : String(error);
}

/** Resolves after `ms` on the clock, or at once when `signal` aborts (the timer cleared). */
export function wait(clock: IClock, ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const done = () => {
            timer.clear();
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = clock.setTimeout(done, ms);

        timer.unref?.();

        signal.addEventListener('abort', done, { once: true });
    });
}

/**
 * The wake of one collection loop: a `notify()` ends the current `wait()`,
 * or, while nobody waits, is kept for the next one (any number coalesce to
 * one); `clear()` drops a kept one.
 */
export function createWake(): KnowledgeWake {
    let requested = false;
    let waiter: ((reason: KnowledgeWakeReason) => void) | undefined;

    return {
        notify() {
            if (waiter) {
                waiter('wake');

                return;
            }

            requested = true;
        },
        clear() {
            requested = false;
        },
        wait(clock: IClock, ms: number | undefined, signal: AbortSignal) {
            if (signal.aborted) {
                return Promise.resolve('abort');
            }

            if (requested) {
                requested = false;

                return Promise.resolve('wake');
            }

            return new Promise<KnowledgeWakeReason>((resolve) => {
                const onAbort = () => done('abort');
                const timer = ms === undefined ? undefined : clock.setTimeout(() => done('timeout'), ms);

                timer?.unref?.();

                const done = (reason: KnowledgeWakeReason) => {
                    waiter = undefined;
                    timer?.clear();
                    signal.removeEventListener('abort', onAbort);
                    resolve(reason);
                };

                waiter = done;
                signal.addEventListener('abort', onAbort, { once: true });
            });
        },
    };
}

/**
 * The lock a sync holds: `renew()` re-acquires it once half the TTL passed
 * since it was taken and answers false for good once another owner has it.
 */
export function createIndexLock(
    locks: Pick<ILockService, 'acquire' | 'release'>,
    key: string,
    owner: string,
    clock: IClock,
): KnowledgeIndexLock & { readonly lost: boolean } {
    let acquiredAt = clock.now();
    let lost = false;

    return {
        get lost() {
            return lost;
        },
        async renew() {
            if (lost) {
                return false;
            }

            const now = clock.now();

            if (now - acquiredAt < KNOWLEDGE_LOCK_TTL_MS / 2) {
                return true;
            }

            // owner-guarded: a no-op when the lease expired and another owner took it
            await locks.release(key, owner);

            if (await locks.acquire(key, owner, KNOWLEDGE_LOCK_TTL_MS)) {
                acquiredAt = now;

                return true;
            }

            lost = true;

            return false;
        },
    };
}

/** The write options of a pass under `lock`: its fence, once it has one. */
export function writeOptionsOf(lock: KnowledgeIndexLock): KnowledgeWriteOptions {
    return lock.fence === undefined ? {} : { fence: lock.fence };
}

/**
 * Advances the collection's fence and gives `lock` the new token (none for a
 * missing collection); answers it. Every caller renews the lock right after
 * and writes nothing when that fails: a holder stalled inside the advance
 * past its lease never uses the token it got over the current owner's.
 */
export async function advanceLockFence(
    service: Pick<IKnowledgeService, 'advanceFence'>,
    name: string,
    lock: KnowledgeIndexLock,
): Promise<KnowledgeFence | undefined> {
    const fence = await service.advanceFence(name);

    if (fence === undefined) {
        delete lock.fence;
    } else {
        lock.fence = fence;
    }

    return fence;
}

/** A write refused for a fence another owner advanced (LeaseLostError, by code across core copies). */
export function isLeaseLost(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.LEASE_LOST;
}

/** A write refused for a row deleted meanwhile (RepositoryNotFoundError, by code across core copies). */
export function isRepositoryNotFound(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.REPOSITORY_NOT_FOUND;
}

/** Whether the record serves the definition's model and chunker (nothing to re-embed). */
export function servesDefinition(record: KnowledgeCollection, definition: ResolvedKnowledgeCollection): boolean {
    return record.generation > 0 &&
        record.model === definition.model &&
        record.chunker === CHUNKER_VERSION;
}

/** Whether a stored document's chunks still carry the input's title and source. */
export function sameOrigin(stored: KnowledgeDocument, input: KnowledgeDocumentInput): boolean {
    return stored.title === input.title && stored.source === input.source;
}

/** Whether `value` is a plain object (`{}` or without a prototype), not a boxed primitive or a class instance. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isObject(value)) {
        return false;
    }

    const prototype: unknown = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

/**
 * The JSON of `value` with every plain object's keys sorted (arrays keep
 * their order, `toJSON` applies first, a boxed primitive stays its value).
 */
function canonicalJson(value: unknown): string | undefined {
    return JSON.stringify(value, (_key, item: unknown) => (isPlainObject(item) ?
        Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) :
        item));
}

/**
 * Whether a stored document needs no new record: same title, source and
 * metadata, key order aside (a jsonb column reads its keys back reordered).
 */
export function sameDetails(stored: KnowledgeDocument, input: KnowledgeDocumentInput): boolean {
    return sameOrigin(stored, input) &&
        canonicalJson(stored.metadata) === canonicalJson(input.metadata);
}

/** The record without a pending re-embed. */
export function withoutPending(record: KnowledgeCollection): KnowledgeCollection {
    const rest = { ...record };

    delete rest.pending;

    return rest;
}

/** The record without a pending re-embed, a stored error or a backoff. */
export function settled(record: KnowledgeCollection): KnowledgeCollection {
    const rest = withoutPending(record);

    delete rest.error;
    delete rest.failures;
    delete rest.retryAt;

    return rest;
}

/** The highest generation number the record ever gave out. */
export function highestGeneration(record: KnowledgeCollection): number {
    return Math.max(record.generation, record.pending?.generation ?? 0, record.lastGeneration ?? 0);
}
