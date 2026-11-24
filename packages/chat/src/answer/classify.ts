/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Output, generateText, jsonSchema } from 'ai';
import { isObject } from 'smob';
import type { ChatAnswerClassifyInput, ChatAnswerDecision } from './types.ts';

const DECISIONS: readonly ChatAnswerDecision[] = ['approve', 'deny', 'unclear'];

const INSTRUCTIONS = 'You read a person\'s chat reply to an approval request and decide whether it approves, denies, or does neither. ' +
    'Answer approve only when the reply clearly agrees, deny when it clearly refuses or asks for a change, unclear otherwise. ' +
    'The reply may be in any language.';

const schema = jsonSchema<{ decision: ChatAnswerDecision }>({
    type: 'object',
    properties: { decision: { type: 'string', enum: [...DECISIONS] } },
    required: ['decision'],
    additionalProperties: false,
}, {
    validate: (value) => {
        if (isObject(value) && DECISIONS.includes(value.decision as ChatAnswerDecision)) {
            return { success: true, value: { decision: value.decision as ChatAnswerDecision } };
        }

        return { success: false, error: new Error('Invalid decision.') };
    },
});

/**
 * Reads a chat reply to an approval as approve, deny or unclear in one
 * tool-less model call that sees only the approval title and the reply.
 * Never throws: a model error, unparsable or invalid output, the caller's
 * abort or `timeoutMs` on the clock (which also aborts the call) is `unclear`.
 */
export async function classifyChatAnswer(input: ChatAnswerClassifyInput): Promise<ChatAnswerDecision> {
    if (input.signal.aborted) {
        return 'unclear';
    }

    const timeout = new AbortController();
    const signal = AbortSignal.any([input.signal, timeout.signal]);
    const timer = input.clock.setTimeout(() => timeout.abort(new Error('Classification timed out.')), input.timeoutMs);
    let release = () => {};

    // A provider that ignores its abort signal must not hold the answer open.
    const aborted = new Promise<ChatAnswerDecision>((resolve) => {
        const listener = () => resolve('unclear');

        signal.addEventListener('abort', listener, { once: true });
        release = () => signal.removeEventListener('abort', listener);
    });

    const decided = generateText({
        model: input.model,
        instructions: INSTRUCTIONS,
        prompt: `Approval request: ${input.title}\nReply: ${input.text}`,
        output: Output.object({ schema }),
        abortSignal: signal,
    })
        .then((result) => result.output.decision)
        .catch((): ChatAnswerDecision => 'unclear');

    try {
        return await Promise.race([decided, aborted]);
    } finally {
        timer.clear();
        release();
    }
}
