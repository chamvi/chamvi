/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { RunStatus } from '@chamvi/store';
import type { Invoker, RemoteWaitPoint, Run } from '@chamvi/store';
import type { RemoteAgent } from '../../agent/types.ts';
import { ChannelNotFoundError, InvalidRunStateError, TimeoutError } from '../../errors/index.ts';
import type { PeerRunView } from '../../peer/types.ts';
import {
    isSameApproval,
    nextRemoteState,
    outcomeOf,
    peerRequest,
    readOutcome,
    readStartRecord,
    readViewApproval,
    remoteNotifyKey,
    remotePollKey,
    remoteStartKey,
    remoteWaitKey,
    remoteWaitOf,
    retryAfterOf,
    untilAborted,
} from './helpers.ts';
import type { RemoteAnswerContext, RemoteEngineContext, RemoteOutcome } from './types.ts';

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

/** `waiting` without its wake mark. */
function withoutWake(waiting: RemoteWaitPoint): RemoteWaitPoint {
    const rest = { ...waiting };

    delete rest.wakeRequested;

    return rest;
}

/**
 * Answers the remote wait of stand-in run `runId` with `outcome`: records
 * it under `remote-wait:<runId>`, appends the `wait` step (the status and
 * error, never the output) and requeues the run (waiting -> queued, guarded
 * by status and wait id); the next execution settles the run from the
 * record without a network call. True when this call answered; false for a
 * run that does not wait on a remote run and when another answer won.
 */
export async function answerRemoteWait(ctx: RemoteAnswerContext, runId: string, outcome: RemoteOutcome): Promise<boolean> {
    const run = await ctx.runService.findOne(runId);
    const waiting = remoteWaitOf(run);

    if (!run || !waiting) {
        return false;
    }

    try {
        await ctx.resume(
            run,
            waiting.id,
            { key: remoteWaitKey(run.id), value: outcome },
            {
                name: 'remote',
                input: {
                    peer: waiting.peer,
                    agent: waiting.agent,
                    remoteRunId: waiting.remoteRunId,
                },
                output: {
                    status: outcome.status,
                    ...(outcome.error ? { error: outcome.error } : {}),
                },
            },
            () => new InvalidRunStateError(`Run "${run.id}" moved on to another wait.`),
        );
    } catch (error) {
        // answered meanwhile (another poll, another replica), or moved on
        if (error instanceof InvalidRunStateError) {
            return false;
        }

        throw error;
    }

    return true;
}

/** Sends the cancel of remote run `remoteRunId` at `peer` (best effort: a rejection reaches onError). */
function sendRemoteCancel(ctx: RemoteEngineContext, run: Run, peer: string, remoteRunId: string): void {
    ctx.detach((signal) => peerRequest(
        ctx.clock,
        signal,
        (requestSignal) => ctx.peers.transport(peer).cancel(remoteRunId, { signal: requestSignal }),
    ), run);
}

/**
 * Takes the poll of a woken wait: clears `wakeRequested` with a write
 * conditional on the run still waiting on its remote run and the mark still
 * set (under the row lock, merged into the stored wait point; updatedAt
 * kept, it is the wait step's start). False when the run moved on meanwhile
 * or the mark was taken already.
 */
async function takeWake(ctx: RemoteEngineContext, runId: string): Promise<boolean> {
    const run = await ctx.runService.findOne(runId);
    const waiting = remoteWaitOf(run);

    // gone, or the mark was taken by another replica (its poll is under way)
    if (!waiting?.wakeRequested) {
        return false;
    }

    try {
        const updated = await ctx.runService.updateWith(
            runId,
            (stored) => {
                const current = remoteWaitOf(stored);

                // taken by another replica since the read: its poll is under way
                if (!current?.wakeRequested) {
                    throw new InvalidRunStateError(`The wake of run "${runId}" was taken.`);
                }

                return { waiting: withoutWake(current) };
            },
            {
                expectStatus: [RunStatus.WAITING],
                expectWaitId: waiting.id,
                keepUpdatedAt: true,
            },
        );

        ctx.emit(updated);
    } catch (error) {
        if (error instanceof InvalidRunStateError) {
            return false;
        }

        throw error;
    }

    return true;
}

/**
 * One poll of stand-in `run`'s remote run: once per `pollMs` window across
 * replicas (the store lock `remote-poll:<runId>`), or at once when a wake
 * marked the wait. A settled remote run answers the wait (the next execution
 * settles the stand-in); anything else keeps it waiting. A failed read
 * rejects (onError) and is retried next window, or after the peer's
 * `retryAfterMs` when that is longer.
 */
