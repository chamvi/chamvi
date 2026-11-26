/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { RunStatus } from '@chamvi/store';
import { ArtifactNotFoundError, TimeoutError } from '../../../errors/index.ts';
import {
    buildRemoteStartInput,
    cancelLostRemoteStart,
    peerRequest,
    readRemoteStartAnswer,
    readRemoteStartAttempt,
    readRemoteStartRecord,
    remoteStartKey,
} from '../../remote/helpers/index.ts';
import type { RemoteStartAttempt } from '../../remote/types.ts';
import { toRunError } from '../helpers/index.ts';
import { cancelRemoteStart } from './cancel.ts';
import type { RemoteExecuteContext } from '../types.ts';

const CANCELLED = Symbol('cancelled');

/**
 * The controller of the start request: aborted with `signal` unless a cancel
 * aborted it (its reason `cancel`). A cancel lets the start finish, since the
 * peer may have created the run (cancelRemoteStart()).
 */
function remoteStartController(signal: AbortSignal): AbortController {
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

    return controller;
}

/** The start's answer, or CANCELLED as soon as a cancel aborts `signal` (the start goes on). */
async function untilCancelled<T>(pending: Promise<T>, signal: AbortSignal): Promise<T | typeof CANCELLED> {
    const { promise, resolve } = Promise.withResolvers<typeof CANCELLED>();
    const onAbort = () => {
        if (signal.reason === 'cancel') {
            resolve(CANCELLED);
        }
    };

    if (signal.aborted) {
        onAbort();
    } else {
        signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
        return await Promise.race([pending, promise]);
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
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
    const stored = (await effectService.findOne(key))?.result;
    const recorded = readRemoteStartRecord(stored);

    if (recorded) {
        return recorded.runId;
    }

    const attempted = readRemoteStartAttempt(stored);

    // retries end at the remote deadline: a start that never got through fails like a remote run that never settled
    if (clock.now() >= run.createdAt.getTime() + timeoutMs) {
        const settled = await ctx.finish({
            status: RunStatus.FAILED,
            error: toRunError(new TimeoutError(timeoutMs, `The remote run of agent "${agent.name}" was not started within ${timeoutMs}ms.`)),
        });

        if (settled && attempted) {
            // an earlier start failed ambiguously: the peer may run it, unseen and uncancelled
            ctx.detach((signal) => cancelLostRemoteStart(ctx, run, attempted, signal));
        }

        return undefined;
    }

    // a retry sends to the saved target: the one a cancel or the deadline resends to (cancelLostRemoteStart())
    const attempt: RemoteStartAttempt = attempted ?? {
        peer,
        agent: agent.definition.agent,
        role: agent.definition.role,
        at: clock.now(),
    };

    if (!attempted) {
        try {
            // before the first send: a cancel or the deadline then knows a lost answer may have left a remote run
            await effectService.save(key, { attempt });
        } catch (error) {
            ctx.onError(error, run);

            return undefined;
        }

        if (ctx.signal.aborted) {
            if (ctx.signal.reason === 'cancel') {
                // nothing was sent: the settle must not resend the start to cancel it
                ctx.handOffStart();
            }

            // a drain marks it interrupted instead; recovery then sends the start
            await ctx.finish({ status: RunStatus.CANCELLED });

            return undefined;
        }
    }

    let remoteRunId: string;

    try {
        const input = await buildRemoteStartInput(run, attempt, ctx.artifactService);
        const request = remoteStartController(ctx.signal);
        const pending = peerRequest(
            clock,
            request.signal,
            (signal) => ctx.peers.transport(attempt.peer).start(input, { signal }),
        );
        const answer = await untilCancelled(pending, ctx.signal);

        if (answer === CANCELLED) {
            // answered at once: the start finishes detached and cancels the remote run it learns of,
            // so the settle below sends nothing more for it
            ctx.handOffStart();
            ctx.detach((signal) => cancelRemoteStart(ctx, {
                peer: attempt.peer,
                pending,
                input,
                request,
            }, signal));
            await ctx.finish({ status: RunStatus.CANCELLED });

            return undefined;
        }

        remoteRunId = readRemoteStartAnswer(answer, attempt.peer, run.id);
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
        await effectService.save(key, { runId: remoteRunId, peer: attempt.peer });
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
