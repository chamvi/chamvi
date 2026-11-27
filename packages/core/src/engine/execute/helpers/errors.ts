/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type { StepResult, ToolSet } from 'ai';
import { TypeValidationError } from 'ai';
import { isObject } from 'smob';
import { BudgetExceededError, IncompleteResponseError } from '../../../errors/index.ts';
import type { Budget } from '../../../run/types.ts';
import { TOOL_CONTEXT_MISSING } from '../../../tool/constants.ts';
import { MAX_ERROR_CAUSE_LENGTH } from '../constants.ts';

/**
 * The issues at the bottom of a validation error's cause chain: a Standard
 * Schema issue list, or the `issues` of an error such as a ZodError.
 */
function causeIssues(error: unknown): unknown[] {
    let cause = error;

    while (TypeValidationError.isInstance(cause)) {
        cause = cause.cause;
    }

    if (Array.isArray(cause)) {
        return cause;
    }

    if (isObject(cause) && Array.isArray(cause.issues)) {
        return cause.issues;
    }

    return [];
}

/** An issue's path as `a.b.0`, undefined at the root. */
function issuePath(issue: unknown): string | undefined {
    if (!isObject(issue) || !Array.isArray(issue.path) || issue.path.length === 0) {
        return undefined;
    }

    return issue.path.map((segment) => String(isObject(segment) ? segment.key : segment)).join('.');
}

/**
 * A ValidationError for a tool context the AI SDK refused. The SDK's own
 * message holds the whole value (a toolsContext entry may carry a secret) and
 * issue messages may echo it too, so only the tool name and the issue paths
 * are kept; chamvi's own missing-context issue keeps its message.
 */
function toolContextError(error: TypeValidationError): ValidationError {
    const prefix = `Type validation failed for tool context (${error.context?.entityName ?? 'unknown'}): `;
    const issues = causeIssues(error);

    const missingContext = issues.some((issue) => isObject(issue) && issue.message === TOOL_CONTEXT_MISSING);

    if (missingContext) {
        return new ValidationError(prefix + TOOL_CONTEXT_MISSING);
    }

    if (error.value === undefined) {
        return new ValidationError(`${prefix}the agent has no toolsContext entry for it, and its contextSchema requires one.`);
    }

    const paths = [...new Set(issues.map(issuePath).filter((path) => path !== undefined))];
    const at = paths.length > 0 ? ` (at ${paths.join(', ')})` : '';

    return new ValidationError(`${prefix}the agent's toolsContext entry does not match the tool's contextSchema${at}.`);
}

/**
 * `{ code, message }` of anything thrown; code falls back to 'Error'. A refused
 * tool context is recorded without its value.
 */
export function toRunError(error: unknown): { code: string; message: string } {
    if (TypeValidationError.isInstance(error) && error.context?.field === 'tool context') {
        return toRunError(toolContextError(error));
    }

    const code = isObject(error) ? error.code : undefined;

    return {
        code: typeof code === 'string' ? code : 'Error',
        message: Error.isError(error) ? error.message : String(error),
    };
}

export function budgetExceeded(budget: Budget, kind: 'steps' | 'tokens'): BudgetExceededError {
    return new BudgetExceededError(kind === 'steps' ?
        `The run reached its ${budget.maxSteps} step limit.` :
        `The run reached its ${budget.maxTokens} token limit.`);
}

/**
 * A structured output that failed to parse or validate, as a core ValidationError;
 * the cause (JSON parse or schema error) names the offending text or field, cut
 * to MAX_ERROR_CAUSE_LENGTH characters (the whole answer stays in the llm step).
 */
export function toValidationError(error: unknown): ValidationError {
    const message = Error.isError(error) ? error.message : String(error);
    let cause = isObject(error) && Error.isError(error.cause) ? error.cause.message : undefined;

    if (cause && cause.length > MAX_ERROR_CAUSE_LENGTH) {
        cause = `${cause.slice(0, MAX_ERROR_CAUSE_LENGTH)}…`;
    }

    return new ValidationError(cause ? `${message} ${cause}` : message);
}

/** Names of the step's tool calls that got neither a result nor an error. */
export function unansweredToolNames(step: StepResult<ToolSet> | undefined): string[] {
    if (!step) {
        return [];
    }

    const answered = new Set<string>();

    for (const part of step.content) {
        if (part.type === 'tool-result' || part.type === 'tool-error') {
            answered.add(part.toolCallId);
        }
    }

    return step.toolCalls.filter((call) => !answered.has(call.toolCallId)).map((call) => call.toolName);
}

/**
 * Why a structured output has no complete answer to parse, for a loop that
 * ended on `finishReason`: the answer was cut off ('length'), or the loop ended
 * on tool calls nothing executed ('tool-calls' without a budget stop, e.g. a
 * tool without `execute`). Undefined when the answer can be parsed.
 */
export function incompleteOutput(finishReason: string | undefined, toolNames: string[] = []): IncompleteResponseError | undefined {
    if (finishReason === 'length') {
        return new IncompleteResponseError(
            'The model answer was cut off at its output token limit (finish reason length), so there is no complete output to parse.',
        );
    }

    if (finishReason === 'tool-calls') {
        const names = toolNames.length > 0 ? toolNames.map((name) => `"${name}"`).join(', ') : 'a tool';

        return new IncompleteResponseError(
            `The model ended on a call to ${names} that nothing executed (a tool without execute), so there is no final answer to parse.`,
        );
    }

    return undefined;
}
