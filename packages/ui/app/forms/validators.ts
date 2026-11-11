/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode } from '@ebec/core';
import { createValidupError, defineValidator } from 'validup';
import type { ValidatorDescriptor } from 'validup';
import { parsePayload } from '../agents/helpers.ts';

/** A string with more than whitespace in it; returns it trimmed. Never echoes the value (a token goes through here). */
export function isFilled(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || value.trim() === '') {
                throw createValidupError(undefined, IssueCode.REQUIRED, 'is required');
            }

            return value.trim();
        },
    });
}

/** A run payload as `parsePayload` reads it: JSON, or empty for `{}`. Returns the parsed value. */
export function isPayload(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            const parsed = parsePayload(typeof value === 'string' ? value : '');

            if (!parsed.ok) {
                throw createValidupError(undefined, IssueCode.JSON, parsed.message);
            }

            return parsed.value;
        },
    });
}
