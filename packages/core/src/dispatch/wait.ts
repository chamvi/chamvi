/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { APPROVAL_TIMEOUT_MAX_MS } from '../approval/constants.ts';
import { SuspendSignal } from '../approval/request.ts';
import type { DispatchResult } from '../channel/types.ts';
import { inject } from '../context/module.ts';
import { currentToolCall } from '../effect/frame.ts';
import type { DispatchWaitRequest } from '../engine/execute/types.ts';
import { InvalidRunStateError, ValidationError } from '../errors/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { markUntrusted } from '../trust/module.ts';
import { DEFAULT_DISPATCH_WAIT_TIMEOUT_MS, DISPATCH_CONTEXT } from './constants.ts';
import {
    readChildren,
    readWaitRecord,
    runSnapshotOf,
    toWaitRecord,
    waitRecordKey,
} from './helpers.ts';
import type { DispatchOutcome, DispatchWaitOptions, DispatchWaitRecord } from './types.ts';

function toRunId(value: unknown): string {
    const id = isObject(value) ? value.runId : value;

    if (typeof id !== 'string' || id.length === 0) {
        throw new ValidationError('waitForDispatch() takes run ids or dispatch results.');
    }

    return id;
}

function toTimeoutMs(options: unknown): number {
    if (options === undefined) {
        return DEFAULT_DISPATCH_WAIT_TIMEOUT_MS;
    }

    if (!isObject(options)) {
        throw new ValidationError('The dispatch wait options must be an object.');
    }

    const { timeoutMs } = options;

    if (timeoutMs === undefined) {
        return DEFAULT_DISPATCH_WAIT_TIMEOUT_MS;
    }

    if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > APPROVAL_TIMEOUT_MAX_MS) {
        throw new ValidationError(`A dispatch wait timeoutMs must be an integer from 1 to ${APPROVAL_TIMEOUT_MAX_MS}.`);
    }

    return timeoutMs;
}

/** The recorded outcomes, after the run's taint landed when a waited-on run was tainted. */
async function release(ctx: ToolContext<any>, record: DispatchWaitRecord): Promise<DispatchOutcome[]> {
    const [first] = record.tainted;

    if (first !== undefined) {
        await markUntrusted(ctx, `dispatch:${first}`);
    }

    return record.outcomes;
}

async function waitFor(ctx: ToolContext<any>, runs: unknown, options: unknown): Promise<DispatchOutcome[]> {
    const frame = currentToolCall();

    if (!frame) {
        throw new InvalidRunStateError('waitForDispatch() runs inside a tool call (its execute or the agent hooks), not in the tools factory.');
    }

    if (frame.streaming) {
        throw new InvalidRunStateError(`waitForDispatch() cannot run in the body of the streaming tool "${frame.toolName}".`);
    }

    // the engine's copy, never ctx.run itself: tool code can write to that
    const run = runSnapshotOf(ctx?.run);

    if (!run || run.runId !== frame.runId) {
        throw new InvalidRunStateError('waitForDispatch() got the context of another run than the tool call it runs in.');
    }

    const runIds = (Array.isArray(runs) ? runs : [runs]).map(toRunId);
    const timeoutMs = toTimeoutMs(options);

    if (runIds.length === 0) {
        return [];
    }

    // taken before any await, so the ordinals follow the order of the calls
    const ordinal = frame.waits ?? 0;

    frame.waits = ordinal + 1;

    const id = `${frame.stepIndex}:${frame.toolCallId}:w${ordinal}`;
    const host = inject(ctx, DISPATCH_CONTEXT);
    const unique = [...new Set(runIds)];
    const [{ data }, children] = await Promise.all([
        host.runs.find({ ids: unique }),
        host.effects.findOne(`dispatch-children:${run.runId}`),
    ]);
    const known = new Set(readChildren(children?.result));
    const found = new Map(data.map((r) => [r.id, r]));

    for (const runId of unique) {
        const child = found.get(runId);

        // dispatched by this run, or reached through its idempotency key (the record names it)
        if (!child || (child.parentRunId !== run.runId && !known.has(runId))) {
            throw new ValidationError(`Run ${runId} was not dispatched by run ${run.runId}.`);
        }
    }

    const key = waitRecordKey(run.runId, id);
    const recorded = await frame.effects.findOne(key);

    if (recorded) {
        return release(ctx, readWaitRecord(recorded.result));
    }

    const settled = toWaitRecord(runIds, data);

    if (settled) {
        await frame.effects.save(key, settled);

        return release(ctx, settled);
    }

    const request: DispatchWaitRequest = {
        kind: 'dispatch',
        id,
        toolName: frame.toolName,
        toolCallId: frame.toolCallId,
        runIds,
        timeoutMs,
    };

    // the first suspension of the call wins, also when the tool catches the signal
    frame.suspended ??= request;

    throw new SuspendSignal(request);
}

/**
 * Waits, from inside a tool call (its `execute` or the agent hooks), until
 * the runs this run dispatched (`dispatch()`, `dispatchTo()`; by id or
 * result) settled, and returns their outcomes: one run in, one outcome out;
 * a list in, the outcomes in its order (duplicates kept, `[]` for an empty
 * list). Runs that settled already resolve at once; otherwise the run
 * pauses `waiting` until the last of them settles (or `timeoutMs` passes,
 * default 24 h), the call then runs again from the start and this
 * waitForDispatch() returns the recorded outcomes. Code before it runs again
 * on resume. A tainted run taints this run before its outcome is returned.
 * Throws InvalidRunStateError outside a tool call and in a streaming tool's
 * body, ValidationError for a run this run did not dispatch or an invalid
 * timeout.
 */
export async function waitForDispatch<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    run: string | DispatchResult,
    options?: DispatchWaitOptions,
): Promise<DispatchOutcome>;
export async function waitForDispatch<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    runs: Array<string | DispatchResult>,
    options?: DispatchWaitOptions,
): Promise<DispatchOutcome[]>;
export async function waitForDispatch<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    runs: string | DispatchResult | Array<string | DispatchResult>,
    options?: DispatchWaitOptions,
): Promise<DispatchOutcome | DispatchOutcome[]> {
    const outcomes = await waitFor(ctx, runs, options);

    return Array.isArray(runs) ? outcomes : outcomes[0]!;
}
