/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { RunStatus } from '@chamvi/store';
import type { Invoker, RemoteWaitPoint, Run } from '@chamvi/store';
import { InvalidRunStateError } from '../../errors/index.ts';
import {
    outcomeOf,
    peerRequest,
    readOutcome,
    readStartRecord,
    remotePollKey,
    remoteStartKey,
    remoteWaitKey,
    remoteWaitOf,
    retryAfterOf,
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
 * conditional on the run still waiting on its remote run (updatedAt kept, it
 * is the wait step's start). False when the run moved on meanwhile or the
 * mark was taken already.
 */
async function takeWake(ctx: RemoteEngineContext, runId: string): Promise<boolean> {
    const run = await ctx.runService.findOne(runId);
    const waiting = remoteWaitOf(run);

    // gone, or the mark was taken by another replica (its poll is under way)
    if (!waiting?.wakeRequested) {
        return false;
    }

    try {
        const updated = await ctx.runService.update(
            runId,
            { waiting: withoutWake(waiting) },
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

    let outcome: RemoteOutcome | undefined;

    try {
        const view = await peerRequest(
            ctx.clock,
            signal,
            (requestSignal) => ctx.peers.transport(waiting.peer).read(waiting.remoteRunId, { signal: requestSignal }),
        );

        outcome = outcomeOf(view);
    } catch (error) {
        const retryAfterMs = retryAfterOf(error);

        if (held && retryAfterMs > pollMs) {
            await ctx.lockService.renew(lockKey, owner, retryAfterMs)
                .catch((renewError: unknown) => ctx.onError(renewError, run));
        }

        throw error;
    }

    if (outcome) {
        await answerRemoteWait(ctx, run.id, outcome);
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
 * detached, so tick() never awaits a peer. True when a wait was answered.
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
        const updated = await ctx.runService.update(
            runId,
            { waiting: { ...waiting, wakeRequested: true } },
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
