/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/core-kit';
import type {
    ApprovalWaitPoint,
    Invoker,
    Run,
    Step,
    Usage,
} from '@chamvi/core-kit';
import { approvalDecisionKey, assertSelectionShape, toSelection } from '../../approval/helpers.ts';
import { declaresDispatchRole } from '../../dispatch/helpers/index.ts';
import { InvalidRunStateError } from '../../errors/index.ts';
import { toInvoker } from '../../trigger/helpers.ts';
import { APPROVAL_TIMED_OUT } from '../constants.ts';
import { answerDispatchWait, healCancelCascade, healDispatchWaits } from '../dispatch/module.ts';
import type { ResumeRecord, ResumeStep } from '../dispatch/types.ts';
import { isSameWaitPoint, toWaitPoint } from '../execute/helpers/index.ts';
import type { SuspendRequest } from '../execute/types.ts';
import type { ApprovalAnswer, WakeOutcome } from '../types.ts';
import { deliverApprovalMessage } from './delivery.ts';
import type { ApprovalDecisionInput, EngineApprovalsContext, IEngineApprovals } from './types.ts';

export class EngineApprovals implements IEngineApprovals {
    protected readonly ctx: EngineApprovalsContext;

    constructor(ctx: EngineApprovalsContext) {
        this.ctx = ctx;
    }

    async approve(runId: string, answer: ApprovalAnswer): Promise<void> {
        const decision: ApprovalDecisionInput = {
            approved: answer.approved,
            ...(answer.reason !== undefined ? { reason: answer.reason } : {}),
            ...(answer.approver !== undefined ? { approver: toInvoker(answer.approver, 'approver') } : {}),
        };

        assertSelectionShape(answer.selected);

        const run = await this.ctx.runService.findOneOrFail(runId);

        if (run.status === RunStatus.WAITING && run.waiting?.kind === 'dispatch') {
            throw new InvalidRunStateError(`Run "${run.id}" waits on dispatched runs, not on an approval.`);
        }

        if (run.status !== RunStatus.WAITING || run.waiting?.kind !== 'approval') {
            throw new InvalidRunStateError(`Run "${run.id}" is ${run.status} and not waiting for an approval.`);
        }

        if (run.waiting.approvalId !== answer.approvalId) {
            throw new InvalidRunStateError(`Run "${run.id}" does not wait on approval "${answer.approvalId}".`);
        }

        if (this.ctx.clock.now() >= run.waiting.expiresAt.getTime()) {
            throw new InvalidRunStateError(`Approval "${answer.approvalId}" of run "${run.id}" expired.`);
        }

        const selected = toSelection(run.waiting, answer.approved, answer.selected);

        await this.answer(
            run,
            run.waiting,
            { ...decision, ...(selected !== undefined ? { selected } : {}) },
            () => new InvalidRunStateError(`Run "${run.id}" moved on to another approval.`),
        );
    }

