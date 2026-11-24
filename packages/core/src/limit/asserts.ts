/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { isObject } from 'smob';
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../agent/constants.ts';
import { APPROVAL_TIMEOUT_MAX_MS } from '../approval/constants.ts';
import { InvalidAgentDefinitionError, ValidationError } from '../errors/index.ts';
import { LIMIT_KEY_MAX_LENGTH, LIMIT_WEIGHT_MAX } from './constants.ts';
import type { AgentLimits, ToolLimit } from './types.ts';

const TOOL_LIMIT_KEYS = ['max', 'windowMs', 'onExceed', 'bucket', 'weight', 'detail'];

/** The tool limit keys that take a function only. */
const TOOL_LIMIT_HOOKS = ['weight', 'detail'];

function isPositiveSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/** An integer from 1 to LIMIT_WEIGHT_MAX: a `max` or a call's weight, so their sums stay far from unsafe. */
function isLimitAmount(value: unknown): value is number {
    return isPositiveSafeInteger(value) && value <= LIMIT_WEIGHT_MAX;
}

/**
 * Refuses a tool `limit` that is no object of the known keys with valid
 * values (InvalidAgentDefinitionError naming the tool): a misspelled key or
 * a string `max` would otherwise leave the tool silently unlimited.
 */
export function assertToolLimit(limit: unknown, name?: string): asserts limit is ToolLimit | undefined {
    if (limit === undefined) {
        return;
    }

    const label = name === undefined ? 'a tool' : `tool "${name}"`;

    if (!isObject(limit)) {
        throw new InvalidAgentDefinitionError(`The limit of ${label} must be an object of max and windowMs.`);
    }

    for (const [key, value] of Object.entries(limit)) {
        if (!TOOL_LIMIT_KEYS.includes(key)) {
            throw new InvalidAgentDefinitionError(`The limit of ${label} has an unknown key "${key}" (${TOOL_LIMIT_KEYS.join(', ')}).`);
        }

        if (TOOL_LIMIT_HOOKS.includes(key) && value !== undefined && typeof value !== 'function') {
            throw new InvalidAgentDefinitionError(`The limit hook "${key}" of ${label} must be a function.`);
        }
    }

    const {
        max,
        windowMs,
        onExceed,
        bucket,
    } = limit as Record<string, unknown>;

    if (!isLimitAmount(max)) {
        throw new InvalidAgentDefinitionError(`The limit max of ${label} must be an integer from 1 to ${LIMIT_WEIGHT_MAX}.`);
    }

    if (!isPositiveSafeInteger(windowMs) || windowMs > APPROVAL_TIMEOUT_MAX_MS) {
        throw new InvalidAgentDefinitionError(`The limit windowMs of ${label} must be an integer from 1 to ${APPROVAL_TIMEOUT_MAX_MS}.`);
    }

    if (onExceed !== undefined && onExceed !== 'approve' && onExceed !== 'deny') {
        throw new InvalidAgentDefinitionError(`The limit onExceed of ${label} must be "approve" or "deny".`);
    }

    if (bucket !== undefined && (typeof bucket !== 'string' || bucket.length > NAME_MAX_LENGTH || !NAME_PATTERN.test(bucket))) {
        throw new InvalidAgentDefinitionError(
            `The limit bucket of ${label} must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`,
        );
    }
}

/** Refuses agent `limits` that are no record of valid tool limits or `false` (InvalidAgentDefinitionError). */
export function assertAgentLimits(limits: unknown): asserts limits is AgentLimits | undefined {
    if (limits === undefined) {
        return;
    }

    if (!isObject(limits)) {
        throw new InvalidAgentDefinitionError('limits must be a record of tool limits or false.');
    }

    for (const [name, limit] of Object.entries(limits)) {
        if (limit === false) {
            continue;
        }

        if (limit === undefined) {
            throw new InvalidAgentDefinitionError(`The limit of tool "${name}" must be an object of max and windowMs, or false.`);
        }

        assertToolLimit(limit, name);
    }
}

/** A scope or key of a limit use: a string of at most 255 characters without NUL (ValidationError). */
export function assertLimitKey(name: string, value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length > LIMIT_KEY_MAX_LENGTH || value.includes('\0')) {
        throw new ValidationError(`A limit ${name} must be a string of at most ${LIMIT_KEY_MAX_LENGTH} characters without NUL.`);
    }
}

/** A call's weight: an integer from 1 to LIMIT_WEIGHT_MAX (ValidationError naming the tool, nothing is counted). */
export function assertLimitWeight(name: string, weight: unknown): asserts weight is number {
    if (!isLimitAmount(weight)) {
        throw new ValidationError(`The limit weight of tool "${name}" must be an integer from 1 to ${LIMIT_WEIGHT_MAX}.`);
    }
}

/**
 * Refuses a `limits` key that names no tool of `tools` (InvalidAgentDefinitionError):
 * a misspelled name would leave the tool silently unlimited. `tools`
 * undefined (a factory, state or skills add tools later) checks nothing.
 */
export function assertLimitedTools(agent: string, limits: AgentLimits | undefined, tools: ToolSet | undefined): void {
    if (!limits || !tools) {
        return;
    }

    for (const name of Object.keys(limits)) {
        if (!Object.hasOwn(tools, name)) {
            throw new InvalidAgentDefinitionError(`Agent "${agent}" limits tool "${name}", which it does not have.`);
        }
    }
}

/**
 * Refuses a weight a limit use cannot store (ValidationError): no integer
 * from 1 to LIMIT_WEIGHT_MAX (the database column is an `integer`).
 */
export function assertLimitUseWeight(weight: unknown): void {
    if (!isLimitAmount(weight)) {
        throw new ValidationError(`A limit use's weight must be an integer from 1 to ${LIMIT_WEIGHT_MAX}.`);
    }
}

/** Refuses a window a limit cannot have (ValidationError): no integer from 1 to APPROVAL_TIMEOUT_MAX_MS. */
export function assertLimitWindow(windowMs: unknown): void {
    if (!isPositiveSafeInteger(windowMs) || windowMs > APPROVAL_TIMEOUT_MAX_MS) {
        throw new ValidationError(`A limit window must be an integer from 1 to ${APPROVAL_TIMEOUT_MAX_MS} milliseconds.`);
    }
}