export async function pollRemote(ctx: RemoteEngineContext, run: Run, waiting: RemoteWaitPoint, signal: AbortSignal): Promise<void> {
    const { pollMs } = ctx.peers.settings(waiting.peer);
    const lockKey = remotePollKey(run.id);
    const owner = randomUUID();
    const held = await ctx.lockService.acquire(lockKey, owner, pollMs);

    const woken = waiting.wakeRequested === true && await takeWake(ctx, run.id);

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
        const retryAfterMs = retryAfterOf(error);

        if (held && retryAfterMs > pollMs) {
            await ctx.lockService.renew(lockKey, owner, retryAfterMs)
                .catch((renewError: unknown) => ctx.onError(renewError, run));
        }

        throw error;
    }

    const outcome = outcomeOf(view);

    if (outcome) {
        await answerRemoteWait(ctx, run.id, outcome);

        return;
    }

    await surfaceRemoteApproval(ctx, run, view);
}

/** The fixed `approvals` destination of stand-in `run`'s remote agent (undefined without one). */
function approvalsOf(ctx: RemoteEngineContext, run: Run): RemoteAgent['definition']['approvals'] {
    const agent = ctx.getAgent(run.agent);

    return agent?.kind === 'remote' ? agent.definition.approvals : undefined;
}

/**
 * Stores what the view of a remote run that has not settled shows on stand-in
 * `run`'s wait point: `remote.status` and the approval pending in the remote
 * run or below it (`remote.approval`; none clears it). The write merges into
 * the stored wait point under the row lock (status `waiting`, wait id), so a
 * concurrent `wakeRequested` or `notifiedAt` is kept; nothing is written when
 * nothing changed. A new approval is announced to the remote agent's fixed
 * `approvals` destination (detached); without one nothing is sent anywhere.
 * The caller never answers it: answering happens at the owning app.
 */
