/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunNotFoundError, findApprovalWaitBelow, pendingApprovalOf } from '@chamvi/core';
import { RunStatus } from '@chamvi/core-kit';
import type { Invoker, PeerRunView, Run } from '@chamvi/core-kit';
import { isObject } from 'smob';
import type { HttpContext } from '../../app/types.ts';

/** Whether an unvalidated start body names a peer field (`peer` or `role`). */
export function hasPeerFields(data: unknown): boolean {
    return isObject(data) && (data.peer !== undefined || data.role !== undefined);
}

/**
 * A run the peer `peer` (authenticated as `invoker`) started: its trigger's
 * invoker has the invoker's id and kind, and its parent is a `peer` parent of
 * that peer. Any other run, and a missing one, is the same RunNotFoundError (404),
 * so a peer cannot probe run ids.
 */
export async function loadPeerRun(ctx: Pick<HttpContext, 'runService'>, invoker: Invoker, peer: string, id: string): Promise<Run> {
    const run = await ctx.runService.findOne(id);
    const starter = run?.trigger.invoker;
    const parent = run?.trigger.parent;

    if (!run || starter?.id !== invoker.id || starter.kind !== invoker.kind || parent?.kind !== 'peer' || parent.peer !== peer) {
        throw new RunNotFoundError(id);
    }

    return run;
}

/**
 * The peer view of `run`: its status, wait kind, output, error, whether it
 * is tainted, its usage plus its subtree usage, and the approval pending in
 * it or below it (`pendingApprovalOf()`, else `findApprovalWaitBelow()`). An approval of
 * this app (an approval wait point) gets this app's link
 * (`approvalUrl`); a remote one keeps the link its owner gave, if any.
 */
export async function toPeerRunView(
    ctx: Pick<HttpContext, 'runService'>,
    run: Run,
    approvalUrl: ((ref: { runId: string; approvalId: string }) => string | undefined) | undefined,
): Promise<PeerRunView> {
    const holder = pendingApprovalOf(run) ? run : await findApprovalWaitBelow(ctx.runService, run);
    const pending = holder ? pendingApprovalOf(holder) : undefined;
    let approval = pending;

    if (pending && pending.url === undefined && holder?.waiting?.kind === 'approval') {
        const url = approvalUrl?.({ runId: pending.runId, approvalId: pending.approvalId });

        approval = url !== undefined ? { ...pending, url } : pending;
    }

    return {
        id: run.id,
        status: run.status,
        ...(run.status === RunStatus.WAITING && run.waiting ? { waiting: run.waiting.kind } : {}),
        ...(approval ? { approval } : {}),
        ...(run.output !== undefined ? { output: run.output } : {}),
        ...(run.error ? { error: { code: run.error.code, message: run.error.message } } : {}),
        tainted: run.taint !== undefined,
        // the run's own usage plus its children's, so the caller's maxSubtreeTokens counts the whole remote tree
        usage: {
            inputTokens: run.usage.inputTokens + (run.subtreeUsage?.inputTokens ?? 0),
            outputTokens: run.usage.outputTokens + (run.subtreeUsage?.outputTokens ?? 0),
        },
    };
}
