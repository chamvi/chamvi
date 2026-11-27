/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/core-kit';
import type {
    PeerParent,
    RemoteApproval,
    RemoteWaitPoint,
    Run,
    RunStatusLiteral,
} from '@chamvi/core-kit';
import type { IRunService } from '../../../run/types.ts';

/** A `waiting` run's remote wait point (undefined for any other run). */
export function remoteWaitOf(run: Run | undefined): RemoteWaitPoint | undefined {
    return run?.status === RunStatus.WAITING && run.waiting?.kind === 'remote' ? run.waiting : undefined;
}

/** `waiting` without its wake mark. */
export function withoutRemoteWake(waiting: RemoteWaitPoint): RemoteWaitPoint {
    const rest = { ...waiting };

    delete rest.wakeRequested;

    return rest;
}

/** Whether `a` and `b` name the same remote approval (remote run and approval id). */
export function isSameRemoteApproval(
    a: Pick<RemoteApproval, 'runId' | 'approvalId'> | undefined,
    b: Pick<RemoteApproval, 'runId' | 'approvalId'> | undefined,
): boolean {
    if (!a || !b) {
        return a === b;
    }

    return a.runId === b.runId && a.approvalId === b.approvalId;
}

/**
 * The `remote` state of a wait point after a view of a remote run that has
 * not settled: its status and pending approval. A stored approval of the
 * same identity is kept as it is (its `notifiedAt`).
 */
export function nextRemoteState(
    stored: RemoteWaitPoint['remote'],
    status: RunStatusLiteral,
    approval: Omit<RemoteApproval, 'notifiedAt'> | undefined,
): NonNullable<RemoteWaitPoint['remote']> {
    const kept = approval && isSameRemoteApproval(stored?.approval, approval) ? stored?.approval : approval;

    return {
        status,
        ...(kept ? { approval: { ...kept } } : {}),
    };
}

/** The `peer` parent of a run a peer started (undefined for any other run). */
export function peerParentOf(run: Run): PeerParent | undefined {
    const { parent } = run.trigger;

    return parent?.kind === 'peer' ? parent : undefined;
}

/**
 * A write of stand-in `runId` conditional on it still waiting on wait point
 * `waitId` (under the row lock; updatedAt kept, it is the wait step's start).
 */
export function updateRemoteWait(
    runService: Pick<IRunService, 'updateWith'>,
    runId: string,
    waitId: string,
    derive: (stored: Run) => Partial<Run>,
): Promise<Run> {
    return runService.updateWith(runId, derive, {
        expectStatus: [RunStatus.WAITING],
        expectWaitId: waitId,
        keepUpdatedAt: true,
    });
}
