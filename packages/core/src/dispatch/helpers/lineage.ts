/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import { DISPATCH_DEPTH_MAX } from '../constants.ts';
import type { DispatchHost } from '../types.ts';

/**
 * The stored run `runId` first, then its ancestors up `parentRunId` (at most
 * DISPATCH_DEPTH_MAX hops); stops at a run the store does not hold.
 */
export async function ancestorsOf(host: { runs: Pick<DispatchHost['runs'], 'findOne'> }, runId: string): Promise<Run[]> {
    const chain: Run[] = [];
    let next: string | undefined = runId;

    while (next !== undefined && chain.length <= DISPATCH_DEPTH_MAX) {
        const run = await host.runs.findOne(next);

        if (!run) {
            break;
        }

        chain.push(run);
        next = run.parentRunId;
    }

    return chain;
}
