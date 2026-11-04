/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ToolSet } from 'ai';
import type { Agent } from '../agent/types.ts';
import { defineTool } from '../tool/define.ts';
import { dispatchToolTarget, findDispatchRole } from './helpers.ts';
import { toRoleToolInput } from './schema.ts';
import { dispatch, dispatchTo } from './start.ts';
import type { DispatchToolTarget, RoleToolInput } from './types.ts';
import { waitForDispatch } from './wait.ts';

/** Converted role schemas per agent object and role, so a replaced agent (putAgent) converts again. */
const inputs = new WeakMap<Agent, Map<string, Promise<RoleToolInput>>>();

function roleLabel(agent: string, role: string): string {
    return `Agent "${agent}" role "${role}"`;
}

function inputOf(agent: Agent, role: string, schema: StandardSchemaV1 | undefined): Promise<RoleToolInput> {
    let roles = inputs.get(agent);

    if (!roles) {
        roles = new Map();
        inputs.set(agent, roles);
    }

    let input = roles.get(role);

    if (!input) {
        input = toRoleToolInput(roleLabel(agent.name, role), schema);
        roles.set(role, input);
    }

    return input;
}

async function bindOne(target: DispatchToolTarget, self: Agent, getAgent: (name: string) => Agent | undefined) {
    const name = target.agent ?? self.name;
    const agent = target.agent === undefined ? self : getAgent(target.agent);
    const subscription = agent ? findDispatchRole(agent, target.role) : undefined;
    const options = subscription?.options as { schema?: StandardSchemaV1; description?: unknown } | undefined;
    // an unknown target or role keeps the tool: its call is dispatch()'s ValidationError tool error
    const { inputSchema, toPayload } = agent && subscription ?
        await inputOf(agent, target.role, options?.schema) :
        await toRoleToolInput(roleLabel(name, target.role), undefined);
    const { wait } = target;
    // a role's own description cannot know whether this caller waits, so the wait is stated after it
    const description = typeof options?.description === 'string' ?
        `${options.description}${wait ? ' The tool waits for the run and returns how it ended.' : ''}` :
        `Starts a run of agent "${name}" role "${target.role}"${wait ? ', then waits for it and returns how it ended' : ''}.`;

    return defineTool<unknown, unknown>({
        description,
        inputSchema,
        // an internal destination: the child inherits the parent's taint and invoker
        trust: { taint: false, guardWhenTainted: false },
        execute: async (input, { context }) => {
            const payload = toPayload(input);
            const result = target.agent === undefined ?
                await dispatch(context, { role: target.role, payload }) :
                await dispatchTo(context, {
                    agent: target.agent,
                    role: target.role,
                    payload,
                });

            if (!wait) {
                return result;
            }

            return waitForDispatch(context, result, wait.timeoutMs === undefined ? undefined : { timeoutMs: wait.timeoutMs });
        },
    });
}

/**
 * `tools` with every dispatchTools() placeholder replaced by a concrete tool
 * for the role as registered now: own roles from `self`, other agents' from
 * `getAgent` (the live registry). The role schema is the tool input
 * (converted once per agent object and role); a target agent or role not
 * registered keeps the tool with an untyped `payload`, its call answered by
 * dispatch()'s ValidationError. Other tools are kept as they are. Throws
 * InvalidAgentDefinitionError for a role schema that cannot be converted.
 */
export async function bindDispatchTools(
    tools: ToolSet,
    self: Agent,
    getAgent: (name: string) => Agent | undefined,
): Promise<ToolSet> {
    const out: ToolSet = {};

    for (const [name, tool] of Object.entries(tools)) {
        const target = dispatchToolTarget(tool);

        out[name] = target ? await bindOne(target, self, getAgent) : tool;
    }

    return out;
}
