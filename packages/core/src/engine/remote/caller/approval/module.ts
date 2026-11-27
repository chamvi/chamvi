/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PeerRunView, Run } from '@chamvi/core-kit';
import type { RemoteAgent } from '../../../../agent/types.ts';
import { ChannelNotFoundError, InvalidRunStateError, TimeoutError } from '../../../../errors/index.ts';
import { deliverOnce } from '../../../notify/module.ts';
import {
    isSameRemoteApproval,
    nextRemoteState,
    readRemoteViewApproval,
    remoteNotifyKey,
    remoteWaitOf,
    updateRemoteWait,
} from '../../helpers/index.ts';
import type { RemoteEngineContext } from '../../types.ts';
import type { IEngineRemoteApprovals } from './types.ts';

/**
 * The remote approvals of stand-ins: what a poll saw pending in the remote
 * run (or below it) is stored on the wait point and announced to the remote
 * agent's fixed `approvals` destination. The caller never answers it:
 * answering happens at the owning app.
 */
export class EngineRemoteApprovals implements IEngineRemoteApprovals {
    protected readonly ctx: RemoteEngineContext;

    constructor(ctx: RemoteEngineContext) {
        this.ctx = ctx;
    }

    /**
     * Stores what the view of a remote run that has not settled shows on stand-in
     * `run`'s wait point: `remote.status` and the approval pending in the remote
     * run or below it (`remote.approval`; none clears it). The write merges into
     * the stored wait point under the row lock (status `waiting`, wait id), so a
     * concurrent `wakeRequested` or `notifiedAt` is kept; nothing is written when
     * nothing changed. A new approval is announced to the remote agent's fixed
     * `approvals` destination (detached); without one nothing is sent anywhere.
     */
    async surface(run: Run, view: PeerRunView): Promise<void> {
        const { ctx } = this;
        const approval = readRemoteViewApproval(view);
        const current = remoteWaitOf(await ctx.runService.findOne(run.id));

        if (!current || (
            current.remote?.status === view.status &&
            isSameRemoteApproval(current.remote?.approval, approval)
        )) {
            return;
        }

        let updated: Run;

        try {
            updated = await updateRemoteWait(
                ctx.runService,
                run.id,
                current.id,
                (stored) => {
                    const waiting = remoteWaitOf(stored);

                    if (!waiting) {
                        throw new InvalidRunStateError(`Run "${run.id}" no longer waits on its remote run.`);
                    }

                    return { waiting: { ...waiting, remote: nextRemoteState(waiting.remote, view.status, approval) } };
                },
            );
        } catch (error) {
            // answered or cancelled meanwhile
            if (error instanceof InvalidRunStateError) {
                return;
            }

            throw error;
        }

        ctx.emit(updated);

        const stored = remoteWaitOf(updated)?.remote?.approval;

        // a new approval below this stand-in: the receiver's signals to a peer that started a run up its lineage
        if (stored && !isSameRemoteApproval(current.remote?.approval, stored)) {
            ctx.peerEvent(updated);
        }

        if (stored && !stored.notifiedAt && this.hasDestination(updated)) {
            ctx.detach((deliverySignal) => this.deliver(updated.id, deliverySignal), updated);
        }
    }

    /**
     * Sends the notification of the remote approval stand-in `runId` holds to
     * its remote agent's fixed `approvals` destination, unless it went out
     * already: a plain `ChannelMessage` of kind `message` (title, and a body
     * with the owning app's approval link, or saying it waits in the peer's
     * dashboard), keyed `<runId>:remote:<remote run id>:<approvalId>`. As an
     * approval delivery: a store lock `notify:<key>` held for one attempt,
     * aborted after claimTtlMs, `notifiedAt` recorded with a write merged into
     * the stored wait point; a failure rejects (onError) and tick() retries.
     */
    async deliver(runId: string, signal: AbortSignal): Promise<void> {
        const { ctx } = this;
        const run = await ctx.runService.findOne(runId);
        const waiting = remoteWaitOf(run);
        const approval = waiting?.remote?.approval;
        const destination = run ? this.destinationOf(run) : undefined;

        if (!run || !waiting || !approval || approval.notifiedAt || !destination) {
            return;
        }

        const channel = ctx.getChannel(destination.channel);

        if (!channel || typeof channel.out !== 'function') {
            throw new ChannelNotFoundError(destination.channel);
        }

        const key = remoteNotifyKey(run.id, approval);

        await deliverOnce(ctx, {
            key,
            run,
            signal,
            timeout: () => new TimeoutError(
                ctx.claimTtlMs,
                `Channel "${channel.name}" did not deliver remote approval "${approval.approvalId}" within ${ctx.claimTtlMs}ms.`,
            ),
            // another attempt may have delivered it since `run` was read
            pending: async () => {
                const fresh = remoteWaitOf(await ctx.runService.findOne(run.id))?.remote?.approval;

                return fresh !== undefined && isSameRemoteApproval(fresh, approval) && !fresh.notifiedAt;
            },
            send: (sendSignal) => channel.out!({
                kind: 'message',
                key,
                runId: run.id,
                agent: run.agent,
                title: approval.title,
                body: approval.url === undefined ?
                    `An approval of remote agent "${waiting.agent}" waits in the dashboard of peer "${waiting.peer}".` :
                    `An approval of remote agent "${waiting.agent}" waits at peer "${waiting.peer}": ${approval.url}`,
            }, destination.address, { signal: sendSignal, trigger: run.trigger }),
            // merged into the locked wait point; an approval that changed meanwhile records nothing
            record: async (recordSignal) => {
                recordSignal.throwIfAborted();

                const notified = await updateRemoteWait(
                    ctx.runService,
                    run.id,
                    waiting.id,
                    (stored) => {
                        const current = remoteWaitOf(stored);
                        const pending = current?.remote?.approval;

                        if (!current?.remote || !pending || !isSameRemoteApproval(pending, approval)) {
                            throw new InvalidRunStateError(`Run "${run.id}" moved on from remote approval "${approval.approvalId}".`);
                        }

                        return {
                            waiting: {
                                ...current,
                                remote: { ...current.remote, approval: { ...pending, notifiedAt: new Date(ctx.clock.now()) } },
                            },
                        };
                    },
                );

                ctx.emit(notified);
            },
            // to detach(): onError, except an abort by drain
            fail: (error) => {
                throw error;
            },
        });
    }

    hasDestination(run: Run): boolean {
        return this.destinationOf(run) !== undefined;
    }

    /** The fixed `approvals` destination of stand-in `run`'s remote agent (undefined without one). */
    protected destinationOf(run: Run): RemoteAgent['definition']['approvals'] {
        const agent = this.ctx.getAgent(run.agent);

        return agent?.kind === 'remote' ? agent.definition.approvals : undefined;
    }
}
