/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunNotFoundError, findApprovalWaitBelow, pendingApprovalOf } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { ClockTimer, IEngine } from '@chamvi/core';
import type { Run } from '@chamvi/store';
import type { HttpContext } from '../../app/types.ts';
import type { WaitForRunOptions, WaitForRunResult } from '../types.ts';

const TERMINAL = new Set<string>([
    RunStatus.COMPLETED,
    RunStatus.FAILED,
    RunStatus.CANCELLED,
]);

/** Waits on an approval: its own, or a stand-in's pending at the peer (`pendingApprovalOf()`). */
function isApprovalWait(run: Run): boolean {
    return run.status === RunStatus.WAITING && pendingApprovalOf(run) !== undefined;
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
    const root = await engine.runService.findOne(runId);

    if (!root) {
        return undefined;
    }

    return isApprovalWait(root) ? root : findApprovalWaitBelow(engine.runService, root);
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
        let poll: ClockTimer | undefined;
        let timeout: ClockTimer | undefined;
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

            ctx.runService.findOne(runId).then(settle, reject);
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
            ctx.runService.findOne(runId)
                .then(inspect)
                .then((result) => {
                    if (!done) {
                        finish(result);
                    }
                }, fail);
        }

        async function check(): Promise<void> {
            try {
                const result = await inspect(await ctx.runService.findOne(runId));

                if (done || finish(result)) {
                    return;
                }

                poll = ctx.clock.setTimeout(() => {
                    void check();
                }, opts.pollMs);
                poll.unref?.();
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
        timeout.unref?.();
        void check();
    });
}
