/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { IKnowledgeService } from '../../service/types.ts';
import { KNOWLEDGE_RETRY_MAX_MS, KNOWLEDGE_RETRY_MS } from '../constants.ts';

/** The wait after the `failures`-th failure in a row: 5 s doubling, capped. */
export function backoffOf(failures: number): number {
    return Math.min(KNOWLEDGE_RETRY_MS * (2 ** Math.min(Math.max(failures - 1, 0), 30)), KNOWLEDGE_RETRY_MAX_MS);
}

/** How long until the stored backoff of the collection ends (0 when none). */
export async function retryDelayOf(service: IKnowledgeService, name: string, clock: IClock): Promise<number> {
    const record = await service.findOneCollection(name);
    const retryAt = record?.kind === 'declared' ? record.retryAt : undefined;

    if (!retryAt) {
        return 0;
    }

    // a clock skewed between replicas never parks the loop longer than the cap
    return Math.min(Math.max(retryAt.getTime() - clock.now(), 0), KNOWLEDGE_RETRY_MAX_MS);
}

/**
 * How long until a pass is due (0: now; undefined: only on a wake): at once
 * for a missing record (deleted elsewhere: rebuilt), an orphaned one (marked
 * by a replica that does not declare it: declared again) or one no pass
 * completed yet (a failed rebuild is retried, after its stored backoff), else, with
 * `idleMs`, that long after the stored `syncedAt`, the end of the last
 * successful pass on any replica.
 */
export async function dueDelayOf(
    service: IKnowledgeService,
    name: string,
    clock: IClock,
    idleMs: number | undefined,
): Promise<number | undefined> {
    const record = await service.findOneCollection(name);

    if (!record?.syncedAt || record.status === 'orphaned') {
        return 0;
    }

    if (idleMs === undefined) {
        return undefined;
    }

    // a clock skewed between replicas never parks the loop longer than the interval
    return Math.min(Math.max(idleMs - (clock.now() - record.syncedAt.getTime()), 0), idleMs);
}

/** The idle wait until a due pass (none: `undefined`) or the next record check, whichever comes first. */
export function idleWaitOf(dueIn: number | undefined, checkMs: number | undefined): number | undefined {
    if (dueIn === undefined) {
        return checkMs;
    }

    return checkMs === undefined ? dueIn : Math.min(dueIn, checkMs);
}
