/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isSettled, toWaitRecord, waitRecordKey } from '../../dispatch/helpers.ts';
import type { DispatchWaitRecord } from '../../dispatch/types.ts';
import { InvalidRunStateError } from '../../errors/index.ts';
import { RunStatus } from '../../run/constants.ts';
import type { DispatchWaitPoint, Run } from '../../run/types.ts';
import type { DispatchEngineContext } from './types.ts';

/** The outcomes of every run `waiting` lists (one read), undefined while one has not settled. */
export async function settledOutcomes(
    ctx: DispatchEngineContext,
    waiting: DispatchWaitPoint,
): Promise<DispatchWaitRecord | undefined> {
    const { data } = await ctx.store.runs.find({ ids: [...new Set(waiting.runIds)] });

    return toWaitRecord(waiting.runIds, data);
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

    if (parent?.status !== RunStatus.WAITING || parent.waiting?.kind !== 'dispatch') {
        return false;
    }

    const { waiting } = parent;
    const record = await settledOutcomes(ctx, waiting);

    if (!record) {
        return false;
    }

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
 * Called after every terminal write of a run (best effort, errors go to
 * onError): answers its parent's dispatch wait when this was the last run
 * it waited on.
 */
export async function onRunSettled(ctx: DispatchEngineContext, run: Run): Promise<void> {
    if (run.parentRunId === undefined || !isSettled(run)) {
        return;
    }

    try {
        await answerDispatchWait(ctx, run.parentRunId);
    } catch (error) {
        ctx.onError(error, run);
    }
}
