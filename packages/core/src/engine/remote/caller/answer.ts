/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidRunStateError } from '../../../errors/index.ts';
import { remoteWaitKey, remoteWaitOf } from '../helpers/index.ts';
import type { RemoteAnswerContext, RemoteOutcome } from '../types.ts';

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
