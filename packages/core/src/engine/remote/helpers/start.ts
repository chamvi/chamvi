/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type { ArtifactInput, PeerStartInput, Run } from '@chamvi/core-kit';
import type { IArtifactService } from '../../../artifact/types.ts';
import { ArtifactNotFoundError } from '../../../errors/index.ts';
import { PEER_ORIGIN_MAX_LENGTH } from '@chamvi/core-kit';
import { IDEMPOTENCY_TTL_MS } from '../../constants.ts';
import type { RemoteStartAttempt, RemoteStartSource } from '../types.ts';
import { peerRequest } from './request.ts';

/**
 * The calling run the peer counts the start against: the stand-in's parent
 * when it was dispatched here, else the stand-in itself. `depth` is that
 * calling run's depth, so the stand-in adds no level: the peer's run lands
 * at the depth a local dispatch from the caller would (`parent.depth + 1`).
 */
function remoteCallerOf(run: Run): PeerStartInput['peer']['parent'] {
    const { parent } = run.trigger;

    if (parent?.kind === 'dispatch') {
        return {
            runId: parent.runId,
            agent: parent.agent,
            // the trigger's depth is the stand-in's own; its parent sits one above
            depth: parent.depth - 1,
        };
    }

    return {
        runId: run.id,
        agent: run.agent,
        depth: parent?.depth ?? 0,
    };
}

/** The stand-in's attachments with their bytes, in the dispatch order. */
async function remoteAttachmentsOf(run: Run, artifactService: Pick<IArtifactService, 'read'>): Promise<ArtifactInput[] | undefined> {
    const { attachments } = run.trigger;

    if (!attachments || attachments.length === 0) {
        return undefined;
    }

    return Promise.all(attachments.map(async (artifact) => {
        const data = await artifactService.read(artifact.id);

        if (!data) {
            throw new ArtifactNotFoundError(artifact.id);
        }

        return {
            mediaType: artifact.mediaType,
            ...(artifact.filename !== undefined ? { filename: artifact.filename } : {}),
            data,
        };
    }));
}

/** The invoker's name as the start's `origin`, cut to what a peer accepts (PEER_ORIGIN_MAX_LENGTH). */
function remoteOriginOf(run: Run): string | undefined {
    const name = run.trigger.invoker?.name;

    if (name === undefined || name.length === 0) {
        return undefined;
    }

    // toWellFormed(): a cut through a surrogate pair leaves no lone surrogate
    return name.slice(0, PEER_ORIGIN_MAX_LENGTH).toWellFormed();
}

/** The start of stand-in `run` at `target`; every resend builds the same input. */
export async function buildRemoteStartInput(
    run: Run,
    target: RemoteStartAttempt,
    artifactService: Pick<IArtifactService, 'read'>,
): Promise<PeerStartInput> {
    const attachments = await remoteAttachmentsOf(run, artifactService);
    const origin = remoteOriginOf(run);

    return {
        agent: target.agent,
        role: target.role,
        payload: run.trigger.payload,
        ...(attachments ? { attachments } : {}),
        // the local run id: every resend of this start reaches the same remote run
        idempotencyKey: run.id,
        peer: {
            standIn: run.id,
            parent: remoteCallerOf(run),
            taint: run.taint !== undefined,
            ...(origin !== undefined ? { origin } : {}),
        },
    };
}

/** The remote run id of a start answer; a ValidationError for an answer without one (a broken peer). */
export function readRemoteStartAnswer(answer: { runId: string } | undefined, peer: string, runId: string): string {
    if (typeof answer?.runId !== 'string' || answer.runId.length === 0) {
        // a broken peer: a resend gets the same answer
        throw new ValidationError(`Peer "${peer}" answered the start of run "${runId}" without a run id.`);
    }

    return answer.runId;
}

/**
 * Cancels the remote run a start of stand-in `run` that failed ambiguously
 * (no recorded answer) may have created: the start is sent once more under
 * the same idempotency key, which the peer answers with the existing run,
 * then that run is cancelled. A peer that never got the first start creates
 * the run here and has it cancelled at once. A refused resend
 * (ValidationError) created nothing; any other failure rejects (onError).
 * Past the peer's dedupe window (IDEMPOTENCY_TTL_MS after the first send)
 * the key no longer names that run: nothing is sent, and a ValidationError
 * reports the remote run that may be left (onError).
 */
export async function cancelLostRemoteStart(
    ctx: RemoteStartSource,
    run: Run,
    attempt: RemoteStartAttempt,
    signal: AbortSignal,
): Promise<void> {
    if (ctx.clock.now() - attempt.at >= IDEMPOTENCY_TTL_MS) {
        // a resend would create and cancel another run, not reach the one the lost start may have created
        throw new ValidationError(`The start of run "${run.id}" at peer "${attempt.peer}" was lost too long ago to find its remote run; it may still run there.`);
    }

    const transport = () => ctx.peers.transport(attempt.peer);
    const input = await buildRemoteStartInput(run, attempt, ctx.artifactService);
    let answer: { runId: string };

    try {
        answer = await peerRequest(ctx.clock, signal, (requestSignal) => transport().start(input, { signal: requestSignal }));
    } catch (error) {
        if (error instanceof ValidationError) {
            return;
        }

        throw error;
    }

    const remoteRunId = readRemoteStartAnswer(answer, attempt.peer, run.id);

    await peerRequest(ctx.clock, signal, (requestSignal) => transport().cancel(remoteRunId, { signal: requestSignal }));
}
