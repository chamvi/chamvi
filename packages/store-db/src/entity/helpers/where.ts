/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityQueryError } from '@chamvi/store';
import type { EntityRecord } from '@chamvi/store';

/**
 * Refuse a where with a property set to `undefined` (a filter the query
 * would drop, widening it), and for a remove one without any property;
 * before any statement, lock or queue entry.
 */
export function assertWhere(entity: string, where: EntityRecord, remove = false): void {
    const values = Object.values(where);

    if (values.includes(undefined) || (remove && values.length === 0)) {
        throw new EntityQueryError(entity);
    }
}
