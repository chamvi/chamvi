/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DISPATCH_DEPTH_MAX } from '../../dispatch/constants.ts';
import {
    isSettled,
    toExpiredRecord,
    toWaitRecord,
    waitRecordKey,
} from '../../dispatch/helpers.ts';
import type { DispatchWaitRecord } from '../../dispatch/types.ts';
import { ErrorCode, InvalidRunStateError } from '../../errors/index.ts';
import { RunStatus } from '../../run/constants.ts';
import type { DispatchWaitPoint, Run, Usage } from '../../run/types.ts';
import type { CancelReason } from '../registry/types.ts';
import type { DispatchEngineContext } from './types.ts';

/** The outcomes of every run `waiting` lists (one read), undefined while one has not settled. */
export async function settledOutcomes(
    ctx: DispatchEngineContext,
    waiting: DispatchWaitPoint,
): Promise<DispatchWaitRecord | undefined> {
    const { data } = await ctx.store.runs.find({ ids: [...new Set(waiting.runIds)] });

    return toWaitRecord(waiting.runIds, data);
}

/** A `waiting` run's dispatch wait point (undefined for any other run). */
function dispatchWaitOf(run: Run | undefined): DispatchWaitPoint | undefined {
    return run?.status === RunStatus.WAITING && run.waiting?.kind === 'dispatch' ? run.waiting : undefined;
}

/**
 * Recomputes `subtreeUsage` of run `runId` from its children (their usage
 * plus their own subtreeUsage), then of its parent and so on up the lineage
 * (at most DISPATCH_DEPTH_MAX hops). A recompute, never an increment, so a
 * repeated or healed call never counts a run twice. Patched without a status
 * guard and without touching updatedAt (the run's own writes go on).
 */
export async function recomputeSubtreeUsage(ctx: DispatchEngineContext, runId: string): Promise<void> {
    let next: string | undefined = runId;

    for (let hop = 0; next !== undefined && hop <= DISPATCH_DEPTH_MAX; hop++) {
        const { data } = await ctx.store.runs.find({ parentRunId: next });
        const subtreeUsage: Usage = { inputTokens: 0, outputTokens: 0 };

        for (const child of data) {
            subtreeUsage.inputTokens += child.usage.inputTokens + (child.subtreeUsage?.inputTokens ?? 0);
            subtreeUsage.outputTokens += child.usage.outputTokens + (child.subtreeUsage?.outputTokens ?? 0);
        }

        const updated: Run = await ctx.store.runs.update(next, { subtreeUsage });

        next = updated.parentRunId;
    }
}

/** resume() of `parent`'s dispatch wait with `record`; false when another answer won or the run moved on. */
async function resumeWait(
    ctx: DispatchEngineContext,
    parent: Run,
    waiting: DispatchWaitPoint,
    record: DispatchWaitRecord,
): Promise<boolean> {
    // exact at answer: a lost or racing push may have left it stale
    await recomputeSubtreeUsage(ctx, parent.id);

    try {
        await ctx.resume(
            parent,
            waiting.id,
            { key: waitRecordKey(parent.id, waiting.id), value: record },
            {
                name: waiting.toolName,
                input: { toolCallId: waiting.toolCallId, runIds: waiting.runIds },
                // bounded: the outputs reach the model through the call, not the step
                output: record.outcomes.map((outcome) => ({
                    runId: outcome.runId,
                    agent: outcome.agent,
                    role: outcome.role,
                    status: outcome.status,
                    ...(outcome.error ? { error: outcome.error } : {}),
                })),
            },
            () => new InvalidRunStateError(`Run "${parent.id}" moved on to another wait.`),
        );
    } catch (error) {
        // answered meanwhile (a push, a heal, another replica), or moved on
        if (error instanceof InvalidRunStateError) {
            return false;
        }

        throw error;
    }

    return true;
}

/**
 * Answers the dispatch wait of run `parentId` once every run it lists
 * settled: records the outcomes under `dispatch-wait:<runId>:<waitId>`,
 * appends the `wait` step (the outcomes without their output) and requeues
 * the run. True when this call answered; false while a listed run is
 * unsettled, for a run that waits on nothing or on an approval, and when
 * another answer won.
 */
export async function answerDispatchWait(ctx: DispatchEngineContext, parentId: string): Promise<boolean> {
    const parent = await ctx.store.runs.findOne(parentId);
    const waiting = dispatchWaitOf(parent);

    if (!parent || !waiting) {
        return false;
    }

    const record = await settledOutcomes(ctx, waiting);

    if (!record) {
        return false;
    }

    return resumeWait(ctx, parent, waiting, record);
}

