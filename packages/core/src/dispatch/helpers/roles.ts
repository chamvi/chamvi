/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { isObject } from 'smob';
import type { Agent } from '../../agent/types.ts';
import { AGENT_CHANNEL_NAME } from '../../channel/constants.ts';
import { assertChannelName } from '../../channel/helpers.ts';
import type { ChannelSubscription } from '../../channel/types.ts';
import { InvalidAgentDefinitionError } from '../../errors/index.ts';
import { DISPATCH_TOOL } from '../constants.ts';
import type { DispatchToolTarget } from '../types.ts';
import {
    checkDispatchDescription,
    checkDispatchFrom,
    checkDispatchHooks,
    checkDispatchMaxDepth,
    checkDispatchMaxPerRun,
    roleLabel,
} from './subscription.ts';

/** The agent's `agent.on()` subscription for `role` (channel `agent`, id = role), if any. */
export function findDispatchRole(agent: Agent, role: string): ChannelSubscription | undefined {
    return agent.definition.channels?.find((s) => s.channel === AGENT_CHANNEL_NAME && s.id === role);
}

/** Whether the agent declares any `agent.on()` role (a subscription to channel `agent`). */
export function declaresDispatchRole(agent: Agent): boolean {
    return agent.definition.channels?.some((s) => s.channel === AGENT_CHANNEL_NAME) ?? false;
}

/** Refuses an agent with an invalid role: id, `maxPerRun`, `maxDepth`, `from` or `description` (the engine's registration check). */
export function assertDispatchRoles(agent: Agent): void {
    for (const subscription of agent.definition.channels ?? []) {
        if (subscription.channel !== AGENT_CHANNEL_NAME) {
            continue;
        }

        assertChannelName(subscription.id);

        const label = roleLabel(agent.name, subscription.id);
        const options = subscription.options as Record<string, unknown> | undefined;

        checkDispatchMaxPerRun(label, options?.maxPerRun);
        checkDispatchMaxDepth(label, options?.maxDepth);
        checkDispatchFrom(label, options?.from);
        checkDispatchDescription(label, options?.description);
        checkDispatchHooks(label, subscription as unknown as Record<string, unknown>);
    }
}

/** The placeholder's target, if `tool` is a dispatchTools() placeholder. */
export function dispatchToolTarget(tool: unknown): DispatchToolTarget | undefined {
    return isObject(tool) ? (tool as { [DISPATCH_TOOL]?: DispatchToolTarget })[DISPATCH_TOOL] : undefined;
}

/**
 * Refuses a placeholder for an own role `channels` does not declare
 * (defineModelAgent's eager check of a plain tool set).
 */
export function assertOwnDispatchRoles(agent: string, channels: ChannelSubscription[] | undefined, tools: ToolSet): void {
    for (const [name, tool] of Object.entries(tools)) {
        const target = dispatchToolTarget(tool);

        if (!target || target.agent !== undefined) {
            continue;
        }

        const declared = channels?.some((s) => s.channel === AGENT_CHANNEL_NAME && s.id === target.role) ?? false;

        if (!declared) {
            throw new InvalidAgentDefinitionError(`Agent "${agent}" has no dispatch role "${target.role}" for tool "${name}".`);
        }
    }
}

/**
 * Refuses a placeholder in `tools` whose name another tool of the merged
 * set (`others`: state tools, skill tools) carries, instead of one
 * silently replacing the other.
 */
export function assertNoDispatchCollision(agent: string, tools: ToolSet, others: ToolSet[]): void {
    for (const [name, tool] of Object.entries(tools)) {
        const taken = others.some((set) => Object.hasOwn(set, name));

        if (taken && dispatchToolTarget(tool)) {
            throw new InvalidAgentDefinitionError(`Agent "${agent}": dispatch tool "${name}" collides with another tool of that name.`);
        }
    }
}
