/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { getMetadataArgsStorage } from 'typeorm';
import type { DatabaseEntity, UntypedColumn } from './types.ts';

/** The class and its parents, nearest first. */
function classChain(entity: DatabaseEntity): object[] {
    const chain: object[] = [];
    let current: unknown = entity;

    while (typeof current === 'function' && current !== Function.prototype) {
        chain.push(current);
        current = Object.getPrototypeOf(current);
    }

    return chain;
}

/**
 * The decorated columns of `entities` (their parents' too) whose type
 * TypeORM took from a `design:type` of `Object`: a property typed as a
 * union (`Date | null`), `any` or an interface, with no type given. Such
 * a column would get a wrong type silently. Reads the decorator metadata
 * only: no data source, no I/O. A column without any decorator metadata
 * never gets here: TypeORM refuses it when the decorator runs.
 */
export function findUntypedColumns(entities: DatabaseEntity[]): UntypedColumn[] {
    const storage = getMetadataArgsStorage();
    const found: UntypedColumn[] = [];

    for (const entity of entities) {
        if (typeof entity !== 'function') {
            continue;
        }

        const chain = classChain(entity);

        for (const column of storage.columns) {
            if (chain.includes(column.target as object) && (column.options.type as unknown) === Object) {
                found.push({ entity: entity.name, property: column.propertyName });
            }
        }
    }

    return found;
}
