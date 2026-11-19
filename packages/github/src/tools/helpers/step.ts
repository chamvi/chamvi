/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelMessage, ToolExecutionOptions } from 'ai';
import { isObject } from 'smob';

function hasPart(message: ModelMessage, type: string, toolCallId: string): boolean {
    return Array.isArray(message.content) &&
        message.content.some((part: unknown) => isObject(part) && part.type === type && part.toolCallId === toolCallId);
}

/**
 * The model step a call belongs to. On the approval path the AI SDK passes
 * messages that already hold the requesting assistant message: the one
 * carrying a tool-call with `options.toolCallId` whose result is not among
 * the tool messages after it, so a provider that reuses call ids across
 * steps never points the call at an earlier step. Its step is the number of
 * assistant messages before it; without one (the normal path) all of them.
 */
export function stepOf(options: Pick<ToolExecutionOptions<unknown>, 'toolCallId' | 'messages'>): number {
    const { messages, toolCallId } = options;
    let step = 0;

    for (const [index, message] of messages.entries()) {
        if (message.role !== 'assistant') {
            continue;
        }

        if (hasPart(message, 'tool-call', toolCallId)) {
            let answered = false;

            for (let next = index + 1; next < messages.length && messages[next]!.role !== 'assistant'; next++) {
                if (messages[next]!.role === 'tool' && hasPart(messages[next]!, 'tool-result', toolCallId)) {
                    answered = true;
                }
            }

            if (!answered) {
                return step;
            }
        }

        step++;
    }

    return step;
}
