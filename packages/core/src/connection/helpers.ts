/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { CONNECTION_TYPE_MAX_LENGTH, DEFAULT_CONNECTION_LEASE_TTL_MS } from './constants.ts';
import type { ConnectionOpenOptions } from './types.ts';

/** The store lock that leases a connection. */
export const lockKeyOf = (name: string) => `connection:${name}`;

/** The AAD wrapping a connection's data key (the same string as its lock key). */
export const dataKeyContextOf = (name: string) => `connection:${name}`;

/** The AAD of one entry: a sealed value opens only under its own connection and key. */
export const entryAadOf = (name: string, key: string) => `${name}\0${key}`;

/** The checked open options with the lease ttl resolved. */
export function normalizeOpenOptions(opts: ConnectionOpenOptions): ConnectionOpenOptions & { leaseTtlMs: number } {
    const leaseTtlMs = opts.leaseTtlMs ?? DEFAULT_CONNECTION_LEASE_TTL_MS;

    if (typeof opts.type !== 'string' || opts.type.length === 0 || opts.type.length > CONNECTION_TYPE_MAX_LENGTH) {
        throw new InvalidAgentDefinitionError(`A connection type must be a string of 1 to ${CONNECTION_TYPE_MAX_LENGTH} characters.`);
    }

    if (typeof opts.owner !== 'string' || opts.owner.length === 0) {
        throw new InvalidAgentDefinitionError('A connection owner must be a non-empty string.');
    }

    if (opts.recreate !== undefined && typeof opts.recreate !== 'boolean') {
        throw new InvalidAgentDefinitionError('A connection recreate option must be a boolean.');
    }

    if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 3) {
        throw new InvalidAgentDefinitionError('A connection leaseTtlMs must be an integer of at least 3 ms.');
    }

    return { ...opts, leaseTtlMs };
}
