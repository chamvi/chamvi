/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CodeRunContext } from '../../agent/types.ts';
import { SUSPENDED_RESULT } from '../../approval/constants.ts';
import { SuspendSignal } from '../../approval/request.ts';
import { assertFrameActive } from '../../effect/frame.ts';
import { ValidationError } from '../../errors/index.ts';
import { executePendingCall, toRunError } from './helpers.ts';
import type { CodeToolsOptions } from './types.ts';

/**
 * A code run's `ctx.tools`: one function per tool of the wrapped set. A call
 * takes its ordinal synchronously (`toolCallId` `run:<n>`, part of the ids of
 * the approvals inside it, so they replay), refuses a tool the set lacks or
 * the toolPolicy hides (ValidationError), validates the input against the
 * tool's input schema (ValidationError) and runs the wrapped tool as a model
 * call would (hooks, effects, trust); a streaming tool resolves to its last
 * value. The tool's error throws as is. Each call that ran appends a `tool`
 * step; a suspended one appends none and throws the SuspendSignal of the
 * request the wrapper copied onto the outer frame, so the run pauses
 * whatever run() does with it.
 */
export function createCodeTools(options: CodeToolsOptions): CodeRunContext['tools'] {
    const {
        agent,
        tools,
        activeTools,
        toolsContext,
        frame,
        signal,
        onStep,
        now,
    } = options;
    let ordinal = 0;
    const result: CodeRunContext['tools'] = {};

    // the set the model would be offered: a policy-hidden tool is absent
    for (const name of Object.keys(tools).filter((n) => !activeTools || activeTools.includes(n))) {
        result[name] = async (input: unknown) => {
            // run() left running after its execution ended applies no more tools
            assertFrameActive(frame, `Tool "${name}"`);

            const toolCallId = `run:${ordinal++}`;

            return call(name, toolCallId, input);
        };
    }

    async function call(toolName: string, toolCallId: string, input: unknown): Promise<unknown> {
        const startedAt = now();
        const outcome = await executePendingCall({
            call: {
                toolCallId, 
                toolName, 
                input, 
            },
            tools,
            activeTools,
            toolsContext,
            messages: [],
            signal,
            inputLabel: 'the input',
        });

        if (frame.suspended && ('error' in outcome || outcome.output === SUSPENDED_RESULT)) {
            throw new SuspendSignal(frame.suspended);
        }

        await onStep({
            name: toolName,
            input,
            ...('error' in outcome ? { error: toRunError(outcome.error) } : { output: outcome.output }),
            startedAt,
            finishedAt: now(),
        });

        if ('error' in outcome) {
            throw outcome.error;
        }

        return outcome.output;
    }

    // a name the set lacks or the policy hides: a function that refuses, not a TypeError
    return new Proxy(result, {
        get(target, property, receiver) {
            if (typeof property !== 'string' || Object.hasOwn(target, property) || property === 'then' || property === 'toJSON') {
                return Reflect.get(target, property, receiver);
            }

            return async () => {
                throw new ValidationError(`Tool "${property}" is not available to agent "${agent}".`);
            };
        },
    });
}
