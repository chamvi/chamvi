/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { IClock } from '../clock/index.ts';
import { stableHash } from '../effect/helpers.ts';
import { InvalidRunStateError } from '../errors/index.ts';
import type { ILockService } from '../lock/types.ts';
import { LIMIT_KEY_MAX_LENGTH, LIMIT_LOCK_RETRY_MS, LIMIT_LOCK_TTL_MS } from './constants.ts';

const WINDOW_UNITS = [['h', 3_600_000], ['m', 60_000], ['s', 1_000]] as const;

/** The window of a limit as its messages name it: the largest of h, m, s dividing it evenly, else `<n>ms`. */
export function formatLimitWindow(windowMs: number): string {
    for (const [unit, size] of WINDOW_UNITS) {
        if (windowMs % size === 0) {
            return `${windowMs / size}${unit}`;
        }
    }

    return `${windowMs}ms`;
}

/** `<agent>:<name>`, or `<agent>:#<stableHash(name)>` when that is longer than the store column. */
export function limitScopeOf(agent: string, name: string): string {
    const scope = `${agent}:${name}`;

    return scope.length > LIMIT_KEY_MAX_LENGTH ? `${agent}:#${stableHash(name)}` : scope;
}

/** The use of one call within its scope: `<runId>:<stepIndex>:<stableHash(toolCallId)>`. */
export function limitKeyOf(runId: string, stepIndex: number, toolCallId: string): string {
    return `${runId}:${stepIndex}:${stableHash(toolCallId)}`;
}

function delayLimitLock(clock: IClock): Promise<void> {
    return new Promise((resolve) => {
        clock.setTimeout(resolve, LIMIT_LOCK_RETRY_MS).unref?.();
    });
}

async function holdLimitLock<T>(locks: ILockService, clock: IClock, scope: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const key = `limit:${scope}`;
    const owner = randomUUID();
    // a lease taken just before ours expires within the TTL: one more retry after it can take the lock
    const deadline = clock.now() + LIMIT_LOCK_TTL_MS + LIMIT_LOCK_RETRY_MS;

    while (await locks.acquire(key, owner, LIMIT_LOCK_TTL_MS) === undefined) {
        signal?.throwIfAborted();

        if (clock.now() >= deadline) {
            throw new InvalidRunStateError(`The limit lock of "${scope}" was not released within ${LIMIT_LOCK_TTL_MS}ms.`);
        }

        await delayLimitLock(clock);
    }

    try {
        return await fn();
    } finally {
        // a lease that failed to release expires after LIMIT_LOCK_TTL_MS
        await locks.release(key, owner).catch(() => undefined);
    }
}

/** The checks of a scope waiting in this process, per lock service: they take the store lock one after another. */
const queues = new WeakMap<ILockService, Map<string, Promise<void>>>();

/**
 * Runs `fn` under the store lock `limit:<scope>` (a random owner, TTL
 * LIMIT_LOCK_TTL_MS), retried every LIMIT_LOCK_RETRY_MS on the clock;
 * gives up after LIMIT_LOCK_TTL_MS + LIMIT_LOCK_RETRY_MS with InvalidRunStateError. Checks of one
 * scope in this process queue before the store lock, so parallel calls of
 * one step never wait on the clock for each other.
 */
export function withLimitLock<T>(locks: ILockService, clock: IClock, scope: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let local = queues.get(locks);

    if (!local) {
        local = new Map();
        queues.set(locks, local);
    }

    const map = local;
    const current = (map.get(scope) ?? Promise.resolve()).then(() => holdLimitLock(locks, clock, scope, fn, signal));
    const settled = current.then(() => undefined, () => undefined);

    map.set(scope, settled);
    void settled.then(() => {
        if (map.get(scope) === settled) {
            map.delete(scope);
        }
    });

    return current;
}

/** The effect key marking a call counted against its scope: `limit:<scope>:<key>`. */
export function limitMarkerKey(scope: string, key: string): string {
    return `limit:${scope}:${key}`;
}
