/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelMessage, StepResult, ToolSet } from 'ai';
import { FatalToolError, IncompleteResponseError } from '../../../errors/index.ts';
import { assertTranscriptMessages } from '../../../message/helpers.ts';
import { assertTrust } from '../../../trust/module.ts';
import { stepTokens } from '../../budget.ts';
import { refusedCallError, toRunError, withoutResults } from '../helpers/index.ts';
import type { RunExecution } from './module.ts';

/**
 * Appends a finished model step (its llm step, then a tool step per call that
 * did not suspend), saves the checkpoint and the usage, and keeps a fatal
 * error or the first suspended wait of the step on the execution.
 */
export async function handleExecutionStepEnd(execution: RunExecution, step: StepResult<ToolSet>): Promise<void> {
    const { ctx } = execution;
    const { run, clock } = ctx;
    const complete = execution.modelCallEnded;

    execution.modelCallEnded = false;

    try {
        assertTrust(execution.runContext);
        assertTranscriptMessages(step.response.messages);

        const finishedAt = new Date(clock.now());
        const tokens = stepTokens(step);

        await execution.append({
            kind: 'llm',
            name: step.model.modelId,
            output: {
                text: step.text,
                toolCalls: step.toolCalls.map((call) => ({
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    input: call.input,
                })),
                finishReason: step.finishReason,
                usage: tokens,
            },
            startedAt: execution.stepStartedAt,
            finishedAt,
        });

        // the suspended calls stay pending: no tool step, no result in the checkpoint
        const { suspended } = execution;
        const suspendedIds = new Set(suspended.map((request) => request.toolCallId));

        for (const part of step.content) {
            if ((part.type === 'tool-result' || part.type === 'tool-error') && suspendedIds.has(part.toolCallId)) {
                continue;
            }

            if (part.type === 'tool-result') {
                await execution.append({
                    kind: 'tool',
                    name: part.toolName,
                    input: part.input,
                    output: part.output,
                    startedAt: execution.stepStartedAt,
                    finishedAt,
                });
            } else if (part.type === 'tool-error') {
                await execution.append({
                    kind: 'tool',
                    name: part.toolName,
                    input: part.input,
                    error: toRunError(refusedCallError(step, part, execution.tools, execution.activeTools) ?? part.error),
                    startedAt: execution.stepStartedAt,
                    finishedAt,
                });

                // other tool errors go back to the model as tool-error results
                if (part.error instanceof FatalToolError) {
                    execution.fatal ??= { error: part.error };
                }
            }
        }

        let { messages }: { messages: ModelMessage[] } = step.response;

        if (suspendedIds.size > 0) {
            messages = withoutResults(messages, suspendedIds);

            const order = step.toolCalls.map((c) => c.toolCallId);

            execution.paused = suspended
                .filter((request) => order.includes(request.toolCallId))
                .sort((a, b) => order.indexOf(a.toolCallId) - order.indexOf(b.toolCallId))[0] ?? suspended[0];
        }

        execution.responseMessages.push(...messages);
        await execution.guarded(() => ctx.checkpointService.save({
            runId: run.id,
            stepIndex: execution.stepIndex++,
            messages: [...execution.initial, ...execution.responseMessages],
            finishReason: step.finishReason,
            ...execution.checkpointConversation(),
            createdAt: finishedAt,
        }));

        const { usage } = execution;

        usage.inputTokens += tokens.inputTokens;
        usage.outputTokens += tokens.outputTokens;
        await execution.guarded(async () => {
            await ctx.update({ usage: { ...usage }, updatedAt: new Date(clock.now()) });
        }, { checkOwner: false });
        execution.stepStartedAt = new Date(clock.now());

        // an error part ends the step with 'error' and fails the run with that error
        if (!complete && step.finishReason === 'other') {
            execution.fatal ??= { error: new IncompleteResponseError('The model stream ended without a finish part.') };
        }
    } catch (error) {
        execution.fatal ??= { error };
    }
}
