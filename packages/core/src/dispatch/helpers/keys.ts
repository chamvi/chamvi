/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { createHash } from 'node:crypto';
import { TRIGGER_KEY_MAX_LENGTH } from '@chamvi/core-kit';

/**
 * The idempotency key a dispatch claims: `dispatch:<role>:<key>` (the roles
 * of one agent share its claim scope), or `sha256:<hex>` of it above 255 characters.
 */
export function dispatchClaimKey(role: string, key: string): string {
    const prefixed = `dispatch:${role}:${key}`;

    if (prefixed.length <= TRIGGER_KEY_MAX_LENGTH) {
        return prefixed;
    }

    return `sha256:${createHash('sha256').update(prefixed).digest('hex')}`;
}

/** A given key: a non-empty string without NUL (the idempotency key may be long, it is hashed). */
export function assertDispatchKey(name: string, value: unknown, bounded: boolean): asserts value is string | undefined {
    if (value === undefined) {
        return;
    }

    if (typeof value === 'string' && value.length > 0 && !value.includes('\0') &&
        (!bounded || value.length <= TRIGGER_KEY_MAX_LENGTH)) {
        return;
    }

    const bound = bounded ? ` of at most ${TRIGGER_KEY_MAX_LENGTH} characters` : '';
    throw new ValidationError(`The dispatch ${name} must be a non-empty string${bound} without NUL.`);
}

/** The effect key of a dispatch wait's recorded outcomes. */
export function waitRecordKey(runId: string, waitId: string): string {
    return `dispatch-wait:${runId}:${waitId}`;
}
