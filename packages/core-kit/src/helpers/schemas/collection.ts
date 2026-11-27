/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { z } from 'zod';
import { reportInvalid } from './report.ts';

/**
 * An array of at most `max` items, each through `item`. The length is
 * checked before any item, so an oversized list costs one issue; item
 * issues carry the item's index in their path.
 */
export function arraySchema<T extends z.ZodType>(item: T, { max, noun }: { max: number; noun: string }) {
    return z
        .custom<unknown[]>()
        .check((ctx) => {
            if (!Array.isArray(ctx.value) || ctx.value.length > max) {
                reportInvalid(ctx, `must be an array of at most ${max} ${noun}`);
            }
        })
        .pipe(z.array(item));
}

/** An object of `shape`, read as an empty one when it is none; unknown keys are dropped. */
export function objectSchema<T extends z.core.$ZodLooseShape>(shape: T) {
    return z.preprocess((value) => (isObject(value) ? value : {}), z.object(shape));
}
