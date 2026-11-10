/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { CONNECTION_TYPE_MAX_LENGTH, DEFAULT_CONNECTION_LEASE_TTL_MS } from './constants.ts';
import type { ConnectionOpenOptions, ConnectionOpenOptionsInput } from './types.ts';

/** The longest delay a timer keeps; Node clamps a longer one to 1 ms. The lease deadline waits a whole ttl. */
const TIMER_MAX_DELAY_MS = 2_147_483_647;

/** The store lock that leases a connection. */
export const lockKeyOf = (name: string) => `connection:${name}`;

/** The AAD wrapping a connection's data key (the same string as its lock key). */
export const dataKeyContextOf = (name: string) => `connection:${name}`;

/** The AAD of one entry: a sealed value opens only under its own connection and key. */
export const entryAadOf = (name: string, key: string) => `${name}\0${key}`;

/** The AAD of one secret: entry keys hold no NUL, so `secret\0<field>` is no entry key. */
export const secretAadOf = (name: string, field: string) => `${name}\0secret\0${field}`;

/** The checked open options with the lease ttl resolved. */
export function normalizeOpenOptions(input: ConnectionOpenOptionsInput): ConnectionOpenOptions {
    const leaseTtlMs = input.leaseTtlMs ?? DEFAULT_CONNECTION_LEASE_TTL_MS;

    if (typeof input.type !== 'string' || input.type.length === 0 || input.type.length > CONNECTION_TYPE_MAX_LENGTH) {
        throw new InvalidAgentDefinitionError(`A connection type must be a string of 1 to ${CONNECTION_TYPE_MAX_LENGTH} characters.`);
    }

    if (typeof input.owner !== 'string' || input.owner.length === 0) {
        throw new InvalidAgentDefinitionError('A connection owner must be a non-empty string.');
    }

    if (input.recreate !== undefined && typeof input.recreate !== 'boolean') {
        throw new InvalidAgentDefinitionError('A connection recreate option must be a boolean.');
    }

    if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 3 || leaseTtlMs > TIMER_MAX_DELAY_MS) {
        throw new InvalidAgentDefinitionError(
            `A connection leaseTtlMs must be an integer of 3 to ${TIMER_MAX_DELAY_MS} ms.`,
        );
    }

    return { ...input, leaseTtlMs };
}
