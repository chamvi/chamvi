/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { EntityRecord } from '@chamvi/store';

/**
 * The value at a field path of a record: a field name, or names joined by
 * dots for a nested object (`conversation.scope.id`); `undefined` when a
 * step is missing.
 */
export function valueAt(record: EntityRecord, path: string): unknown {
    let value: unknown = record;

    for (const name of path.split('.')) {
        if (!isObject(value)) {
            return undefined;
        }

        value = value[name];
    }

    return value;
}