/**
 * Ends the expired dispatch wait of `parent` (re-read: the listing may be
 * stale): cancels every listed unsettled run it dispatched itself (reason
 * `Timeout`), then answers it with the settled outcomes, `cancelled` for
 * those, `timeout` for runs another run owns (they keep running). True
 * when this call answered.
 */
export async function expireDispatchWait(ctx: DispatchEngineContext, parent: Run): Promise<boolean> {
    const run = await ctx.store.runs.findOne(parent.id);
    const waiting = dispatchWaitOf(run);

    if (!run || !waiting || waiting.expiresAt.getTime() > ctx.clock.now().getTime()) {
        return false;
    }

    // the wait point keeps no timeoutMs, and updatedAt moves with a re-pause: name the expiry
    const reason: CancelReason = {
        code: ErrorCode.TIMEOUT,
        message: `The dispatched run did not settle before the wait expired at ${waiting.expiresAt.toISOString()}.`,
    };
    const ids = [...new Set(waiting.runIds)];
    const { data } = await ctx.store.runs.find({ ids });

    for (const child of data) {
        if (child.parentRunId !== run.id || isSettled(child)) {
            continue;
        }

        await ctx.cancel(child.id, reason).catch((error: unknown) => {
            // settled meanwhile
            if (!(error instanceof InvalidRunStateError)) {
                ctx.onError(error, child);
            }
        });
    }

    // the cancels' pushes may have answered already (resumeWait then loses)
    const { data: after } = await ctx.store.runs.find({ ids });

    return resumeWait(ctx, run, waiting, toExpiredRecord(run.id, waiting.runIds, after, reason));
}

/**
 * tick()'s pass over the `waiting` runs: expires every dispatch wait past
 * its expiresAt and answers every other one whose runs all settled (one
 * batched read over all listed runs), covering a lost push, a run settled
 * on another replica and a deduplicated run another run owns. True when one
 * resumed. Errors go to onError per run.
 */
export async function healDispatchWaits(ctx: DispatchEngineContext, waiting: Run[], now: number): Promise<boolean> {
    let resumed = false;
    const open: Run[] = [];

    for (const run of waiting) {
        const point = dispatchWaitOf(run);

        if (!point) {
            continue;
        }

        if (point.expiresAt.getTime() > now) {
            open.push(run);

            continue;
        }

        try {
            resumed = await expireDispatchWait(ctx, run) || resumed;
        } catch (error) {
            ctx.onError(error, run);
        }
    }

    if (open.length === 0) {
        return resumed;
    }

    const ids = new Set(open.flatMap((run) => dispatchWaitOf(run)!.runIds));
    const { data } = await ctx.store.runs.find({ ids: [...ids] });

    for (const run of open) {
        if (!toWaitRecord(dispatchWaitOf(run)!.runIds, data)) {
            continue;
        }

        try {
            resumed = await answerDispatchWait(ctx, run.id) || resumed;
        } catch (error) {
            ctx.onError(error, run);
        }
    }

    return resumed;
}

/**
 * Cancels the unsettled runs `runId` dispatched itself (`parentRunId`;
 * awaited or not), each through the engine's cancel, so the cascade goes on
 * down from their own settle. A run another run owns is never reached.
 */
export async function cancelChildren(ctx: DispatchEngineContext, runId: string, reason?: CancelReason): Promise<void> {
    const { data } = await ctx.store.runs.find({
        parentRunId: runId,
        status: [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING, RunStatus.INTERRUPTED],
    });

    for (const child of data) {
        try {
            await ctx.cancel(child.id, reason);
        } catch (error) {
            // settled meanwhile
            if (!(error instanceof InvalidRunStateError)) {
                ctx.onError(error, child);
            }
        }
    }
}

/**
 * Called after every terminal write of a run (best effort, each part's
 * errors go to onError): recomputes the subtree usage up its lineage,
 * cancels its children when it was cancelled, then answers its parent's
 * dispatch wait when this was the last run it waited on.
 */
export async function onRunSettled(ctx: DispatchEngineContext, run: Run): Promise<void> {
    if (!isSettled(run)) {
        return;
    }

    const parts: Array<() => Promise<unknown>> = [];

    if (run.parentRunId !== undefined) {
        const { parentRunId } = run;

        parts.push(() => recomputeSubtreeUsage(ctx, parentRunId));
    }

    if (run.status === RunStatus.CANCELLED) {
        parts.push(() => cancelChildren(ctx, run.id));
    }

    if (run.parentRunId !== undefined) {
        const { parentRunId } = run;

        parts.push(() => answerDispatchWait(ctx, parentRunId));
    }

    for (const part of parts) {
        try {
            await part();
        } catch (error) {
            ctx.onError(error, run);
        }
    }
}
