/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool, ToolSet } from 'ai';
import { jsonSchema } from 'ai';
import { isObject } from 'smob';
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../agent/constants.ts';
import { APPROVAL_TIMEOUT_MAX_MS } from '../approval/constants.ts';
import type { ChannelSubscription } from '../channel/types.ts';
import { InvalidAgentDefinitionError, InvalidRunStateError } from '../errors/index.ts';
import { defineTool } from '../tool/define.ts';
import { AGENT_CHANNEL_NAME } from '../channel/constants.ts';
import { DISPATCH_TOOL, DISPATCH_TOOL_NAME_MAX_LENGTH } from './constants.ts';
import type { DispatchToolTarget, DispatchToolsOptions, DispatchWaitOptions } from './types.ts';

const LABEL = 'dispatchTools()';

function checkName(kind: 'role' | 'agent', value: unknown): string {
    if (typeof value !== 'string' || value.length > NAME_MAX_LENGTH || !NAME_PATTERN.test(value)) {
        throw new InvalidAgentDefinitionError(
            `${LABEL}: ${kind} "${String(value)}" must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`,
        );
    }

    return value;
}

function checkRoles(value: unknown, where: string): string[] {
    if (!Array.isArray(value)) {
        throw new InvalidAgentDefinitionError(`${LABEL}: ${where} must be an array of role names.`);
    }

    return value.map((role) => checkName('role', role));
}

function checkWait(value: unknown): false | DispatchWaitOptions {
    if (value === undefined || value === false) {
        return false;
    }

    if (value === true) {
        return {};
    }

    if (!isObject(value)) {
        throw new InvalidAgentDefinitionError(`${LABEL}: wait must be a boolean or { timeoutMs }.`);
    }

    const { timeoutMs } = value as DispatchWaitOptions;

    if (timeoutMs === undefined) {
        return {};
    }

    if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > APPROVAL_TIMEOUT_MAX_MS) {
        throw new InvalidAgentDefinitionError(`${LABEL}: wait.timeoutMs must be an integer from 1 to ${APPROVAL_TIMEOUT_MAX_MS}.`);
    }

    return { timeoutMs };
}

function placeholder(name: string, target: DispatchToolTarget): Tool {
    const tool = defineTool<unknown, unknown>({
        description: target.agent ?
            `Starts a run of agent "${target.agent}" role "${target.role}".` :
            `Starts a run of role "${target.role}".`,
        inputSchema: jsonSchema({ type: 'object' }),
        execute: async () => {
            throw new InvalidRunStateError(`Dispatch tool "${name}" runs only as a tool of a chamvi agent (it is bound per execution).`);
        },
    });

    return Object.assign(tool, { [DISPATCH_TOOL]: target });
}

/**
 * One tool per `agent.on()` role: `dispatch_<role>` for the calling agent's
 * own `roles` (dispatch()), `dispatch_<agent>_<role>` for other `agents`
 * (dispatchTo()). The tools are placeholders the engine binds per execution
 * to the role's live schema, description and hooks; spread them into an
 * agent's `tools` (a plain set or a factory's result). With `wait` each tool
 * waits for its child and returns the DispatchOutcome. A tool spread over
 * another of the same name replaces it (the spread order decides). Throws
 * InvalidAgentDefinitionError for no roles, a role or agent breaking the
 * name rule, a name over 64 characters, a duplicate name or a bad `wait`.
 */
export function dispatchTools(options: DispatchToolsOptions): ToolSet {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError(`${LABEL} needs { roles } or { agents }.`);
    }

    const wait = checkWait(options.wait);
    const targets: [string, DispatchToolTarget][] = [];

    for (const role of options.roles === undefined ? [] : checkRoles(options.roles, 'roles')) {
        targets.push([`dispatch_${role}`, { role, wait }]);
    }

    if (options.agents !== undefined && !Array.isArray(options.agents)) {
        throw new InvalidAgentDefinitionError(`${LABEL}: agents must be an array of { agent, roles }.`);
    }

    for (const entry of options.agents ?? []) {
        if (!isObject(entry)) {
            throw new InvalidAgentDefinitionError(`${LABEL}: agents must be an array of { agent, roles }.`);
        }

        const name = checkName('agent', entry.agent);

        for (const role of checkRoles(entry.roles, `agent "${name}" roles`)) {
            targets.push([`dispatch_${name}_${role}`, {
                agent: name, 
                role, 
                wait, 
            }]);
        }
    }

    if (targets.length === 0) {
        throw new InvalidAgentDefinitionError(`${LABEL} needs at least one role in roles or agents.`);
    }

    const tools: ToolSet = {};

    for (const [name, target] of targets) {
        if (name.length > DISPATCH_TOOL_NAME_MAX_LENGTH) {
            throw new InvalidAgentDefinitionError(
                `${LABEL}: tool name "${name}" is longer than ${DISPATCH_TOOL_NAME_MAX_LENGTH} characters.`,
            );
        }

        if (name in tools) {
            throw new InvalidAgentDefinitionError(`${LABEL}: tool "${name}" is generated twice.`);
        }

        tools[name] = placeholder(name, target);
    }

    return tools;
}

/** The placeholder's target, if `tool` is a dispatchTools() placeholder. */
export function dispatchToolTarget(tool: unknown): DispatchToolTarget | undefined {
    return isObject(tool) ? (tool as { [DISPATCH_TOOL]?: DispatchToolTarget })[DISPATCH_TOOL] : undefined;
}

/**
 * Refuses a placeholder for an own role `channels` does not declare
 * (defineAgent's eager check of a plain tool set).
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