export async function surfaceRemoteApproval(ctx: RemoteEngineContext, run: Run, view: PeerRunView): Promise<void> {
    const approval = readViewApproval(view);
    const current = remoteWaitOf(await ctx.runService.findOne(run.id));

    if (!current || (
        current.remote?.status === view.status &&
        isSameApproval(current.remote?.approval, approval)
    )) {
        return;
    }

    let updated: Run;

    try {
        updated = await ctx.runService.updateWith(
            run.id,
            (stored) => {
                const waiting = remoteWaitOf(stored);

                if (!waiting) {
                    throw new InvalidRunStateError(`Run "${run.id}" no longer waits on its remote run.`);
                }

                return { waiting: { ...waiting, remote: nextRemoteState(waiting.remote, view.status, approval) } };
            },
            {
                expectStatus: [RunStatus.WAITING],
                expectWaitId: current.id,
                keepUpdatedAt: true,
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

    if (stored && !stored.notifiedAt && approvalsOf(ctx, updated)) {
        ctx.detach((deliverySignal) => deliverRemoteApproval(ctx, updated.id, deliverySignal), updated);
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
export async function deliverRemoteApproval(ctx: RemoteEngineContext, runId: string, signal: AbortSignal): Promise<void> {
    const run = await ctx.runService.findOne(runId);
    const waiting = remoteWaitOf(run);
    const approval = waiting?.remote?.approval;
    const destination = run ? approvalsOf(ctx, run) : undefined;

    if (!run || !waiting || !approval || approval.notifiedAt || !destination) {
        return;
    }

    const channel = ctx.getChannel(destination.channel);

    if (!channel || typeof channel.out !== 'function') {
        throw new ChannelNotFoundError(destination.channel);
    }

    const key = remoteNotifyKey(run.id, approval);
    const lockKey = `notify:${key}`;
    const attempt = randomUUID();

    if (!await ctx.lockService.acquire(lockKey, attempt, ctx.claimTtlMs)) {
        return;
    }

    const deadline = new AbortController();
    const timer = ctx.clock.setTimeout(() => deadline.abort(new TimeoutError(
        ctx.claimTtlMs,
        `Channel "${channel.name}" did not deliver remote approval "${approval.approvalId}" within ${ctx.claimTtlMs}ms.`,
    )), ctx.claimTtlMs);

    timer.unref?.();

    const combined = AbortSignal.any([signal, deadline.signal]);

    try {
        // another attempt may have delivered it since `run` was read
        const fresh = remoteWaitOf(await ctx.runService.findOne(run.id))?.remote?.approval;

        if (!fresh || !isSameApproval(fresh, approval) || fresh.notifiedAt) {
            return;
        }

        const where = approval.url === undefined ?
            'waits in the dashboard of peer' :
            'waits at peer';
        const body = `An approval of remote agent "${waiting.agent}" ${where} "${waiting.peer}"${ 
            approval.url === undefined ? '.' : `: ${approval.url}`}`;

        await untilAborted(combined, () => channel.out!({
            kind: 'message',
            key,
            runId: run.id,
            agent: run.agent,
            title: approval.title,
            body,
        }, destination.address, { signal: combined, trigger: run.trigger }));

        combined.throwIfAborted();

        const notified = await ctx.runService.updateWith(
            run.id,
            (stored) => {
                const current = remoteWaitOf(stored);
                const pending = current?.remote?.approval;

                if (!current?.remote || !pending || !isSameApproval(pending, approval)) {
                    throw new InvalidRunStateError(`Run "${run.id}" moved on from remote approval "${approval.approvalId}".`);
                }

                return {
                    waiting: {
                        ...current,
                        remote: { ...current.remote, approval: { ...pending, notifiedAt: new Date(ctx.clock.now()) } },
                    },
                };
            },
            {
                expectStatus: [RunStatus.WAITING],
                expectWaitId: waiting.id,
                keepUpdatedAt: true,
            },
        );

        ctx.emit(notified);
    } catch (error) {
        // answered, cancelled or moved on to another approval meanwhile: nothing left to record
        if (!(error instanceof InvalidRunStateError)) {
            throw error;
        }
    } finally {
        timer.clear();

        await ctx.lockService.release(lockKey, attempt).catch((releaseError: unknown) => ctx.onError(releaseError, run));
    }
}

/**
 * Times out the remote wait of `run` (past its expiresAt): answers it with
 * outcome `timeout` (the stand-in then fails with `Timeout`) and sends the
 * remote cancel once, from the replica whose answer won. True when answered.
 */
export async function expireRemote(ctx: RemoteEngineContext, run: Run, waiting: RemoteWaitPoint): Promise<boolean> {
    const answered = await answerRemoteWait(ctx, run.id, {
        status: 'timeout',
        tainted: false,
        usage: { ...NO_USAGE },
    });

    if (answered) {
        sendRemoteCancel(ctx, run, waiting.peer, waiting.remoteRunId);
    }

    return answered;
}

/**
 * The remote waits among the `waiting` runs `listed` (one tick): an expired
 * one is timed out here (store writes only), every other one is polled
 * detached, so tick() never awaits a peer, and its remote approval not
 * announced yet is sent again (detached). True when a wait was answered.
 */
export async function pollRemoteWaits(ctx: RemoteEngineContext, listed: readonly Run[], now: number): Promise<boolean> {
    let resumed = false;

    for (const run of listed) {
        const waiting = remoteWaitOf(run);

        if (!waiting) {
            continue;
        }

        if (waiting.expiresAt.getTime() > now) {
            ctx.detach((signal) => pollRemote(ctx, run, waiting, signal), run);

            // a notification that failed or was lost to a crash: retried without a new read
            if (waiting.remote?.approval && !waiting.remote.approval.notifiedAt && approvalsOf(ctx, run)) {
                ctx.detach((signal) => deliverRemoteApproval(ctx, run.id, signal), run);
            }

            continue;
        }

        try {
            if (await expireRemote(ctx, run, waiting)) {
                resumed = true;
            }
        } catch (error) {
            ctx.onError(error, run);
        }
    }

    return resumed;
}

/**
 * A peer's content-free "check run X now": marks the remote wait of stand-in
 * `runId` `wakeRequested` (a write conditional on the run still waiting on
 * its remote run), so the next tick on any replica polls it regardless of
 * the window. False, with nothing written, unless `runId` is a stand-in
 * waiting on the peer `invoker` authenticates as.
 */
export async function wakeRemote(ctx: RemoteEngineContext, runId: string, invoker: Invoker | undefined): Promise<boolean> {
    const peer = ctx.peers.recognize(invoker);

    if (peer === undefined) {
        return false;
    }

    const run = await ctx.runService.findOne(runId);
    const waiting = remoteWaitOf(run);

    if (!waiting || waiting.peer !== peer) {
        return false;
    }

    if (waiting.wakeRequested) {
        return true;
    }

    try {
        const updated = await ctx.runService.updateWith(
            runId,
            (stored) => {
                const current = remoteWaitOf(stored);

                if (!current) {
                    throw new InvalidRunStateError(`Run "${runId}" no longer waits on its remote run.`);
                }

                // merged into the stored wait point: a concurrent poll's `remote` state is kept
                return { waiting: { ...current, wakeRequested: true } };
            },
            {
                expectStatus: [RunStatus.WAITING],
                expectWaitId: waiting.id,
                keepUpdatedAt: true,
            },
        );

        ctx.emit(updated);
    } catch (error) {
        if (error instanceof InvalidRunStateError) {
            return false;
        }

        throw error;
    }

    return true;
}

/**
 * After stand-in `run` settled `cancelled` here: sends the cancel of its
 * remote run (best effort), unless it never started one or its remote run
 * already ended (a recorded outcome; a timeout sent its own cancel).
 */
export async function cancelRemote(ctx: RemoteEngineContext, run: Run, fallbackPeer: string | undefined): Promise<void> {
    const started = readStartRecord((await ctx.effectService.findOne(remoteStartKey(run.id)))?.result);

    if (!started || readOutcome((await ctx.effectService.findOne(remoteWaitKey(run.id)))?.result)) {
        return;
    }

    const peer = started.peer ?? fallbackPeer;

    if (peer === undefined) {
        return;
    }

    sendRemoteCancel(ctx, run, peer, started.runId);
}
