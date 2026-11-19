/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { assertTriggerKey } from '@chamvi/core';
import { BadRequestError } from '@ebec/http';
import { KEY_MAX_LENGTH } from '../constants.ts';

/** An `Idempotency-Key` header value (`null`: absent): 1 to `KEY_MAX_LENGTH` characters, else 400. */
export function readIdempotencyHeader(value: string | null): string | undefined {
    if (value === null) {
        return undefined;
    }

    if (value.length < 1 || value.length > KEY_MAX_LENGTH) {
        throw new BadRequestError({ message: `The Idempotency-Key header must have 1 to ${KEY_MAX_LENGTH} characters.` });
    }

    return value;
}

/** A key a trigger derived from the payload: core's `assertTriggerKey` (400 `validation_error`). */
export function assertDerivedKey(name: string, value: string | undefined): void {
    assertTriggerKey(`${name} derived from the payload`, value);
}
