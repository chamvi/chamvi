/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { RunStatus } from '@chamvi/store';
import type { Invoker, RemoteWaitPoint, Run } from '@chamvi/store';
import type { PeerRunView } from '../../../peer/types.ts';
import type { WakeOutcome } from '../../types.ts';
import { REMOTE_NO_USAGE } from '../constants.ts';
import {
    peerRequest,
    peerRetryAfterOf,
    readRemoteOutcome,
    readRemoteStartRecord,
    remoteOutcomeOf,
    remotePollKey,
    remoteStartKey,
    remoteWaitKey,
    remoteWaitOf,
} from '../helpers/index.ts';
import type { RemoteEngineContext } from '../types.ts';
import { answerRemoteWait } from './answer.ts';
import { EngineRemoteApprovals } from './approval/module.ts';
import type { IEngineRemoteApprovals } from './approval/types.ts';
import type { IEngineRemote } from './types.ts';
import { EngineRemoteWakes } from './wake/module.ts';
import type { IEngineRemoteWakes } from './wake/types.ts';

/**
 * The caller side of remote agents: the stand-ins' remote waits, polled,
 * woken (EngineRemoteWakes), timed out, their remote approvals surfaced
 * (EngineRemoteApprovals) and their remote runs cancelled. Built by the
 * engine only with peers.
 */
export class EngineRemote implements IEngineRemote {
    protected readonly ctx: RemoteEngineContext;

    protected readonly approvals: IEngineRemoteApprovals;

    protected readonly wakes: IEngineRemoteWakes;

    constructor(ctx: RemoteEngineContext) {
        this.ctx = ctx;
        this.approvals = new EngineRemoteApprovals(ctx);
        this.wakes = new EngineRemoteWakes(ctx);
    }

    /**
     * The remote waits among the `waiting` runs `listed` (one tick): an expired
     * one is timed out here (store writes only), every other one is polled
     * detached, so tick() never awaits a peer, and its remote approval not
     * announced yet is sent again (detached). True when a wait was answered.
     */
    async pollWaits(listed: readonly Run[], now: number): Promise<boolean> {
        const { ctx } = this;
        let resumed = false;

        for (const run of listed) {
            const waiting = remoteWaitOf(run);

            if (!waiting) {
                continue;
            }

            if (waiting.expiresAt.getTime() > now) {
                ctx.detach((signal) => this.poll(run, waiting, signal), run);

                // a notification that failed or was lost to a crash: retried without a new read
                if (waiting.remote?.approval && !waiting.remote.approval.notifiedAt && this.approvals.hasDestination(run)) {
                    ctx.detach((signal) => this.approvals.deliver(run.id, signal), run);
                }

                continue;
            }

            try {
                if (await this.expire(run, waiting)) {
                    resumed = true;
                }
            } catch (error) {
                ctx.onError(error, run);
            }
        }

        return resumed;
    }

    /**
     * One poll of stand-in `run`'s remote run: once per `pollMs` window across
     * replicas (the store lock `remote-poll:<runId>`), or at once when a wake
     * marked the wait. A settled remote run answers the wait (the next execution
     * settles the stand-in); anything else keeps it waiting. A failed read
     * rejects (onError) and is retried next window, or after the peer's
     * `retryAfterMs` when that is longer.
     */
    async poll(run: Run, waiting: RemoteWaitPoint, signal: AbortSignal): Promise<void> {
        const { ctx } = this;
        const { pollMs } = ctx.peers.settings(waiting.peer);
        const lockKey = remotePollKey(run.id);
        const owner = randomUUID();
        const held = await ctx.lockService.acquire(lockKey, owner, pollMs);

        const woken = waiting.wakeRequested === true && await this.wakes.take(run.id);

        if (!woken && !held) {
            return;
        }

        let view: PeerRunView;

        try {
            view = await peerRequest(
                ctx.clock,
                signal,
                (requestSignal) => ctx.peers.transport(waiting.peer).read(waiting.remoteRunId, { signal: requestSignal }),
            );
        } catch (error) {
            const retryAfterMs = peerRetryAfterOf(error);

            if (held && retryAfterMs > pollMs) {
                await ctx.lockService.renew(lockKey, owner, retryAfterMs)
                    .catch((renewError: unknown) => ctx.onError(renewError, run));
            }

            throw error;
        }

        const outcome = remoteOutcomeOf(view);

        if (outcome) {
            await answerRemoteWait(ctx, run.id, outcome);

            return;
        }

        await this.approvals.surface(run, view);
    }

    /**
     * Times out the remote wait of `run` (past its expiresAt): answers it with
     * outcome `timeout` (the stand-in then fails with `Timeout`) and sends the
     * remote cancel once, from the replica whose answer won. True when answered.
     */
    async expire(run: Run, waiting: RemoteWaitPoint): Promise<boolean> {
        const answered = await answerRemoteWait(this.ctx, run.id, {
            status: 'timeout',
            tainted: false,
            usage: { ...REMOTE_NO_USAGE },
        });

        if (answered) {
            this.sendCancel(run, waiting.peer, waiting.remoteRunId);
        }

        return answered;
    }

    /** A peer's content-free wake of stand-in `runId` (EngineRemoteWakes.mark()). */
    wake(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined> {
        return this.wakes.mark(runId, invoker);
    }

    /**
     * A stand-in that settled `cancelled` here passes the cancel on to its
     * remote run (detached, best effort: a failure reaches onError only),
     * unless it never started one or its remote run already ended (a
     * recorded outcome; a timeout sent its own cancel).
     */
    cancelSettled(run: Run): void {
        if (run.status !== RunStatus.CANCELLED) {
            return;
        }

        const agent = this.ctx.getAgent(run.agent);
        const fallbackPeer = agent?.kind === 'remote' ? agent.definition.peer : undefined;

        this.ctx.detach(async () => {
            const { effectService } = this.ctx;
            const started = readRemoteStartRecord((await effectService.findOne(remoteStartKey(run.id)))?.result);

            if (!started || readRemoteOutcome((await effectService.findOne(remoteWaitKey(run.id)))?.result)) {
                return;
            }

            const peer = started.peer ?? fallbackPeer;

            if (peer !== undefined) {
                this.sendCancel(run, peer, started.runId);
            }
        }, run);
    }

    /** Sends the cancel of remote run `remoteRunId` at `peer` (best effort: a rejection reaches onError). */
    protected sendCancel(run: Run, peer: string, remoteRunId: string): void {
        const { ctx } = this;

        ctx.detach((signal) => peerRequest(
            ctx.clock,
            signal,
            (requestSignal) => ctx.peers.transport(peer).cancel(remoteRunId, { signal: requestSignal }),
        ), run);
    }
}
