/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { z } from 'zod';
import { reportInvalid } from './report.ts';

/*
 * Connection bodies carry secrets and may place them anywhere: these
 * schemas never echo a value.
 */

/** A plain object, with its values left to the caller. */
export function recordSchema() {
    return z.custom<Record<string, unknown>>().check((ctx) => {
        if (!isObject(ctx.value)) {
            reportInvalid(ctx, 'must be an object', false);
        }
    });
}

/** A string of 1 to `max` characters; without `allowNul` U+0000 is refused too, under the same message. */
export function opaqueStringSchema({ max, allowNul }: { max: number; allowNul: boolean }) {
    return z.custom<string>().check((ctx) => {
        const { value } = ctx;

        if (typeof value !== 'string' || value.length === 0 || value.length > max || (!allowNul && value.includes('\0'))) {
            reportInvalid(ctx, `must be a string of 1 to ${max} characters`, false);
        }
    });
}

/** A non-negative integer. */
export function revisionSchema() {
    return z.custom<number>().check((ctx) => {
        if (!Number.isSafeInteger(ctx.value) || (ctx.value as number) < 0) {
            reportInvalid(ctx, 'must be a non-negative integer', false);
        }
    });
}

/** `{ set?: { <field>: string }, clear?: string[] }` of a save; other keys are dropped. */
export function secretsWriteSchema() {
    return z.unknown().transform((value, ctx) => {
        const fail = (message: string) => {
            ctx.issues.push({
                code: 'custom',
                input: value,
                message,
            });

            return z.NEVER;
        };

        if (!isObject(value)) {
            return fail('must be an object');
        }

        const { set, clear } = value;

        if (set !== undefined && !isObject(set)) {
            return fail('set must be an object');
        }

        const isNameList = Array.isArray(clear) && clear.every((field) => typeof field === 'string');

        if (clear !== undefined && !isNameList) {
            return fail('clear must be an array of field names');
        }

        return {
            ...(set !== undefined && { set: set as Record<string, string> }),
            ...(clear !== undefined && { clear: clear as string[] }),
        };
    });
}
