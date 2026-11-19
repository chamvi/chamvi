/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ILockService } from '@chamvi/core';
import type { IKnowledgeService, KnowledgeFence, KnowledgeWriteOptions } from '../../service/types.ts';
import { KNOWLEDGE_LOCK_TTL_MS } from '../constants.ts';
import type { KnowledgeIndexLock } from '../types.ts';

/**
 * The lock a sync holds, acquired with `token`: `renew()` extends the lease
 * (keeping the token) once half the TTL passed since it was taken or last
 * renewed, and answers false for good once the lease is no longer this
 * owner's (expired or taken by another owner).
 */
export function createIndexLock(
    locks: Pick<ILockService, 'renew'>,
    key: string,
    owner: string,
    clock: IClock,
    token: number,
): KnowledgeIndexLock & { readonly lost: boolean } {
    let renewedAt = clock.now();
    let lost = false;

    return {
        token,
        get lost() {
            return lost;
        },
        async renew() {
            if (lost) {
                return false;
            }

            const now = clock.now();

            if (now - renewedAt < KNOWLEDGE_LOCK_TTL_MS / 2) {
                return true;
            }

            if (await locks.renew(key, owner, KNOWLEDGE_LOCK_TTL_MS)) {
                renewedAt = now;

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
 * Claims the collection's fence with the lock's token and gives `lock` the
 * fence (none for a missing collection); answers it. A newer holder's claim
 * is a `LeaseLostError`, so a holder stalled past its lease never takes the
 * fence back from the current owner.
 */
export async function claimLockFence(
    service: Pick<IKnowledgeService, 'claimFence'>,
    name: string,
    lock: KnowledgeIndexLock,
): Promise<KnowledgeFence | undefined> {
    const fence = await service.claimFence(name, lock.token);

    if (fence === undefined) {
        delete lock.fence;
    } else {
        lock.fence = fence;
    }

    return fence;
}
