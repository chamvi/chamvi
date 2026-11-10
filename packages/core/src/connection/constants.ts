/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Longest connection entry key, the store's varchar width. */
export const CONNECTION_ENTRY_KEY_MAX_LENGTH = 255;

/** Longest name of a connection's secret field, the store's varchar width. */
export const CONNECTION_SECRET_FIELD_MAX_LENGTH = 64;

/** Longest connection type and key id. */
export const CONNECTION_TYPE_MAX_LENGTH = 64;

/** Lease TTL of a connection session; a crashed holder blocks a re-open for at most this long. */
export const DEFAULT_CONNECTION_LEASE_TTL_MS = 60_000;
