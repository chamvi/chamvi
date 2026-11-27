/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { peerRequest, readRemoteStartAnswer } from '../../remote/helpers/index.ts';
import type { CancelledRemoteStart, RemoteExecuteContext } from '../types.ts';

/**
 * Finishes, detached (`ctx.detach()`, so idle() and drain() account for
 * it), the start of a stand-in that was cancelled while it was in flight,
 * and cancels the remote run it learns of. A start that failed ambiguously
 * (a timeout, a lost answer: the peer may have created the run) is sent once
 * more under the same idempotency key, which the peer answers with the
 * existing run; a refused start (ValidationError) created nothing. `signal`
 * (the detached work's, aborted by drain) aborts the request in flight too.
 * A failure rejects (to onError); the local run stays `cancelled`.
 */
export async function cancelRemoteStart(ctx: RemoteExecuteContext, start: CancelledRemoteStart, signal: AbortSignal): Promise<void> {
    const { peer } = start;
    const forward = () => start.request.abort(signal.reason);

    if (signal.aborted) {
        forward();
    } else {
        signal.addEventListener('abort', forward, { once: true });
    }

    try {
        let answer: { runId: string };

        try {
            answer = await start.pending;
        } catch (error) {
            if (error instanceof ValidationError) {
                return;
            }

            if (signal.aborted) {
                throw error;
            }

            // one resend: the peer dedupes by the key, so it reaches the run the lost start created
            answer = await peerRequest(ctx.clock, signal, (requestSignal) => ctx.peers.transport(peer).start(start.input, { signal: requestSignal }));
        }

        const remoteRunId = readRemoteStartAnswer(answer, peer, ctx.run.id);

        await peerRequest(ctx.clock, signal, (requestSignal) => ctx.peers.transport(peer).cancel(remoteRunId, { signal: requestSignal }));
    } finally {
        signal.removeEventListener('abort', forward);
    }
}
