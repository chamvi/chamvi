/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { z } from 'zod';
import { AGENT_NAME_MAX_LENGTH } from '../../domains/agent/constants.ts';
import { isAgentName } from '../../domains/agent/helpers.ts';
import { reportInvalid } from './report.ts';

/** A string of `min` to `max` characters without U+0000 (which Postgres text columns refuse). */
export function stringSchema({ min = 0, max }: { min?: number; max: number }) {
    return z.custom<string>().check((ctx) => {
        const { value } = ctx;

        if (typeof value !== 'string' || value.length < min || value.length > max) {
            reportInvalid(ctx, `must be a string of ${min} to ${max} characters`);
        } else if (value.includes('\0')) {
            reportInvalid(ctx, 'must not contain a NUL character');
        }
    });
}

export function booleanSchema() {
    return z.custom<boolean>().check((ctx) => {
        if (typeof ctx.value !== 'boolean') {
            reportInvalid(ctx, 'must be a boolean');
        }
    });
}

/** A name under the agent-name rule: agent, channel and role names. */
export function nameSchema() {
    return z.custom<string>().check((ctx) => {
        if (!isAgentName(ctx.value)) {
            reportInvalid(
                ctx,
                `must be lowercase letters and digits in words joined by single hyphens, at most ${AGENT_NAME_MAX_LENGTH} characters`,
            );
        }
    });
}

/** An integer from `min` to `max`. */
export function integerSchema({ min, max }: { min: number; max: number }) {
    return z.custom<number>().check((ctx) => {
        const { value } = ctx;

        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
            reportInvalid(ctx, `must be an integer from ${min} to ${max}`);
        }
    });
}

/** Any value except `undefined` (`null` is allowed). */
export function definedSchema() {
    return z.unknown().check((ctx) => {
        if (ctx.value === undefined) {
            // an `invalid_type` on an undefined value is the one zod issue `@validup/zod` maps to `required`;
            // no `expected`, which it would pass through to the issue
            // Upstream: pending
            ctx.issues.push({
                code: 'invalid_type',
                input: ctx.value,
                message: 'is required',
            } as z.core.$ZodRawIssue);
        }
    });
}
