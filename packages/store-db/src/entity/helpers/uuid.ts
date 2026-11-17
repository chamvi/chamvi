/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityColumn } from '../types.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is a canonical uuid: anything else matches no uuid column. */
export function isUuidValue(value: unknown): boolean {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Whether the column holds a uuid (SQLite stores it as text, the metadata keeps the type). */
export function isUuidColumn(column: EntityColumn | undefined): boolean {
    return !!column && (column.type === 'uuid' || column.generationStrategy === 'uuid');
}
