/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunService } from '@chamvi/core';
import type { RunStatusLiteral } from '@chamvi/store';
import type { OverlapPolicy } from '../subscription/types.ts';

const ACTIVE: RunStatusLiteral[] = ['queued', 'running', 'waiting', 'interrupted'];

/**
 * Whether the policy holds this tick back: `skip` while any run of the
 * subscription is active, `queue-one` while one of its runs is still queued,
 * `allow` never.
 */
export async function isOverlapping(
    store: Pick<RunService, 'find'>,
    agent: string,
    subscriptionId: string,
    policy: OverlapPolicy,
): Promise<boolean> {
    if (policy === 'allow') {
        return false;
    }

    const { data } = await store.find({
        agent,
        status: policy === 'skip' ? ACTIVE : ['queued'],
    });

    return data.some((run) => run.trigger.trigger === subscriptionId);
}
