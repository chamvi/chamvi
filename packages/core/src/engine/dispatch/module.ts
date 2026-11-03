/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DISPATCH_DEPTH_MAX } from '../../dispatch/constants.ts';
import {
    isSettled,
    sumSubtreeUsage,
    toExpiredRecord,
    toWaitRecord,
    waitRecordKey,
} from '../../dispatch/helpers.ts';
import type { DispatchWaitRecord } from '../../dispatch/types.ts';
import { ErrorCode, InvalidRunStateError } from '../../errors/index.ts';
import { RunStatus } from '../../run/constants.ts';
import type { DispatchWaitPoint, Run } from '../../run/types.ts';
import type { CancelReason } from '../registry/types.ts';
import type { DispatchEngineContext } from './types.ts';

const UNSETTLED: Run['status'][] = [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING, RunStatus.INTERRUPTED];

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

/** How often a recompute re-reads the children after its write before it lets a later settle converge it. */
const SUBTREE_RECHECKS = 3;

/** A child whose usage or subtreeUsage may still move: unsettled, or a settled one with descendants of its own. */
function isVolatile(child: Run): boolean {
    return !isSettled(child) || child.subtreeUsage !== undefined;
}

/**
 * Recomputes `subtreeUsage` of run `runId` from its children (their usage
 * plus their own subtreeUsage), then of its parent and so on up the lineage
 * (at most DISPATCH_DEPTH_MAX hops). A recompute, never an increment, so a
 * repeated or healed call never counts a run twice. After each write the
 * children that may still move (unsettled, or with descendants of their
 * own) are read again by id and the total rewritten when it changed (a
 * sibling's settle that interleaved), so the last write is never stale; a
 * read with none of them (a fan-out of leaves, all settled) skips the
 * re-check, which keeps a wide fan-out to one children read per settle.
 * Patched without a status guard and with `keepUpdatedAt` (the run's own
 * writes go on, and a wait step's start, taken from updatedAt, stays the
 * wait's start).
 */
export async function recomputeSubtreeUsage(ctx: DispatchEngineContext, runId: string): Promise<void> {
    let next: string | undefined = runId;

    for (let hop = 0; next !== undefined && hop <= DISPATCH_DEPTH_MAX; hop++) {
        const id: string = next;
        let children = (await ctx.store.runs.find({ parentRunId: id })).data;
        let subtreeUsage = sumSubtreeUsage(children);
        let updated: Run = await ctx.store.runs.update(id, { subtreeUsage }, { keepUpdatedAt: true });

        for (let check = 0; check < SUBTREE_RECHECKS; check++) {
            const volatile = children.filter((child) => isVolatile(child)).map((child) => child.id);

            if (volatile.length === 0) {
                break;
            }

            const fresh = new Map((await ctx.store.runs.find({ ids: volatile })).data.map((child) => [child.id, child]));

            children = children.map((child) => fresh.get(child.id) ?? child);

            const again = sumSubtreeUsage(children);

            if (again.inputTokens === subtreeUsage.inputTokens && again.outputTokens === subtreeUsage.outputTokens) {
                break;
            }

            subtreeUsage = again;
            updated = await ctx.store.runs.update(id, { subtreeUsage }, { keepUpdatedAt: true });
        }

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
 * `Timeout`; one with `cancelRequested` already is left to its owner), then
 * answers it with the settled outcomes, `cancelled` for those whose cancel
 * landed. While a run it dispatched only got `cancelRequested` (running on
 * another replica, or interrupted), the answer waits for the cancel to land
 * (that run's settle answers it), at most one claim TTL past expiresAt;
 * then, like a run another run owns (it keeps running), it is `timeout`.
 * True when this call answered.
 */
export async function expireDispatchWait(ctx: DispatchEngineContext, parent: Run): Promise<boolean> {
    const run = await ctx.store.runs.findOne(parent.id);
    const waiting = dispatchWaitOf(run);
    const now = ctx.clock.now().getTime();

    if (!run || !waiting || waiting.expiresAt.getTime() > now) {
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
        if (child.parentRunId !== run.id || isSettled(child) || child.cancelRequested) {
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
    const landing = after.some((child) => child.parentRunId === run.id && !isSettled(child));

    if (landing && now < waiting.expiresAt.getTime() + ctx.claimTtlMs) {
        return false;
    }

    return resumeWait(ctx, run, waiting, toExpiredRecord(waiting.runIds, after, reason));
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
    const { data } = await ctx.store.runs.find({ parentRunId: runId, status: UNSETTLED });

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
 * tick()'s heal of a lost cancel cascade (onRunSettled() is best effort):
 * cancels every unsettled run whose parent (`parentRunId`) is `cancelled`,
 * one listing of the unsettled runs with a parent (`hasParent`) and one
 * batched read of their parents. tick() skips it while no registered agent
 * declares an `agent.on()` role (no run can get a parent).
 * A run that got `cancelRequested` already is left to its owner. The
 * cascade goes on down from each cancel's own settle, or from the next tick.
 */
export async function healCancelCascade(ctx: DispatchEngineContext): Promise<void> {
    const { data } = await ctx.store.runs.find({ status: UNSETTLED, hasParent: true });
    const orphans = data.filter((run) => run.parentRunId !== undefined && !run.cancelRequested);

    if (orphans.length === 0) {
        return;
    }

    const { data: parents } = await ctx.store.runs.find({ ids: [...new Set(orphans.map((run) => run.parentRunId!))] });
    const cancelled = new Set(parents.filter((run) => run.status === RunStatus.CANCELLED).map((run) => run.id));

    for (const child of orphans) {
        if (!cancelled.has(child.parentRunId!)) {
            continue;
        }

        try {
            await ctx.cancel(child.id);
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
 * errors go to onError; tick() heals a lost cascade): recomputes the subtree usage up its lineage,
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
