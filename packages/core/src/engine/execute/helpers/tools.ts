/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StepResult, ToolSet } from 'ai';
import { NoSuchToolError } from 'ai';
import { assertNoNeedsApproval, assertToolsContext } from '../../../agent/asserts.ts';
import { checkConversation, conversationFor } from '../../../conversation/context.ts';
import { bindDispatchTools } from '../../../dispatch/bind.ts';
import { assertNoDispatchCollision, assertOwnDispatchRoles } from '../../../dispatch/helpers/index.ts';
import { wrapToolsForRun } from '../../../effect/wrap.ts';
import { ToolNotAllowedError } from '../../../errors/index.ts';
import { assertLimitedTools } from '../../../limit/asserts.ts';
import type { RunContext } from '../../../run/types.ts';
import { createStateTools } from '../../../state/tools.ts';
import { hasToolContext } from '../../../tool/helpers.ts';
import { assertAgentTrust } from '../../../trust/asserts.ts';
import type { AssembleToolsOptions, ExecuteContext } from '../types.ts';

/**
 * The tools handed to the agent: generated state tools (when the agent declares
 * `state`) merged with the user's tools (a plain set or the factory's result),
 * which win on a name clash. Every tool stays executable, so a call pending
 * on an approval still gets an answer; `activeTools` (the names the
 * agent's toolPolicy allows, undefined without a policy) is what the model is
 * offered. wrapToolsForRun memoizes effects and re-checks the policy per call,
 * so a refused call is a tool error, and runs the agent's hooks around every
 * call; a call approve() suspended is reported to `onSuspend`, and
 * `stepIndex` names the step whose calls run (part of the approval id). `toolsContext`
 * maps every chamvi tool
 * (policy-hidden ones included) to the execution's one ToolContext, plus the
 * agent's own `toolsContext` entries for the other tools, by reference.
 * dispatchTools() placeholders among the user's tools are bound to the
 * roles registered now (bindDispatchTools).
 * Throws InvalidAgentDefinitionError for a misconfigured `toolsContext`,
 * for a tool declaring `needsApproval`, for a placeholder whose name a state
 * or skill tool carries and for a role schema that cannot be converted.
 * `toolContext` is the execution's ToolContext (a simple run hands the same
 * object to run()); once its `gate` ended, a call still running (it ignored
 * its signal) can no longer dispatch, wait, approve or emit.
 */
export async function assembleTools(
    ctx: ExecuteContext,
    runContext: RunContext,
    options: AssembleToolsOptions,
): Promise<{
    tools: ToolSet;
    activeTools?: string[];
    toolsContext: Record<string, unknown>;
}> {
    const {
        tools: userTools,
        state: schema,
        toolPolicy,
        toolsContext: agentToolsContext,
        hooks: agentHooks,
    } = ctx.agent.definition;
    const {
        toolContext,
        gate,
        onSuspend,
        stepIndex,
    } = options;
    const hooks = conversationFor(runContext) ? {
        ...agentHooks,
        beforeToolExecution: async (...args: Parameters<NonNullable<NonNullable<typeof agentHooks>['beforeToolExecution']>>) => {
            await checkConversation(runContext);

            return agentHooks?.beforeToolExecution?.(...args);
        },
    } : agentHooks;

    if (!userTools && !schema && !Object.keys(ctx.skills?.tools ?? {}).length) {
        ctx.skills?.checkTools({});
        assertAgentTrust(ctx.agent.definition.trust, {});
        assertLimitedTools(ctx.agent.name, ctx.agent.definition.limits, {});

        if (agentToolsContext) {
            assertToolsContext(ctx.agent.name, {}, agentToolsContext);
        }

        return { tools: {}, toolsContext: {} };
    }

    const stateTools = schema ? createStateTools(schema) : {};
    const ownTools = typeof userTools === 'function' ? userTools(toolContext) : userTools ?? {};

    assertNoDispatchCollision(ctx.agent.name, ownTools, [stateTools, ctx.skills?.tools ?? {}]);

    // a factory's set is only known here: its own-role placeholders are checked like defineModelAgent checks a plain set
    if (typeof userTools === 'function') {
        assertOwnDispatchRoles(ctx.agent.name, ctx.agent.definition.channels, ownTools);
    }

    const tools: ToolSet = {
        ...stateTools,
        ...await bindDispatchTools(ownTools, ctx.agent, (name) => ctx.engine.getAgent(name)),
    };

    ctx.skills?.checkTools(tools);
    Object.assign(tools, ctx.skills?.tools);

    // a factory's set is only known here: refused like defineModelAgent refuses a plain one
    assertNoNeedsApproval(ctx.agent.name, tools);
    assertAgentTrust(ctx.agent.definition.trust, tools);

    const toolsContext: Record<string, unknown> = {};
    const ended = () => gate.ended;
    const limits = {
        agent: ctx.agent.definition.limits,
        engine: ctx.engine,
    };

    for (const [name, tool] of Object.entries(tools)) {
        if (hasToolContext(tool)) {
            toolsContext[name] = toolContext;
        }
    }

    if (agentToolsContext) {
        assertToolsContext(ctx.agent.name, tools, agentToolsContext);

        for (const [name, value] of Object.entries(agentToolsContext)) {
            toolsContext[name] = value;
        }
    }

    if (!toolPolicy) {
        return {
            tools: wrapToolsForRun(tools, toolContext, ctx.effectService, {
                hooks,
                trust: ctx.agent.definition.trust,
                limits,
                onSuspend,
                stepIndex,
                ended,
            }),
            toolsContext,
        };
    }

    // evaluated at each check with the engine clock, so a date or time policy can change its verdict
    const allow = (name: string) => toolPolicy(name, { run: runContext, now: new Date(ctx.clock.now()) });
    const names = Object.keys(tools);
    const verdicts = await Promise.all(names.map(async (name) => allow(name)));

    return {
        tools: wrapToolsForRun(tools, toolContext, ctx.effectService, {
            allow,
            hooks,
            trust: ctx.agent.definition.trust,
            limits,
            onSuspend,
            stepIndex,
            ended,
        }),
        activeTools: names.filter((_name, index) => verdicts[index] === true),
        toolsContext,
    };
}

/**
 * The error to record for a model's call to a tool the toolPolicy refused: the
 * AI SDK never offered it (not in `activeTools`) and answered the call with a
 * NoSuchToolError; the step records ToolNotAllowedError instead. Undefined for
 * any other tool error, a genuinely unknown tool included.
 */
export function refusedCallError(
    step: StepResult<ToolSet>,
    part: { toolCallId: string; toolName: string },
    tools: ToolSet,
    activeTools: string[] | undefined,
): ToolNotAllowedError | undefined {
    if (!activeTools || !Object.hasOwn(tools, part.toolName) || activeTools.includes(part.toolName)) {
        return undefined;
    }

    // an invalid (unparsable) call carries the parse error
    const call = step.toolCalls.find((c) => c.toolCallId === part.toolCallId);
    const error = call && 'error' in call ? call.error : undefined;

    return NoSuchToolError.isInstance(error) ? new ToolNotAllowedError(part.toolName) : undefined;
}
