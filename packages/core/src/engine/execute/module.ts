/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunExecution } from './run/module.ts';
import type { ExecuteContext, ExecutionGate } from './types.ts';

/**
 * One execution of a claimed, `running` run: first runs the tool calls a
 * suspended approve() or waitForDispatch() left pending in the latest
 * checkpoint (pausing again, without a model call, when one suspends again),
 * then streams a ToolLoopAgent from there (emitting text and reasoning
 * deltas), checkpoints every step and settles the run, or pauses it on the
 * first call that suspended. Its ToolContext writes nothing once the
 * execution ended (its gate, set where it settles or pauses and on a throw),
 * except from a call that has not settled yet.
 */
export async function executeRun(ctx: ExecuteContext): Promise<void> {
    const gate: ExecutionGate = { ended: false };
    // every settle and pause runs after the step-end and pending-call writes in flight landed
    const gated: ExecuteContext = {
        ...ctx,
        finish: (patch) => {
            gate.ended = true;

            return ctx.finish(patch);
        },
        pause: (request, usage) => {
            gate.ended = true;

            return ctx.pause(request, usage);
        },
    };

    try {
        await new RunExecution(gated, gate).run();
    } finally {
        gate.ended = true;
    }
}
