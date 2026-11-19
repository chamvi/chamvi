/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/store';
import type { Run } from '@chamvi/store';
import type { ArtifactInput } from '../../../artifact/types.ts';
import { ArtifactNotFoundError, TimeoutError, ValidationError } from '../../../errors/index.ts';
import type { PeerStartInput } from '../../../peer/types.ts';
import { peerRequest, readRemoteStartRecord, remoteStartKey } from '../../remote/helpers/index.ts';
import { toRunError } from '../helpers/index.ts';
import type { RemoteExecuteContext } from '../types.ts';

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
async function remoteAttachmentsOf(ctx: RemoteExecuteContext): Promise<ArtifactInput[] | undefined> {
    const { attachments } = ctx.run.trigger;

    if (!attachments || attachments.length === 0) {
        return undefined;
    }

    return Promise.all(attachments.map(async (artifact) => {
        const data = await ctx.artifactService.read(artifact.id);

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

/**
 * The signal of the start request: aborted with `signal` unless a cancel
 * aborted it (its reason `cancel`). A cancel lets the start finish, since the
 * peer may have created the run: only a recorded start is cancelled remotely.
 */
function remoteStartSignal(signal: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const forward = () => {
        if (signal.reason !== 'cancel') {
            controller.abort(signal.reason);
        }
    };

    if (signal.aborted) {
        forward();
    } else {
        signal.addEventListener('abort', forward, { once: true });
    }

    return controller.signal;
}

async function remoteStartInput(ctx: RemoteExecuteContext): Promise<PeerStartInput> {
    const { run, agent } = ctx;
    const attachments = await remoteAttachmentsOf(ctx);
    const origin = run.trigger.invoker?.name;

    return {
        agent: agent.definition.agent,
        role: agent.definition.role,
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

/**
 * The start effect `remote-start:<runId>`: the recorded remote run id, else
 * the start's answer, recorded. Undefined when the execution ended without
 * one: settled (cancelled, or failed with a start ValidationError), or left
 * `running` for recovery after a retryable rejection.
 */
export async function startRemoteRun(ctx: RemoteExecuteContext): Promise<string | undefined> {
    const {
        run,
        agent,
        effectService,
        clock,
    } = ctx;
    const { peer, timeoutMs } = agent.definition;
    const key = remoteStartKey(run.id);
    const recorded = readRemoteStartRecord((await effectService.findOne(key))?.result);

    if (recorded) {
        return recorded.runId;
    }

    // retries end at the remote deadline: a start that never got through fails like a remote run that never settled
    if (clock.now() >= run.createdAt.getTime() + timeoutMs) {
        await ctx.finish({
            status: RunStatus.FAILED,
            error: toRunError(new TimeoutError(timeoutMs, `The remote run of agent "${agent.name}" was not started within ${timeoutMs}ms.`)),
        });

        return undefined;
    }

    let remoteRunId: string;

    try {
        const input = await remoteStartInput(ctx);
        const answer = await peerRequest(
            clock,
            remoteStartSignal(ctx.signal),
            (signal) => ctx.peers.transport(peer).start(input, { signal }),
        );

        if (typeof answer?.runId !== 'string' || answer.runId.length === 0) {
            // a broken peer: a resend gets the same answer
            throw new ValidationError(`Peer "${peer}" answered the start of run "${run.id}" without a run id.`);
        }

        remoteRunId = answer.runId;
    } catch (error) {
        if (ctx.signal.aborted) {
            await ctx.finish({ status: RunStatus.CANCELLED });

            return undefined;
        }

        if (error instanceof ValidationError || error instanceof ArtifactNotFoundError) {
            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(error) });

            return undefined;
        }

        // the remote may have created the run: the claim expires, recovery resends under the same key
        ctx.onError(error, run);

        return undefined;
    }

    try {
        await effectService.save(key, { runId: remoteRunId, peer });
    } catch (error) {
        // the start is idempotent under its key: recovery resends it and reaches the same remote run
        ctx.onError(error, run);

        return undefined;
    }

    if (ctx.signal.aborted) {
        // cancelled while the start was in flight: the recorded start makes the settle send the remote cancel
        await ctx.finish({ status: RunStatus.CANCELLED });

        return undefined;
    }

    return remoteRunId;
}