    async wake(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined> {
        return this.ctx.remote?.wake(runId, invoker);
    }

    async tick(): Promise<void> {
        const now = this.ctx.clock.now();
        let resumed = false;
        const { data } = await this.ctx.runService.find({ status: [RunStatus.WAITING] });

        for (const listed of data) {
            // a dispatch wait is neither delivered nor denied here
            if (listed.waiting?.kind !== 'approval') {
                continue;
            }

            if (listed.waiting.expiresAt.getTime() > now) {
                if (!listed.waiting.notifiedAt) {
                    await this.deliverApproval(listed, listed.waiting);
                }

                continue;
            }

            try {
                // the listing may be stale by now: the run could wait on a newer approval
                const run = await this.ctx.runService.findOne(listed.id);

                if (run?.status !== RunStatus.WAITING || run.waiting?.kind !== 'approval' ||
                    run.waiting.expiresAt.getTime() > now) {
                    continue;
                }

                await this.answer(
                    run,
                    run.waiting,
                    { approved: false, reason: APPROVAL_TIMED_OUT },
                    () => new InvalidRunStateError(`Run "${run.id}" moved on to another approval.`),
                );
                resumed = true;
            } catch (error) {
                // answered meanwhile (approve, another replica)
                if (!(error instanceof InvalidRunStateError)) {
                    this.ctx.onError(error, listed);
                }
            }
        }

        // a dispatch wait is never delivered or denied: answered once its runs settled, or expired
        if (await healDispatchWaits(this.ctx.dispatchContext(), data, now)) {
            resumed = true;
        }

        // a remote wait is polled detached (never awaited here), or timed out
        if (this.ctx.remote && await this.ctx.remote.pollWaits(data, now)) {
            resumed = true;
        }

        // a cancel cascade lost to a failure (onRunSettled is best effort); no role, no parent
        const hasRoles = this.ctx.engine.listAgents().some((agent) => declaresDispatchRole(agent));

        if (hasRoles) {
            await healCancelCascade(this.ctx.dispatchContext()).catch((error: unknown) => this.ctx.onError(error));
        }

        // A one-shot job may drain next; finish admission of resumed approvals first.
        if (resumed && this.ctx.isStarted()) {
            await this.ctx.pump();
        }
    }

    /**
     * Answers the approval `waiting` with `decision`: resume() records it under
     * `approval:<runId>:<approvalId>` (where the suspended approve() finds it
     * when its call runs again) and appends the `wait` step.
     */
    async answer(
        run: Run,
        waiting: ApprovalWaitPoint,
        decision: ApprovalDecisionInput,
        stale: () => Error,
    ): Promise<void> {
        await this.resume(
            run,
            waiting.approvalId,
            {
                key: approvalDecisionKey(run.id, waiting.approvalId),
                value: {
                    approved: decision.approved,
                    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
                    ...(decision.approver ? { approver: decision.approver } : {}),
                    ...(decision.selected !== undefined ? { selected: decision.selected } : {}),
                },
            },
            {
                name: waiting.toolName,
                input: {
                    toolCallId: waiting.toolCallId,
                    title: waiting.title,
                    ...(waiting.body !== undefined ? { body: waiting.body } : {}),
                    ...(waiting.artifacts !== undefined ? { artifacts: waiting.artifacts } : {}),
                    ...(waiting.options !== undefined ? { options: waiting.options } : {}),
                    ...(waiting.multiple === true ? { multiple: true } : {}),
                },
                output: {
                    approvalId: waiting.approvalId,
                    approved: decision.approved,
                    reason: decision.reason,
                    ...(decision.approver ? { approver: decision.approver } : {}),
                    ...(decision.selected !== undefined ? { selected: decision.selected } : {}),
                },
            },
            stale,
        );
    }

    /**
     * waiting → queued for the wait point `waitId` (an approval or a dispatch
     * wait), then `record` is stored (where the suspended call finds it when
     * it runs again) and the `wait` step appended. The transition comes first
     * and is guarded by status and wait id, so only one answer ever records;
     * the run stays claimed by us until the record landed, so no pass
     * executes it before.
     *
     * `waiting` survives the transition and is cleared only after the record
     * landed: if we die in between, the run re-pauses on the same wait point, so
     * the wait stays answerable.
     */
    async resume(
        run: Run,
        waitId: string,
        record: ResumeRecord,
        step: ResumeStep,
        stale: () => Error,
    ): Promise<void> {
        const { runService, clock } = this.ctx;
        const now = new Date(clock.now());
        const transitioned = await runService.update(run.id, {
            status: RunStatus.QUEUED,
            claim: { owner: this.ctx.owner, expiresAt: new Date(now.getTime() + this.ctx.claimTtlMs) },
            updatedAt: now,
        }, { expectStatus: [RunStatus.WAITING], expectWaitId: waitId });

        // the later writes hold only while the run is still ours and on this wait point
        const ours = {
            expectStatus: [RunStatus.QUEUED],
            expectOwner: this.ctx.owner,
            expectWaitId: waitId,
        };
        let queued: Run;

        try {
            // the run may have moved on to another wait since `waiting` was read
            if (!isSameWaitPoint(transitioned.waiting, waitId)) {
                throw stale();
            }

            // a stall since the transition may have lost the run (a replica re-paused it on this
            // wait and recorded another answer): renew our claim, guarded, before the upsert lands
            await runService.update(run.id, { claim: { owner: this.ctx.owner, expiresAt: new Date(clock.now() + this.ctx.claimTtlMs) } }, ours);
            await this.ctx.effectService.save(record.key, record.value);

            const appended: Step = {
                runId: run.id,
                index: (await this.ctx.stepService.find(run.id)).length,
                kind: 'wait',
                name: step.name,
                input: step.input,
                output: step.output,
                startedAt: run.updatedAt,
                finishedAt: now,
            };

            await this.ctx.stepService.create(appended);
            this.ctx.emit({ type: 'step.appended', step: appended });
            queued = await runService.update(run.id, {
                waiting: undefined,
                claim: undefined,
                updatedAt: new Date(clock.now()),
            }, ours);
        } catch (error) {
            // undo, so the wait point (still on the run) stays answerable; a run taken over meanwhile is left alone
            await runService.update(run.id, {
                status: RunStatus.WAITING,
                claim: undefined,
                updatedAt: new Date(clock.now()),
            }, ours).catch((undoError: unknown) => {
                if (!(undoError instanceof InvalidRunStateError)) {
                    this.ctx.onError(undoError, run);
                }
            });

            throw error;
        }

        this.ctx.emit({ type: 'run.updated', run: queued });

        if (this.ctx.isStarted()) {
            void this.ctx.pump();
        }
    }

    /**
     * running → waiting on `request`, releasing claim and slot (a keyed run keeps
     * its key blocked while waiting). Re-pausing on the same wait keeps the
     * wait point, so tokens handed out earlier stay valid. An approval is then
     * delivered; a dispatch wait is answered right away when its runs settled
     * before the write landed (their push found no wait point yet).
     */
    async pause(run: Run, request: SuspendRequest, usage: Usage): Promise<void> {
        await this.ctx.conversations?.idle(run.id);

        const now = new Date(this.ctx.clock.now());
        const waiting = isSameWaitPoint(run.waiting, request.kind === 'approval' ? request.approvalId : request.id) &&
            run.waiting?.kind === request.kind ?
            run.waiting :
            toWaitPoint(request, now);
        const updated = await this.ctx.ownedUpdate(run.id, {
            status: RunStatus.WAITING,
            waiting,
            usage,
            claim: undefined,
            updatedAt: now,
        });

        if (!updated) {
            return;
        }

        this.ctx.emit({ type: 'run.updated', run: updated });

        // a cancel arrived while pausing (an abort cannot interrupt this write): settle, do not deliver
        const execution = this.ctx.executions.get(run.id);

        if (updated.cancelRequested || execution?.stop === 'cancel') {
            await this.ctx.cancelStored(run.id, [RunStatus.WAITING], execution?.cancelReason).catch((error: unknown) => {
                if (!(error instanceof InvalidRunStateError)) {
                    this.ctx.onError(error, run);
                }
            });

            return;
        }

        if (waiting.kind === 'dispatch') {
            await answerDispatchWait(this.ctx.dispatchContext(), run.id).catch((error: unknown) => this.ctx.onError(error, updated));

            return;
        }

        if (waiting.kind !== 'approval') {
            return;
        }

        // also on a pause on an approval delivered before: the peer side dedupes its notification
        this.ctx.peerReceiver?.onRunEvent(updated);

        if (waiting.notifiedAt) {
            return;
        }

        // detached: the execution ends with the waiting write, so a resume
        // during a slow send starts the next execution cleanly
        const { deliveries } = this.ctx;
        const delivery: Promise<void> = this.deliverApproval(updated, waiting)
            .catch((error: unknown) => this.ctx.onError(error, updated))
            .finally(() => deliveries.delete(delivery));

        deliveries.add(delivery);
    }

    /** Sends the approval message of `waiting` once (see deliverApprovalMessage()). */
    deliverApproval(run: Run, waiting: ApprovalWaitPoint): Promise<void> {
        return deliverApprovalMessage(this.ctx, run, waiting);
    }
}
