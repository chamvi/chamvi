/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/core-kit';
import {
    budgetExceeded,
    incompleteOutput,
    lastAssistantText,
    outputContext,
    toRunError,
    toValidationError,
    unansweredToolNames,
} from '../helpers/index.ts';
import type { RunExecution } from './module.ts';
import type { ExecutionStreamResult } from './types.ts';

/** Settles a run whose step budget is spent before this execution made a step. */
export async function settleStepLimit(execution: RunExecution): Promise<void> {
    const {
        ctx,
        checkpoint,
        budget,
    } = execution;
    const { agent, clock } = ctx;

    // the step limit was reached by an earlier execution that did not settle the run
    if (checkpoint && checkpoint.finishReason !== 'tool-calls') {
        const text = lastAssistantText(checkpoint.messages);
        const { output } = agent.definition;

        if (!output) {
            await ctx.finish({ status: RunStatus.COMPLETED, output: text });

            return;
        }

        const incomplete = incompleteOutput(checkpoint.finishReason);

        if (incomplete) {
            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(incomplete) });

            return;
        }

        try {
            const parsed: unknown = await output.parseCompleteOutput({ text }, outputContext(checkpoint, new Date(clock.now())));

            await ctx.finish({ status: RunStatus.COMPLETED, output: parsed });
        } catch (error) {
            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(toValidationError(error)) });
        }
    } else {
        await ctx.finish({ status: RunStatus.FAILED, error: toRunError(budgetExceeded(budget, 'steps')) });
    }
}

/** Settles (or pauses) the run once the model loop ended without an abort. */
export async function settleExecutionResult(execution: RunExecution, result: ExecutionStreamResult): Promise<void> {
    const {
        ctx,
        budget,
        usage,
    } = execution;
    const { agent } = ctx;

    if (execution.fatal) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(execution.fatal.error),
        });

        return;
    }

    if (ctx.signal.aborted) {
        await ctx.finish({ status: RunStatus.CANCELLED, usage });

        return;
    }

    if (execution.paused) {
        await ctx.pause(execution.paused, usage);

        return;
    }

    // the loop ended on a budget stop condition while the model still wanted tools
    const outOfSteps = result.steps.length >= execution.remainingSteps;
    const outOfTokens = budget.maxTokens !== undefined && usage.inputTokens + usage.outputTokens >= budget.maxTokens;

    if (result.finishReason === 'tool-calls' && (outOfSteps || outOfTokens)) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(budgetExceeded(budget, outOfSteps ? 'steps' : 'tokens')),
        });

        return;
    }

    // a plain agent keeps the text it got (cut, or before a call nothing executed)
    if (!agent.definition.output) {
        await ctx.finish({
            status: RunStatus.COMPLETED,
            usage,
            output: result.text,
        });

        return;
    }

    const incomplete = incompleteOutput(result.finishReason, unansweredToolNames(result.steps.at(-1)));

    if (incomplete) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(incomplete),
        });

        return;
    }

    let output: unknown;

    try {
        output = await result.stream.output;
    } catch (error) {
        await ctx.finish({
            status: RunStatus.FAILED,
            usage,
            error: toRunError(toValidationError(error)),
        });

        return;
    }

    await ctx.finish({
        status: RunStatus.COMPLETED,
        usage,
        output,
    });
}
