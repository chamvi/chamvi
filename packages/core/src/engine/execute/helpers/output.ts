/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    FinishReason,
    LanguageModelResponseMetadata,
    LanguageModelUsage,
    ModelMessage,
    OutputInterface,
} from 'ai';
import type { Checkpoint } from '@chamvi/store';

/** Text of the last assistant message, '' when there is none. */
export function lastAssistantText(messages: ModelMessage[]): string {
    const last = messages.findLast((m) => m.role === 'assistant');

    if (!last) {
        return '';
    }

    if (typeof last.content === 'string') {
        return last.content;
    }

    return last.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

/**
 * The context `Output.parseCompleteOutput` gets for the final answer of an
 * earlier execution: its finish reason, zero usage, minimal response metadata.
 */
export function outputContext(checkpoint: Checkpoint, now: Date): {
    response: Omit<LanguageModelResponseMetadata, 'messages' | 'body'>;
    usage: LanguageModelUsage;
    finishReason: FinishReason;
} {
    return {
        response: {
            id: `checkpoint-${checkpoint.runId}-${checkpoint.stepIndex}`,
            timestamp: now,
            modelId: 'checkpoint',
        },
        usage: {
            inputTokens: 0,
            inputTokenDetails: {
                noCacheTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokens: 0,
            outputTokenDetails: {
                textTokens: 0,
                reasoningTokens: 0,
            },
            totalTokens: 0,
        },
        finishReason: (checkpoint.finishReason ?? 'other') as FinishReason,
    };
}

/**
 * `output` for the stream: parsePartialOutput hands back the accumulated text
 * instead of parsing it, so the AI SDK does not re-parse the whole answer on
 * every delta (nobody reads the partial output) and still publishes each delta
 * (a returned undefined would hold the deltas back until the text ends).
 * parseCompleteOutput and responseFormat are the agent's own.
 */
export function withoutPartialOutput(output: OutputInterface): OutputInterface {
    const copy: OutputInterface = Object.create(output);

    copy.parsePartialOutput = async ({ text }: { text: string }) => ({ partial: text });

    return copy;
}
