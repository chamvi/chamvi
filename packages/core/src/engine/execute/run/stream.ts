/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import type { StopCondition, ToolSet } from 'ai';
import { RunStatus } from '@chamvi/core-kit';
import { hydrateMessages } from '../../../artifact/helpers.ts';
import { untilAborted } from '../../../run/helpers.ts';
import { assertTrust } from '../../../trust/module.ts';
import { tokensExceeded } from '../../budget.ts';
import { toRunError, withoutPartialOutput } from '../helpers/index.ts';
import type { RunExecution } from './module.ts';
import type { ExecutionStreamResult } from './types.ts';

/** The tool loop of the execution: stops on the step budget, a fatal error, a suspended call or the token budget. */
function createExecutionLoop(execution: RunExecution) {
    const { ctx, budget } = execution;
    const { run, agent } = ctx;
    const stopWhen: StopCondition<ToolSet>[] = [
        isStepCount(execution.remainingSteps),
        () => execution.fatal !== undefined,
        // a call approve() or waitForDispatch() suspended ends the loop after its step
        () => execution.suspended.length > 0,
    ];
    const spentTokens = run.usage.inputTokens + run.usage.outputTokens;

    if (budget.maxTokens !== undefined) {
        stopWhen.push(tokensExceeded(budget.maxTokens, spentTokens));
    }

    return new ToolLoopAgent({
        model: execution.model,
        instructions: execution.configured.instructions,
        allowSystemInMessages: execution.configured.messages.some((message) => message.role === 'system'),
        tools: execution.tools,
        activeTools: execution.activeTools,
        // the AI SDK types toolsContext from a concrete tool set; a ToolSet infers none
        toolsContext: execution.toolsContext as never,
        stopWhen,
        // a tool result's artifact marker (artifactFilePart) gets its bytes per model call, never in a stored message
        prepareStep: async ({ messages }) => ({ messages: await hydrateMessages(messages, ctx.artifactService) }),
        onLanguageModelCallEnd: () => {
            execution.modelCallEnded = true;
        },
        onStepEnd: (step) => execution.onStepEnd(step),
        // the error is the run's, so the AI SDK's default console logging is muted
        onError: () => {},
        output: agent.definition.output ? withoutPartialOutput(agent.definition.output) : undefined,
    });
}

/** Streams the loop to its end, emitting text and reasoning deltas; the first stream error is thrown. */
async function readExecutionStream(
    execution: RunExecution,
    loop: ReturnType<typeof createExecutionLoop>,
): Promise<ExecutionStreamResult> {
    const { ctx } = execution;
    // stream steps seen so far; a step's deltas belong to the checkpoint index it is saved under
    const firstStepIndex = execution.stepIndex;
    let streamStep = -1;
    const stream = await loop.stream({ messages: execution.prompt, abortSignal: execution.signal });
    // the first stream error fails the run, as a rejected generate did
    let streamError: { error: unknown } | undefined;

    for await (const part of stream.fullStream) {
        assertTrust(execution.runContext);

        if (part.type === 'start-step') {
            streamStep++;
        } else if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
            if (!execution.abandoned) {
                ctx.onDelta({
                    runId: ctx.run.id,
                    step: firstStepIndex + Math.max(streamStep, 0),
                    kind: part.type === 'text-delta' ? 'text' : 'reasoning',
                    text: part.text,
                });
            }
        } else if (part.type === 'error') {
            streamError ??= { error: part.error };
        }
    }

    if (streamError) {
        throw streamError.error;
    }

    const [steps, finishReason, text] = await Promise.all([stream.steps, stream.finishReason, stream.text]);

    // Keep normal sends alive until their journal settles; cancellation still exits via untilAborted.
    await execution.awaitJournal();

    return {
        stream,
        steps,
        finishReason,
        text,
    };
}

/**
 * Builds the tool loop and consumes its stream; on an abort, a fatal error or
 * a stream error it settles the run once the step-end writes in flight
 * landed. The stream's result, or undefined once the run settled.
 */
export async function consumeExecutionStream(execution: RunExecution): Promise<ExecutionStreamResult | undefined> {
    const {
        ctx,
        timeout,
        usage,
    } = execution;
    const loop = createExecutionLoop(execution);

    try {
        const work = readExecutionStream(execution, loop);

        // the agent may keep running after an abort; never leak its rejection
        work.catch(() => {});

        return await untilAborted(work, execution.signal);
    } catch (error) {
        // stop the model work right away; the cause is read from ctx.signal, timeout and fatal
        execution.local.abort();

        // the step-end writes in flight land completely before the run settles, never after
        let settled: Promise<void>;

        do {
            settled = execution.pendingStepEnd;
            await settled;
        } while (settled !== execution.pendingStepEnd);

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
                error: toRunError(execution.fatal ? execution.fatal.error : error),
            });
        }

        return undefined;
    } finally {
        execution.local.abort();
        timeout?.clear();
    }
}
