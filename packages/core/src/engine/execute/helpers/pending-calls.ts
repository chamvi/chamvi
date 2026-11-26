/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type {
    JSONValue,
    ModelMessage,
    ToolResultPart,
    ToolSet,
} from 'ai';
import { TypeValidationError, asSchema } from 'ai';
import { isObject } from 'smob';
import { validateToolInput } from '../../../effect/helpers.ts';
import { ToolNotAllowedError } from '../../../errors/index.ts';
import type { PendingToolCall } from '../types.ts';

/**
 * The tool calls of the last assistant message in `messages` that have no
 * tool result (in any message): the calls a suspended approve() left
 * pending, in call order. Provider-executed calls are never pending.
 */
export function pendingToolCalls(messages: ModelMessage[]): PendingToolCall[] {
    const index = messages.findLastIndex((message) => message.role === 'assistant');
    const assistant = messages[index];

    if (!assistant || assistant.role !== 'assistant' || typeof assistant.content === 'string') {
        return [];
    }

    const answered = new Set<string>();

    for (const message of messages.slice(index)) {
        if (typeof message.content === 'string') {
            continue;
        }

        for (const part of message.content) {
            if (part.type === 'tool-result') {
                answered.add(part.toolCallId);
            }
        }
    }

    const pending: PendingToolCall[] = [];

    for (const part of assistant.content) {
        if (part.type !== 'tool-call' || part.providerExecuted || answered.has(part.toolCallId)) {
            continue;
        }

        pending.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
        });
    }

    return pending;
}

/**
 * Drops the tool results of `toolCallIds` (the suspended calls' placeholders)
 * from tool messages, and a tool message left empty; the calls stay in the
 * assistant message, pending.
 */
export function withoutResults(messages: ModelMessage[], toolCallIds: ReadonlySet<string>): ModelMessage[] {
    const out: ModelMessage[] = [];

    for (const message of messages) {
        if (message.role !== 'tool') {
            out.push(message);

            continue;
        }

        const content = message.content.filter((part) => !(part.type === 'tool-result' && toolCallIds.has(part.toolCallId)));

        if (content.length > 0) {
            out.push({ ...message, content });
        }
    }

    return out;
}

/** `messages` with `parts` added to their trailing tool message (a new one when they end otherwise). */
export function withToolResults(messages: ModelMessage[], parts: ToolResultPart[]): ModelMessage[] {
    if (parts.length === 0) {
        return messages;
    }

    const last = messages.at(-1);

    if (last?.role === 'tool') {
        return [...messages.slice(0, -1), { ...last, content: [...last.content, ...parts] }];
    }

    return [...messages, { role: 'tool', content: parts }];
}

/** The message of anything thrown, as the AI SDK words a tool error for the model. */
function errorMessage(error: unknown): string {
    if (error == null) {
        return 'unknown error';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (Error.isError(error)) {
        return error.message;
    }

    return JSON.stringify(error);
}

function toJsonValue(value: unknown): JSONValue {
    if (value === undefined) {
        return null;
    }

    const serialized = JSON.stringify(value);

    return serialized === undefined ? null : JSON.parse(serialized) as JSONValue;
}

/** The tool result the model sees for an output or error, as the AI SDK builds it. */
export async function toToolResultPart(
    call: PendingToolCall,
    tool: ToolSet[string] | undefined,
    outcome: { output: unknown } | { error: unknown },
): Promise<ToolResultPart> {
    let output: ToolResultPart['output'];

    if ('error' in outcome) {
        output = { type: 'error-text', value: errorMessage(outcome.error) };
    } else if (tool?.toModelOutput) {
        output = await tool.toModelOutput({
            toolCallId: call.toolCallId,
            input: call.input as never,
            output: outcome.output as never,
        });
    } else {
        output = typeof outcome.output === 'string' ?
            { type: 'text', value: outcome.output } :
            { type: 'json', value: toJsonValue(outcome.output) };
    }

    return {
        type: 'tool-result',
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output,
    };
}

/**
 * Runs a pending tool call outside the AI SDK, re-applying what the SDK
 * would: the toolPolicy (a refused call answers ToolNotAllowedError), the
 * input schema parse (a failure is a ValidationError result) and the
 * `contextSchema` check (a failure throws the SDK's TypeValidationError, which
 * fails the run); the wrapped tool runs the hooks and the effect logic.
 * Resolves the call's output or its tool error; a suspended call resolves the
 * placeholder (the caller reads the suspension from its `onSuspend`).
 */
export async function executePendingCall(input: {
    call: PendingToolCall;
    tools: ToolSet;
    activeTools?: string[];
    toolsContext: Record<string, unknown>;
    messages: ModelMessage[];
    signal: AbortSignal;
    /** How a validation error names the input, default `the pending call's input`. */
    inputLabel?: string;
}): Promise<{ output: unknown } | { error: unknown }> {
    const {
        call,
        tools,
        activeTools,
        toolsContext,
    } = input;
    const tool = Object.hasOwn(tools, call.toolName) ? tools[call.toolName] : undefined;

    if (!tool || typeof tool.execute !== 'function') {
        return { error: new ValidationError(`Tool "${call.toolName}" is not available any more.`) };
    }

    if (activeTools && !activeTools.includes(call.toolName)) {
        return { error: new ToolNotAllowedError(call.toolName) };
    }

    let parsed: unknown;

    try {
        parsed = await validateToolInput(call.toolName, tool.inputSchema, call.input, input.inputLabel ?? 'the pending call\'s input');
    } catch (error) {
        return { error };
    }

    let context = Object.hasOwn(toolsContext, call.toolName) ? toolsContext[call.toolName] : undefined;

    if (tool.contextSchema) {
        const { validate } = asSchema(tool.contextSchema);

        if (validate) {
            const result = await validate(context);

            if (!result.success) {
                throw new TypeValidationError({
                    value: context,
                    cause: result.error,
                    context: { field: 'tool context', entityName: call.toolName },
                });
            }

            context = result.value;
        }
    }

    try {
        let output: unknown = await (tool.execute as (input: unknown, options: unknown) => unknown)(parsed, {
            toolCallId: call.toolCallId,
            messages: input.messages,
            abortSignal: input.signal,
            context,
        });

        if (isObject(output) && Symbol.asyncIterator in output) {
            let last: unknown;

            for await (const chunk of output as AsyncIterable<unknown>) {
                last = chunk;
            }

            output = last;
        }

        return { output };
    } catch (error) {
        return { error };
    }
}
