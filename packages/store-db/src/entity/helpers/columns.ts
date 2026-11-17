/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isEqual } from 'smob';
import type { EntityMetadata } from 'typeorm';
import type { EntityRecord } from '@chamvi/store';
import type { EntityColumn } from '../types.ts';

/**
 * The non-key columns an update writes: those that differ from the
 * snapshot taken at read, or every column without a snapshot (an object
 * that was never read, e.g. a spread copy). An absent value is written
 * as `NULL`.
 */
export function changedColumns(metadata: EntityMetadata, values: EntityRecord, snapshot?: EntityRecord): EntityRecord {
    const changed: EntityRecord = {};

    for (const column of metadata.columns) {
        if (column.isPrimary || column.embeddedMetadata) {
            continue;
        }

        const property = column.propertyName;

        if (snapshot && isEqual(snapshot[property], values[property])) {
            continue;
        }

        changed[property] = values[property] ?? null;
    }

    return changed;
}

/** Whether the column stores JSON (`jsonb`, `json`, `simple-json`). */
export function isJsonColumn(column: EntityColumn): boolean {
    return column.type === 'jsonb' || column.type === 'json' || column.type === 'simple-json';
}

/**
 * The value a JSON column holds for `value`, as read back: the column's
 * transformer applied both ways around the JSON text the driver sends.
 */
export function storedJson(column: EntityColumn, value: unknown): unknown {
    const transformer = Array.isArray(column.transformer) ? column.transformer[0] : column.transformer;
    const parameter: unknown = transformer?.to ? transformer.to(value) : value;
    const stored: unknown = parameter === undefined || parameter === null ? null : JSON.parse(JSON.stringify(parameter));

    return transformer?.from ? transformer.from(stored) : stored;
}
