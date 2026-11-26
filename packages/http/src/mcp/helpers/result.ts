/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isChamviError } from '@chamvi/errors';
import { pendingApprovalOf } from '@chamvi/core';
import type { Run } from '@chamvi/store';
import { isHTTPError } from '@ebec/http';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { isRetryableErrorCode, statusOfChamviError } from '../../app/helpers/errors.ts';
import type { HttpContext } from '../../app/types.ts';
import type { RunToolResult } from '../types.ts';

/** A tool result carrying `value` as JSON text and as structured content. */
export function toolResult(value: object): CallToolResult {
    // Dates and other toJSON values become what the wire carries
    const structured = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

    return {
        content: [{ type: 'text', text: JSON.stringify(structured) }],
        structuredContent: structured,
    };
}

export function toolError(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * A refusal the tool reports with its message: a chamvi error below 500,
 * unmapped or retryable, or an @ebec/http error below 500.
 */
function isToolRefusal(error: unknown): error is Error {
    if (isChamviError(error)) {
        const status = statusOfChamviError(error);

        return status === undefined || status < 500 || isRetryableErrorCode(error.code);
    }

    return isHTTPError(error) && error.status < 500;
}

/**
 * Runs a tool body: a refusal (`isToolRefusal`) becomes an `isError`
 * result with its message, anything else goes to `onError` and reads as
 * `Internal Server Error`.
 */
export async function runTool(ctx: HttpContext, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await fn();
    } catch (error) {
        if (isToolRefusal(error)) {
            return toolError(error.message);
        }

        ctx.onError(error);

        return toolError('Internal Server Error');
    }
}

/**
 * What `run_<agent>` answers for a run: `waiting` is the approval of
 * `approval` (a descendant) when given, else the run's own wait point.
 * Without `readable` (the principal may not read the run's or the approval
 * run's agent) only the run id, status and `deduplicated`.
 */
export function toRunToolResult(run: Run, deduplicated: boolean, readable: boolean, approval?: Run): RunToolResult {
    const result: RunToolResult = {
        runId: run.id,
        status: run.status,
        deduplicated,
    };

    if (!readable) {
        return result;
    }

    if (run.output !== undefined) {
        result.output = run.output;
    }

    if (run.error !== undefined) {
        result.error = run.error;
    }

    const waiter = approval ?? run;
    const { waiting } = waiter;

    if (waiting?.kind === 'approval') {
        result.waiting = {
            kind: 'approval',
            runId: waiter.id,
            agent: waiter.agent,
            toolName: waiting.toolName,
            title: waiting.title,
            ...(waiting.body !== undefined ? { body: waiting.body } : {}),
            ...(waiting.artifacts !== undefined ? { artifacts: waiting.artifacts } : {}),
            ...(waiting.options !== undefined ? { options: waiting.options } : {}),
            ...(waiting.multiple === true ? { multiple: true } : {}),
            expiresAt: waiting.expiresAt.toISOString(),
        };
    } else if (waiting?.kind === 'dispatch') {
        result.waiting = {
            kind: 'dispatch',
            toolName: waiting.toolName,
            runIds: [...waiting.runIds],
            expiresAt: waiting.expiresAt.toISOString(),
        };
    } else if (waiting?.kind === 'remote') {
        const approval = pendingApprovalOf(waiter);

        result.waiting = {
            kind: 'remote',
            runId: waiter.id,
            agent: waiter.agent,
            peer: waiting.peer,
            remoteAgent: waiting.agent,
            remoteRunId: waiting.remoteRunId,
            expiresAt: waiting.expiresAt.toISOString(),
            ...(approval ?
                {
                    approval: {
                        runId: approval.runId,
                        approvalId: approval.approvalId,
                        title: approval.title,
                        ...(approval.url !== undefined ? { url: approval.url } : {}),
                    },
                } :
                {}),
        };
    }

    return result;
}
