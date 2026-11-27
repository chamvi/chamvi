/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/core-kit';
import type { Run } from '@chamvi/core-kit';
import { InvalidRunStateError } from '../../errors/index.ts';
import { onRunSettled } from '../dispatch/module.ts';
import { agentCancelReason } from '../registry/helpers.ts';
import type { CancelReason } from '../registry/types.ts';
import type { EngineCancelContext, IEngineCancel } from './types.ts';

export class EngineCancel implements IEngineCancel {
    protected readonly ctx: EngineCancelContext;

    constructor(ctx: EngineCancelContext) {
        this.ctx = ctx;
    }

    async cancel(runId: string): Promise<void> {
        return this.ctx.cancelRun(runId);
    }

    /**
     * cancel() with a reason the run stores as its `error` (the registry's
     * `agent_replaced`/`agent_removed`); a run on another replica gets it with
     * `cancelRequested`, and the owner's settle keeps it.
     */
    async cancelRun(runId: string, reason?: CancelReason): Promise<void> {
        const execution = this.ctx.executions.get(runId);

        if (execution) {
            execution.stop ??= 'cancel';

            if (reason) {
                execution.cancelReason ??= reason;
            }

            execution.controller.abort();
            await execution.done;

            if (execution.stop === 'lease-lost') {
                throw new InvalidRunStateError(`Run "${runId}" lost its claim while being cancelled; it is no longer executing here.`);
            }

            // the abort cannot stop a pause that was already writing: cancel the run it left waiting
            const run = await this.ctx.runService.findOne(runId);

            if (run?.status === RunStatus.WAITING || run?.status === RunStatus.QUEUED) {
                await this.cancelStored(runId, [run.status], execution.cancelReason);
            }

            return;
        }

        for (let attempt = 0; ; attempt++) {
            const run = await this.ctx.runService.findOneOrFail(runId);

            const { status } = run;

            if (status !== RunStatus.QUEUED && status !== RunStatus.WAITING && status !== RunStatus.RUNNING && status !== RunStatus.INTERRUPTED) {
                throw new InvalidRunStateError(`Run "${runId}" is ${status}; it cannot be cancelled.`);
            }

            try {
                if (status === RunStatus.QUEUED || status === RunStatus.WAITING) {
                    await this.cancelStored(runId, [status], reason);
                } else {
                    const updated = await this.ctx.runService.update(runId, {
                        cancelRequested: true,
                        ...(reason && { error: reason }),
                        updatedAt: new Date(this.ctx.clock.now()),
                    }, { expectStatus: [status] });

                    this.ctx.emit({ type: 'run.updated', run: updated });
                }

                return;
            } catch (error) {
                // the run moved on since it was read (started, paused, settled): decide again
                if (!(error instanceof InvalidRunStateError) || attempt >= 2) {
                    throw error;
                }
            }
        }
    }

    /** Settles a run nobody executes (`expectStatus`) as cancelled, storing `reason` as its error. */
    async cancelStored(runId: string, expectStatus: Run['status'][], reason?: CancelReason): Promise<void> {
        await this.ctx.conversations?.idle(runId);

        const now = new Date(this.ctx.clock.now());
        const updated = await this.ctx.runService.update(
            runId,
            {
                status: RunStatus.CANCELLED,
                ...(reason && { error: reason }),
                waiting: undefined,
                finishedAt: now,
                updatedAt: now,
            },
            { expectStatus },
        );

        this.ctx.checkedRuns.delete(runId);
        this.ctx.emit({ type: 'run.updated', run: updated });
        await this.ctx.reconcileConversation(updated);
        this.ctx.remote?.cancelSettled(updated);
        this.ctx.peerReceiver?.onRunEvent(updated);
        await onRunSettled(this.ctx.dispatchContext(), updated);
    }

    /**
     * Cancels a run dispatch() just created for an agent object the registry
     * no longer holds. Never throws: the run is stored, so dispatch() returns
     * its id; a run settled meanwhile (a registry sweep) is left alone.
     */
    async cancelReplaced(runId: string, name: string): Promise<void> {
        try {
            await this.ctx.cancelRun(runId, agentCancelReason(name, 'replaced', this.ctx.agentRevision(name)));
        } catch (error) {
            if (!(error instanceof InvalidRunStateError)) {
                // the fence stays: admission cancels the run instead of starting it
                this.ctx.onError(error);

                return;
            }
        }

        this.ctx.checkedRuns.delete(runId);
    }
}
