/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const DatabaseErrorCode = {
    DATABASE_UNAVAILABLE: 'database_unavailable',
    /** The driver package a database needs is not installed. */
    DATABASE_DRIVER_MISSING: 'database_driver_missing',
    /** An app database's options or entities are not usable: a configuration error, never an outage. */
    DATABASE_OPTIONS_INVALID: 'database_options_invalid',
} as const;
