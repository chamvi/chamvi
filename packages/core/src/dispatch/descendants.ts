/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/store';
import type { RemoteApproval, Run, RunStatusLiteral } from '@chamvi/store';
import type { IRunService } from '../run/types.ts';
import { DISPATCH_DEPTH_MAX } from './constants.ts';

/** Statuses of a run that may still reach an approval wait. */
const UNSETTLED: RunStatusLiteral[] = [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING, RunStatus.INTERRUPTED];

/**
 * The approval `run` waits on: its own approval wait point (no `url`, the
 * link is this app's), or the approval a remote wait point (a stand-in run)
 * last showed pending in its remote run or below it, without `notifiedAt`;
 * `undefined` for any other run.
 */
export function pendingApprovalOf(run: Run): Omit<RemoteApproval, 'notifiedAt'> | undefined {
    if (run.status !== RunStatus.WAITING) {
        return undefined;
    }

    if (run.waiting?.kind === 'approval') {
        return {
            runId: run.id,
            approvalId: run.waiting.approvalId,
            title: run.waiting.title,
        };
    }

    const approval = run.waiting?.kind === 'remote' ? run.waiting.remote?.approval : undefined;

    if (!approval) {
        return undefined;
    }

    return {
        runId: approval.runId,
        approvalId: approval.approvalId,
        title: approval.title,
        ...(approval.url !== undefined ? { url: approval.url } : {}),
    };
}

/**
 * The first unsettled run below `run` that waits on an approval (its own,
 * or a stand-in's remote approval: `pendingApprovalOf()`), or
 * `undefined`: breadth-first over the `parentRunId` children (one `find`
 * per level, by `parentRunIds`) and the runs a dispatch wait point of the
 * level names that were not found as children (a deduplicated run another
 * run dispatched too; one `find` by `ids`, skipped when there is none).
 * Each run once, at most `DISPATCH_DEPTH_MAX` levels, a settled run's
 * subtree skipped. `run` itself is never the answer.
 */
export async function findApprovalWaitBelow(runs: Pick<IRunService, 'find'>, run: Run): Promise<Run | undefined> {
    const visited = new Set([run.id]);
    let level = [run];

    for (let depth = 0; depth < DISPATCH_DEPTH_MAX && level.length > 0; depth++) {
        const next: Run[] = [];
        const take = (found: Run[]): Run | undefined => {
            for (const candidate of found) {
                if (visited.has(candidate.id)) {
                    continue;
                }

                if (pendingApprovalOf(candidate)) {
                    return candidate;
                }

                visited.add(candidate.id);
                next.push(candidate);
            }

            return undefined;
        };

        const { data: children } = await runs.find({ parentRunIds: level.map((r) => r.id), status: UNSETTLED });
        const child = take(children);

        if (child) {
            return child;
        }

        // after the children: a named run found as a child is not read again
        const named = [...new Set(level.flatMap((r) => (r.waiting?.kind === 'dispatch' ? r.waiting.runIds : []))).difference(visited)];

        if (named.length > 0) {
            const found = take((await runs.find({ ids: named, status: UNSETTLED })).data);

            if (found) {
                return found;
            }
        }

        level = next;
    }

    return undefined;
}
