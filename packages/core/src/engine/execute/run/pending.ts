/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/store';
import { FatalToolError } from '../../../errors/index.ts';
import { untilAborted } from '../../../run/helpers.ts';
import { assertTrust } from '../../../trust/module.ts';
import {
    executePendingCall,
    toRunError,
    toToolResultPart,
    withToolResults,
} from '../helpers/index.ts';
import type { RunExecution } from './module.ts';
import type { PendingCallsOutcome } from './types.ts';

/**
 * Runs the pending calls in call order. After each finished call the
 * checkpoint (under its own index, replacing it) gets the call's result
 * before its tool step is appended, so a drain, crash or lost lease
 * after that call never runs it again. Stops before the next call once
 * the execution was aborted. Resolves `paused` when a call suspended
 * again (the results before it are kept), `failed` on a FatalToolError
 * result.
 */
async function runPendingCalls(execution: RunExecution): Promise<PendingCallsOutcome> {
    const { ctx, checkpoint } = execution;
    const { run, clock } = ctx;

    for (const call of execution.pending) {
        if (execution.signal.aborted) {
            return 'done';
        }

        const startedAt = new Date(clock.now());

        assertTrust(execution.runContext);

        const { tools } = execution;
        const result = await executePendingCall({
            call,
            tools,
            activeTools: execution.activeTools,
            toolsContext: execution.toolsContext,
            messages: execution.prompt,
            signal: execution.signal,
        });

        assertTrust(execution.runContext);

        if (execution.suspended.length > 0) {
            return 'paused';
        }

        const finishedAt = new Date(clock.now());

        execution.pendingWrite = (async () => {
            const part = await toToolResultPart(call, Object.hasOwn(tools, call.toolName) ? tools[call.toolName] : undefined, result);

            execution.initial = withToolResults(execution.initial, [part]);
            execution.prompt = withToolResults(execution.prompt, [part]);
            await execution.guarded(() => ctx.checkpointService.save({
                runId: run.id,
                stepIndex: checkpoint!.stepIndex,
                messages: execution.initial,
                ...(checkpoint!.finishReason !== undefined ? { finishReason: checkpoint!.finishReason } : {}),
                ...execution.checkpointConversation(),
                createdAt: finishedAt,
            }));
            await execution.append({
                kind: 'tool',
                name: call.toolName,
                input: call.input,
                ...('error' in result ? { error: toRunError(result.error) } : { output: result.output }),
                startedAt,
                finishedAt,
            });
        })();
        await execution.pendingWrite;

        if ('error' in result && result.error instanceof FatalToolError) {
            execution.fatal ??= { error: result.error };

            return 'failed';
        }
    }

    return 'done';
}

/**
 * Replays the calls a suspended approve() or waitForDispatch() left pending,
 * before any model call; settles or pauses the run when one failed, suspended
 * again or the execution was aborted. False once the run settled or paused.
 */
export async function replayPendingCalls(execution: RunExecution): Promise<boolean> {
    const {
        ctx,
        timeout,
        usage,
    } = execution;
    let outcome: PendingCallsOutcome;

    try {
        const work = runPendingCalls(execution);

        work.catch(() => {});
        outcome = await untilAborted(work, execution.signal);
    } catch (error) {
        execution.local.abort();
        timeout?.clear();

        // the write of a call that finished before the abort lands before the run settles, never after
        let settled: Promise<void>;

        do {
            settled = execution.pendingWrite;
            await settled.catch(() => {});
        } while (settled !== execution.pendingWrite);

        execution.abandoned = true;

        if (ctx.signal.aborted) {
            await ctx.finish({ status: RunStatus.CANCELLED, usage });
        } else if (timeout?.signal.aborted) {
            await ctx.finish({
                status: RunStatus.FAILED,
                usage,
                error: toRunError(timeout.signal.reason),
            });
        } else {
            await ctx.finish({
                status: RunStatus.FAILED,
                usage,
                error: toRunError(error),
            });
        }

        return false;
    }

    execution.replaying = false;

    if (outcome === 'done') {
        return true;
    }

    // the same bounded wait as after the model loop, before the abort ends the sends
    await untilAborted(execution.awaitJournal(), execution.signal).catch(() => {});

    // a cancel or the timeout during that wait settles the run, never a pause
    const timedOut = timeout?.signal.aborted === true ? { reason: timeout.signal.reason as unknown } : undefined;

    execution.local.abort();
    timeout?.clear();

    if (ctx.signal.aborted) {
        await ctx.finish({ status: RunStatus.CANCELLED, usage });
    } else if (timedOut) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(timedOut.reason),
        });
    } else if (outcome === 'failed' && execution.fatal) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(execution.fatal.error),
        });
    } else {
        await ctx.pause(execution.suspended[0]!, usage);
    }

    return false;
}
