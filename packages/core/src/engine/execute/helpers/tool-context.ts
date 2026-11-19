/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createGuardedRunArtifacts } from '../../../artifact/module.ts';
import { createToolChannels } from '../../../channel/helpers.ts';
import { bindProvided } from '../../../context/helpers.ts';
import { assertExecutionActive, currentToolCall } from '../../../effect/frame.ts';
import type { RunContext } from '../../../run/types.ts';
import { createGuardedAgentState } from '../../../state/module.ts';
import type { ToolContext } from '../../../tool/types.ts';
import type { ExecuteContext, ExecutionGate } from '../types.ts';

/**
 * The execution's one ToolContext (`run`, `state`, `artifacts`, `channels`)
 * with the engine's provided values bound, so inject() works on it. Its state
 * and artifact writers write nothing once the execution ended (`gate`,
 * InvalidRunStateError), except from a tool call of this run that has not
 * settled yet (a cleanup after the abort): work a settled call left behind,
 * and writes outside any call, are refused. Reads stay open.
 */
export function createToolContext(ctx: ExecuteContext, runContext: RunContext, gate: ExecutionGate): ToolContext {
    const assertWritable = (name: string) => {
        const frame = currentToolCall();

        if (frame?.runId === ctx.run.id && !frame.abandoned) {
            return;
        }

        assertExecutionActive(gate.ended, ctx.run.id, name);
    };
    const toolContext: ToolContext = {
        run: runContext,
        state: createGuardedAgentState(ctx.agent.name, ctx.agent.definition.state, ctx.stateService, assertWritable),
        artifacts: createGuardedRunArtifacts(ctx.artifactService, { id: ctx.run.id, agent: ctx.run.agent }, ctx.clock, assertWritable),
        channels: createToolChannels(runContext, ctx.effectService, ctx.engine),
    };

    if (ctx.provided) {
        bindProvided(toolContext, ctx.provided);
    }

    return toolContext;
}
