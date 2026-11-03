/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { isObject } from 'smob';
import { CONVERSATION_FIELD_MAX_LENGTH } from '../conversation/constants.ts';
import type { AgentDefinition } from './types.ts';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { hasToolContext } from '../tool/helpers.ts';

/** Fields a code agent (one with `run`) does not take. */
const CODE_AGENT_REFUSED = ['model', 'instructions', 'skills', 'output', 'conversation', 'toolsContext'] as const;

/**
 * A code agent's `run` is a function, it declares none of the model-only
 * fields and its `tools` is a plain set (InvalidAgentDefinitionError).
 */
export function assertCodeAgent(def: AgentDefinition): void {
    if (typeof def.run !== 'function') {
        throw new InvalidAgentDefinitionError(`Agent "${def.name}": "run" must be a function.`);
    }

    const fields = def as Record<string, unknown>;

    for (const field of CODE_AGENT_REFUSED) {
        if (fields[field] !== undefined) {
            throw new InvalidAgentDefinitionError(`Agent "${def.name}": "${field}" is not allowed on a code agent (one with "run").`);
        }
    }

    if (typeof def.tools === 'function') {
        throw new InvalidAgentDefinitionError(`Agent "${def.name}": "tools" of a code agent must be a plain tool set, not a factory.`);
    }
}

/** `description`, when given, is a non-empty string. */
export function assertDescription(def: AgentDefinition): void {
    if (def.description !== undefined && (typeof def.description !== 'string' || def.description.trim().length === 0)) {
        throw new InvalidAgentDefinitionError(`Agent "${def.name}": "description" must be a non-empty string.`);
    }
}

/**
 * Every own key of `toolsContext` must name a tool of `tools` that is not a
 * chamvi tool (those get the run context instead); anything else is a
 * misconfiguration, never silently dropped.
 */
export function assertToolsContext(agent: string, tools: ToolSet, toolsContext: Record<string, unknown>): void {
    for (const name of Object.keys(toolsContext)) {
        const tool = Object.hasOwn(tools, name) ? tools[name] : undefined;

        if (!tool) {
            throw new InvalidAgentDefinitionError(
                `Agent "${agent}": toolsContext entry "${name}" names no tool of the agent.`,
            );
        }

        if (hasToolContext(tool)) {
            throw new InvalidAgentDefinitionError(
                `Agent "${agent}": toolsContext entry "${name}" names a chamvi tool, which gets the run context instead.`,
            );
        }
    }
}

/**
 * No tool may declare the AI SDK's own `needsApproval` (`false` aside):
 * nothing answers that request, so a gate belongs in the agent's hooks.
 */
export function assertNoNeedsApproval(agent: string, tools: ToolSet): void {
    for (const [name, tool] of Object.entries(tools)) {
        const { needsApproval } = tool as { needsApproval?: unknown };

        if (needsApproval !== undefined && needsApproval !== false) {
            throw new InvalidAgentDefinitionError(
                `Agent "${agent}": tool "${name}" declares needsApproval, which nothing answers; gate it in the agent's beforeToolExecution hook instead.`,
            );
        }
    }
}

/** `budget.maxSubtreeTokens`, when given, is a positive safe integer. */
export function assertSubtreeBudget(agent: string, budget: { maxSubtreeTokens?: unknown } | undefined): void {
    const value = budget?.maxSubtreeTokens;

    if (value === undefined) {
        return;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new InvalidAgentDefinitionError(`Agent "${agent}": budget.maxSubtreeTokens must be a positive integer.`);
    }
}

/** The configured storage namespace, validated before registration or any store write. */
export function conversationKey(def: Pick<AgentDefinition, 'name' | 'conversation'>): string | undefined {
    const value = def.conversation;

    if (value === undefined || value === false) {
        return undefined;
    }

    if (value === true) {
        return def.name;
    }

    if (!isObject(value) || typeof value.key !== 'string' || value.key.trim().length === 0 ||
        value.key.length > CONVERSATION_FIELD_MAX_LENGTH || /[\p{Cc}\p{Cs}]/u.test(value.key)) {
        throw new InvalidAgentDefinitionError(`Agent "${def.name}" needs a boolean conversation option or an object with a valid key.`);
    }

    return value.key;
}
