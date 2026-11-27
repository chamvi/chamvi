/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PeerParent, Run } from '@chamvi/core-kit';
import { pendingApprovalOf } from '../../../dispatch/descendants.ts';
import { ancestorsOf, isRunSettled } from '../../../dispatch/helpers/index.ts';
import { ChannelNotFoundError, TimeoutError } from '../../../errors/index.ts';
import { deliverOnce } from '../../notify/module.ts';
import { peerNotifyKey, peerParentOf, peerRequest } from '../helpers/index.ts';
import type { PeerReceiverContext } from '../types.ts';
import type { IEnginePeerReceiver } from './types.ts';

/**
 * The receiver side of remote agents: the signals this app sends to the
 * peer that started one of its runs (the stand-in's wake, the notification
 * of an approval pending below it). Built by the engine only with peers.
 */
export class EnginePeerReceiver implements IEnginePeerReceiver {
    protected readonly ctx: PeerReceiverContext;

    constructor(ctx: PeerReceiverContext) {
        this.ctx = ctx;
    }

    /**
     * The receiver's signals to the peer that started a run (detached, best
     * effort, never blocking `run`): when a run with a `peer` parent settles,
     * the content-free wake of its stand-in; when an approval became pending in
     * `run` (its own, or a nested stand-in's remote one), the wake of the
     * stand-in whose peer-started run is `run` or one of its ancestors (up
     * `parentRunId`), and the notification to that peer's `approvals`
     * destination. A wake goes out only to a peer with `outgoing`; a failure
     * reaches onError only.
     */
    onRunEvent(run: Run): void {
        try {
            this.sendSignals(run);
        } catch (error) {
            this.ctx.onError(error, run);
        }
    }

    protected sendSignals(run: Run): void {
        const { ctx } = this;

        if (isRunSettled(run)) {
            const parent = peerParentOf(run);

            if (parent) {
                this.sendWake(run, parent);
            }

            return;
        }

        // a run neither dispatched nor started by a peer has no peer up its lineage: no read
        if (!pendingApprovalOf(run) || (run.parentRunId === undefined && !peerParentOf(run))) {
            return;
        }

        ctx.detach(async (signal) => {
            const chain = await ancestorsOf({ runs: ctx.runService }, run.id);
            const root = chain.find((r) => peerParentOf(r) !== undefined);
            const parent = root ? peerParentOf(root) : undefined;

            if (!root || !parent) {
                return;
            }

            this.sendWake(root, parent);

            if (ctx.peers.has(parent.peer)) {
                await this.notifyApproval(chain[0] ?? run, parent.peer, signal);
            }
        }, run);
    }

    /** Sends the content-free wake of `parent.standIn` to its peer (detached, best effort), when this app calls that peer. */
    protected sendWake(run: Run, parent: PeerParent): void {
        const { ctx } = this;

        if (!ctx.peers.has(parent.peer) || !ctx.peers.settings(parent.peer).outgoing) {
            return;
        }

        ctx.detach((signal) => peerRequest(
            ctx.clock,
            signal,
            (requestSignal) => ctx.peers.transport(parent.peer).wake(parent.standIn, { signal: requestSignal }),
        ), run);
    }

    /**
     * Sends the approval `holder` waits on (its own, or a stand-in's remote
     * one) to the fixed `approvals` destination of `peer`, once per approval:
     * a plain message (title, and a body with the approval link: this app's
     * own for its own approval, the owning app's for a remote one), keyed
     * `peerNotifyKey()`. The sent notification is recorded as
     * an effect under that key (the wait point's `notifiedAt` belongs to the
     * run's own destination), checked under the store lock `notify:<key>`.
     */
    protected async notifyApproval(holder: Run, peer: string, signal: AbortSignal): Promise<void> {
        const { ctx } = this;
        const destination = ctx.peers.settings(peer).approvals;
        const approval = pendingApprovalOf(holder);

        if (!destination || !approval) {
            return;
        }

        const channel = ctx.getChannel(destination.channel);

        if (!channel || typeof channel.out !== 'function') {
            throw new ChannelNotFoundError(destination.channel);
        }

        const key = peerNotifyKey(peer, holder.id, approval);
        // an approval of this app's own run links to this app; a remote one to the app that owns it
        const url = approval.runId === holder.id ?
            ctx.peers.approvalUrl?.({ runId: approval.runId, approvalId: approval.approvalId }) :
            approval.url;

        await deliverOnce(ctx, {
            key,
            run: holder,
            signal,
            timeout: () => new TimeoutError(
                ctx.claimTtlMs,
                `Channel "${channel.name}" did not deliver the approval "${approval.approvalId}" for peer "${peer}" within ${ctx.claimTtlMs}ms.`,
            ),
            // still pending, and not sent by another attempt
            pending: async () => {
                const current = pendingApprovalOf(await ctx.runService.findOne(holder.id) ?? holder);
                const same = current?.runId === approval.runId && current.approvalId === approval.approvalId;

                return same && !await ctx.effectService.findOne(key);
            },
            send: (sendSignal) => channel.out!({
                kind: 'message',
                key,
                runId: holder.id,
                agent: holder.agent,
                title: approval.title,
                body: url === undefined ?
                    `An approval of agent "${holder.agent}" waits in the dashboard.` :
                    `An approval of agent "${holder.agent}" waits: ${url}`,
            }, destination.address, { signal: sendSignal, trigger: holder.trigger }),
            record: async (recordSignal) => {
                recordSignal.throwIfAborted();

                await ctx.effectService.save(key, { notifiedAt: new Date(ctx.clock.now()).toISOString() });
            },
            // to detach(): onError, except an abort by drain
            fail: (error) => {
                throw error;
            },
        });
    }
}
