/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AGENT_NAME_MAX_LENGTH, AGENT_NAME_PATTERN, DISPATCH_DEPTH_MAX } from '@chamvi/core-kit';
import type { ChannelSubscription } from '../../channel/types.ts';
import { InvalidAgentDefinitionError } from '../../errors/index.ts';
import {
    DEFAULT_DISPATCH_MAX_DEPTH,
    DEFAULT_MAX_DISPATCHES_PER_RUN,
} from '../constants.ts';

/** `maxPerRun` or its default; InvalidAgentDefinitionError for a value that is no positive safe integer. */
export function checkDispatchMaxPerRun(label: string, value: unknown): number {
    if (value === undefined) {
        return DEFAULT_MAX_DISPATCHES_PER_RUN;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new InvalidAgentDefinitionError(`${label}: maxPerRun must be a positive integer.`);
    }

    return value;
}

/** `maxDepth` or its default; InvalidAgentDefinitionError outside 1 to DISPATCH_DEPTH_MAX. */
export function checkDispatchMaxDepth(label: string, value: unknown): number {
    if (value === undefined) {
        return DEFAULT_DISPATCH_MAX_DEPTH;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > DISPATCH_DEPTH_MAX) {
        throw new InvalidAgentDefinitionError(`${label}: maxDepth must be an integer from 1 to ${DISPATCH_DEPTH_MAX}.`);
    }

    return value;
}

/** Whether `entry` is an agent name or a remote caller `<peer>/<agent>`, each part by the agent-name rule. */
function isFromEntry(entry: unknown): boolean {
    if (typeof entry !== 'string') {
        return false;
    }

    const parts = entry.split('/');

    return parts.length <= 2 && parts.every((part) => part.length <= AGENT_NAME_MAX_LENGTH && AGENT_NAME_PATTERN.test(part));
}

/**
 * A copy of `from` (agent names, or `<peer>/<agent>` for a remote caller);
 * InvalidAgentDefinitionError for no array or an entry whose parts break the agent-name rule.
 */
export function checkDispatchFrom(label: string, value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new InvalidAgentDefinitionError(`${label}: from must be an array of agent names.`);
    }

    for (const entry of value) {
        if (!isFromEntry(entry)) {
            throw new InvalidAgentDefinitionError(
                `${label}: from entry "${String(entry)}" must be an agent name or <peer>/<agent>, each matching ${AGENT_NAME_PATTERN} and at most ${AGENT_NAME_MAX_LENGTH} characters.`,
            );
        }
    }

    return [...value as string[]];
}

/** `description` as given; InvalidAgentDefinitionError for a value that is no non-empty string. */
export function checkDispatchDescription(label: string, value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new InvalidAgentDefinitionError(`${label}: description must be a non-empty string.`);
    }

    return value;
}

/** Refuses a role hook (`concurrencyKey`, `idempotencyKey`, `address`) that is given but no function. */
export function checkDispatchHooks(label: string, subscription: Record<string, unknown>): void {
    for (const hook of ['concurrencyKey', 'idempotencyKey', 'address']) {
        if (subscription[hook] !== undefined && typeof subscription[hook] !== 'function') {
            throw new InvalidAgentDefinitionError(`${label}: ${hook} must be a function.`);
        }
    }
}

export function roleLabel(agent: string, role: string): string {
    return `Agent "${agent}" role "${role}"`;
}

/** The role's `maxPerRun`, re-checked (a subscription built by hand, or options changed after agent.on()). */
export function maxPerRunOf(agent: string, subscription: ChannelSubscription): number {
    return checkDispatchMaxPerRun(roleLabel(agent, subscription.id), (subscription.options as Record<string, unknown> | undefined)?.maxPerRun);
}

/** The role's `maxDepth`, re-checked like maxPerRunOf(). */
export function maxDepthOf(agent: string, subscription: ChannelSubscription): number {
    return checkDispatchMaxDepth(roleLabel(agent, subscription.id), (subscription.options as Record<string, unknown> | undefined)?.maxDepth);
}

/** The role's `from`, re-checked like maxPerRunOf() (undefined: only the own agent may dispatch). */
export function fromOf(agent: string, subscription: ChannelSubscription): string[] | undefined {
    return checkDispatchFrom(roleLabel(agent, subscription.id), (subscription.options as Record<string, unknown> | undefined)?.from);
}
