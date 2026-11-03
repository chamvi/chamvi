/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '../run/constants.ts';
import type { Run, RunStatusLiteral } from '../run/types.ts';
import type { IRunRepository } from '../repository/types.ts';
import { DISPATCH_DEPTH_MAX } from './constants.ts';

/** Statuses of a run that may still reach an approval wait. */
const UNSETTLED: RunStatusLiteral[] = [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING, RunStatus.INTERRUPTED];

function isApprovalWait(run: Run): boolean {
    return run.status === RunStatus.WAITING && run.waiting?.kind === 'approval';
}

/**
 * The first unsettled run below `run` that waits on an approval, or
 * `undefined`: breadth-first over the `parentRunId` children (one `find`
 * per level, by `parentRunIds`) and the runs a dispatch wait point of the
 * level names that were not found as children (a deduplicated run another
 * run dispatched too; one `find` by `ids`, skipped when there is none).
 * Each run once, at most `DISPATCH_DEPTH_MAX` levels, a settled run's
 * subtree skipped. `run` itself is never the answer.
 */
export async function findApprovalWaitBelow(store: Pick<IRunRepository, 'find'>, run: Run): Promise<Run | undefined> {
    const visited = new Set([run.id]);
    let level = [run];

    for (let depth = 0; depth < DISPATCH_DEPTH_MAX && level.length > 0; depth++) {
        const next: Run[] = [];
        const take = (found: Run[]): Run | undefined => {
            for (const candidate of found) {
                if (visited.has(candidate.id)) {
                    continue;
                }

                if (isApprovalWait(candidate)) {
                    return candidate;
                }

                visited.add(candidate.id);
                next.push(candidate);
            }

            return undefined;
        };

        const { data: children } = await store.find({ parentRunIds: level.map((r) => r.id), status: UNSETTLED });
        const child = take(children);

        if (child) {
            return child;
        }

        // after the children: a named run found as a child is not read again
        const named = [...new Set(level.flatMap((r) => (r.waiting?.kind === 'dispatch' ? r.waiting.runIds : [])))]
            .filter((id) => !visited.has(id));

        if (named.length > 0) {
            const found = take((await store.find({ ids: named, status: UNSETTLED })).data);

            if (found) {
                return found;
            }
        }

        level = next;
    }

    return undefined;
}
