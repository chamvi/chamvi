/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ChamviError,
    RunNotFoundError,
    RunStatus,
    findApprovalWaitBelow,
    rebaseJsonSchemaRefs,
} from '@chamvi/core';
import type { IEngine, Run } from '@chamvi/core';
import { isHTTPError } from '@ebec/http';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { isObject } from 'smob';
import type { HttpContext } from '../app/types.ts';
import type {
    McpRequestExtra,
    RunToolResult,
    WaitForRunOptions,
    WaitForRunResult,
} from './types.ts';

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
 * Runs a tool body: HTTP and core errors become `isError` results with
 * their message, anything else goes to `onError` and reads as
 * `Internal Server Error`.
 */
export async function runTool(ctx: HttpContext, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await fn();
    } catch (error) {
        if ((isHTTPError(error) && error.status < 500) || error instanceof ChamviError) {
            return toolError(error.message);
        }

        ctx.onError(error);

        return toolError('Internal Server Error');
    }
}

/** The principal and request signal the route put on `authInfo.extra`. */
export function readRequestExtra(extra: Record<string, unknown> | undefined): McpRequestExtra | undefined {
    if (!isObject(extra) || !isObject(extra.principal) || !(extra.signal instanceof AbortSignal)) {
        return undefined;
    }

    return extra as unknown as McpRequestExtra;
}

const TERMINAL = new Set<string>([
    RunStatus.COMPLETED,
    RunStatus.FAILED,
    RunStatus.CANCELLED,
]);

function isApprovalWait(run: Run): boolean {
    return run.status === RunStatus.WAITING && run.waiting?.kind === 'approval';
}

function isDispatchWait(run: Run): boolean {
    return run.status === RunStatus.WAITING && run.waiting?.kind === 'dispatch';
}

/**
 * Whether a `run_<agent>` wait is over: the run is terminal, or waits on a
 * human (an approval). A run waiting on its dispatched runs keeps the wait open.
 */
export function isWaitOver(run: Run): boolean {
    return TERMINAL.has(run.status) || isApprovalWait(run);
}

/**
 * The run itself when it waits on an approval, else the first unsettled
 * descendant that does (`findApprovalWaitBelow()`); `undefined` without one.
 */
export async function findWaitingApproval(engine: IEngine, runId: string): Promise<Run | undefined> {
    const root = await engine.store.runs.findOne(runId);

    if (!root) {
        return undefined;
    }

    return isApprovalWait(root) ? root : findApprovalWaitBelow(engine.store.runs, root);
}

/**
 * Resolves once the run is `completed`, `failed`, `cancelled` or `waiting`
 * on an approval, or waits on a dispatch while a descendant waits on an
 * approval (`approval`; seen through `run.updated` or a store poll every
 * `pollMs`, which covers runs executing on another replica), or with the
 * latest stored run when `timeoutMs` elapses or `signal` aborts. Rejects when
 * the store fails. Always unsubscribes and clears its timers.
 */
export function waitForRun(ctx: HttpContext, runId: string, opts: WaitForRunOptions): Promise<WaitForRunResult> {
    return new Promise<WaitForRunResult>((resolve, reject) => {
        let done = false;
        let poll: { clear(): void } | undefined;
        let timeout: { clear(): void } | undefined;
        let unsubscribe: (() => void) | undefined;
        const { signal } = opts;

        function stop(): boolean {
            if (done) {
                return false;
            }

            done = true;
            unsubscribe?.();
            poll?.clear();
            timeout?.clear();
            signal?.removeEventListener('abort', settleLatest);

            return true;
        }

        function settle(run: Run | undefined): void {
            if (run) {
                resolve({ run });
            } else {
                reject(new RunNotFoundError(runId));
            }
        }

        /** Timeout or abort: answer with whatever the store holds now. */
        function settleLatest(): void {
            if (!stop()) {
                return;
            }

            ctx.store.runs.findOne(runId).then(settle, reject);
        }

        /** The answer when the wait is over (`null`: the run is gone), else `undefined`. */
        async function inspect(run: Run | undefined): Promise<WaitForRunResult | null | undefined> {
            if (!run) {
                return null;
            }

            if (isWaitOver(run)) {
                return { run };
            }

            if (!isDispatchWait(run)) {
                return undefined;
            }

            const approval = await findWaitingApproval(ctx.engine, runId);

            return approval ? { run, approval } : undefined;
        }

        function finish(result: WaitForRunResult | null | undefined): boolean {
            if (result === undefined || !stop()) {
                return false;
            }

            if (result === null) {
                reject(new RunNotFoundError(runId));
            } else {
                resolve(result);
            }

            return true;
        }

        function fail(error: unknown): void {
            if (stop()) {
                reject(error);
            }
        }

        /** Checks on an event: no poll of its own. */
        function probe(): void {
            ctx.store.runs.findOne(runId)
                .then(inspect)
                .then((result) => {
                    if (!done) {
                        finish(result);
                    }
                }, fail);
        }

        async function check(): Promise<void> {
            try {
                const result = await inspect(await ctx.store.runs.findOne(runId));

                if (done || finish(result)) {
                    return;
                }

                poll = ctx.clock.setTimeout(() => {
                    void check();
                }, opts.pollMs);
            } catch (error) {
                fail(error);
            }
        }

        if (signal?.aborted) {
            settleLatest();

            return;
        }

        unsubscribe = ctx.engine.on('run.updated', (e) => {
            if (e.run.id === runId) {
                if (isWaitOver(e.run)) {
                    finish({ run: e.run });
                } else if (isDispatchWait(e.run)) {
                    probe();
                }

                return;
            }

            // a descendant (or any other run) pausing for an approval
            if (isApprovalWait(e.run)) {
                probe();
            }
        });
        signal?.addEventListener('abort', settleLatest, { once: true });
        timeout = ctx.clock.setTimeout(settleLatest, opts.timeoutMs);
        void check();
    });
}

/**
 * What `run_<agent>` answers for a run: `waiting` is the approval of
 * `approval` (a descendant) when given, else the run's own wait point.
 */
export function toRunToolResult(run: Run, deduplicated: boolean, approval?: Run): RunToolResult {
    const result: RunToolResult = {
        runId: run.id,
        status: run.status,
        deduplicated,
    };

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
    }

    return result;
}

type JsonSchemaCarrier = { '~standard': Partial<StandardJSONSchemaV1.Props> };

/**
 * The JSON Schema (draft-07, without `$schema`) of a Standard Schema's
 * input, for a tool's `payload`; `{}` (anything) without a schema, a
 * converter, or when conversion fails. `pointer` is where the schema sits in
 * the tool's input schema (e.g. `#/properties/payload`): local `$ref`s of a
 * recursive or reused schema are rewritten to resolve from there.
 */
export function toJsonSchema(schema: StandardSchemaV1 | undefined, pointer = '#'): Record<string, unknown> {
    const converter = (schema as JsonSchemaCarrier | undefined)?.['~standard'].jsonSchema;

    if (!converter) {
        return {};
    }

    try {
        const jsonSchema = { ...converter.input({ target: 'draft-07' }) };

        delete jsonSchema.$schema;

        return rebaseJsonSchemaRefs(jsonSchema, pointer) as Record<string, unknown>;
    } catch {
        return {};
    }
}
