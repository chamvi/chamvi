/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readRemoteOutcome, remoteWaitKey } from '../../remote/helpers/index.ts';
import type { RemoteExecuteContext } from '../types.ts';
import { settleRemoteRun } from './settle.ts';
import { startRemoteRun } from './start.ts';

/**
 * One execution of a claimed, `running` stand-in run of a remote agent. No
 * model call and no step of its own: with a recorded outcome
 * (`remote-wait:<runId>`) it settles the run; else it starts the remote run
 * through the start effect (`remote-start:<runId>`, the local run id as the
 * idempotency key, so a resend after a lost answer reaches the same remote
 * run, and a recorded start is never sent again) and pauses on a `remote`
 * wait point that expires at the remote deadline (`createdAt + timeoutMs`).
 * A start rejected with a ValidationError fails the run; any other
 * rejection, and a store failure while recording the start or pausing, ends
 * only the execution (onError), and recovery retries once the claim expired,
 * until the remote deadline passed: then the run fails with Timeout. A
 * cancel during an in-flight start settles the run at once; the start
 * finishes detached and cancels the remote run (cancelRemoteStart()).
 */
export async function executeRemoteRun(ctx: RemoteExecuteContext): Promise<void> {
    const {
        run,
        agent,
        effectService,
    } = ctx;
    const outcome = readRemoteOutcome((await effectService.findOne(remoteWaitKey(run.id)))?.result);

    if (outcome) {
        await settleRemoteRun(ctx, outcome);

        return;
    }

    const remoteRunId = await startRemoteRun(ctx);

    if (remoteRunId === undefined) {
        return;
    }

    try {
        await ctx.pause({
            kind: 'remote',
            id: 'remote',
            peer: agent.definition.peer,
            agent: agent.definition.agent,
            remoteRunId,
            // the deadline of the whole remote run: a start retried by recovery does not extend it
            timeoutMs: Math.max(0, run.createdAt.getTime() + agent.definition.timeoutMs - ctx.clock.now()),
        }, { ...run.usage });
    } catch (error) {
        // the start is recorded: recovery re-pauses on the same remote run without sending it again
        ctx.onError(error, run);
    }
}
