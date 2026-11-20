/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readDatabaseErrorCode } from 'typeorm-extension';
import { SCHEMA_BEHIND_SQLSTATES } from '../constants.ts';

/**
 * Whether `error` is the database's "no such table or column": a store behind
 * its migrations, which a check meets because it never migrates.
 */
export function isSchemaBehindError(error: unknown): boolean {
    const code = readDatabaseErrorCode(error);

    return code !== undefined && SCHEMA_BEHIND_SQLSTATES.includes(code);
}
