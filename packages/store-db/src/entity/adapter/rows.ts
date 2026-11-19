/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { In, IsNull, Or } from 'typeorm';
import type {
    FindOptionsOrder,
    FindOptionsWhere,
    ObjectLiteral,
} from 'typeorm';
import { EntityQueryError } from '@chamvi/store';
import type { EntityRecord } from '@chamvi/store';
import {
    isJsonColumn,
    isUuidColumn,
    isUuidValue,
    storedJson,
} from '../helpers/index.ts';
import { EntityStorageAdapter } from './storage.ts';

/**
 * The row layer of `EntityRepositoryAdapter`: public values and stored
 * columns, their identity marks, primary keys and TypeORM wheres.
 */
export abstract class EntityRowAdapter<T extends EntityRecord, E extends ObjectLiteral = T> extends EntityStorageAdapter<T, E> {
    /**
     * Entity values as TypeORM wheres (see `toFindWhere`), the longest
     * array split so no statement carries more values than the driver
     * binds; none when nothing can match.
     */
    protected wheresOf(values: EntityRecord): FindOptionsWhere<E>[] {
        const half = Math.floor(this.parameterLimit / 2);
        const [property] = Object.entries(values)
            .filter(([, value]) => Array.isArray(value) && value.length > half)
            .map(([key]) => key);

        if (property === undefined) {
            const where = this.toFindWhere(values);

            return where ? [where] : [];
        }

        const items = values[property] as unknown[];
        const wheres: FindOptionsWhere<E>[] = [];

        for (let i = 0; i < items.length; i += half) {
            const where = this.toFindWhere({ ...values, [property]: items.slice(i, i + half) });

            if (where) {
                wheres.push(where);
            }
        }

        return wheres;
    }

    /** Rows in the order of their primary key (as `primaryOrder()`). */
    protected compareKeys(a: ObjectLiteral, b: ObjectLiteral): number {
        for (const column of this.metadata.primaryColumns) {
            const left = a[column.propertyName];
            const right = b[column.propertyName];

            if (left < right) {
                return -1;
            }

            if (left > right) {
                return 1;
            }
        }

        return 0;
    }

    /** The stored columns of a (partial) public value, a copy. */
    protected toEntity(value: Partial<T>): EntityRecord {
        return (this.options.toEntity ? this.options.toEntity(value) : structuredClone(value)) as EntityRecord;
    }

    /**
     * The public value of the row these column values store, as a read
     * returns it (no round trip): an absent column is NULL and a JSON column
     * holds what its parameter serializes to (a `Date` becomes a string, an
     * `undefined` property is dropped). Marked as read.
     */
    protected storedOf(values: EntityRecord): T {
        const row: EntityRecord = {};

        for (const column of this.metadata.columns) {
            if (column.embeddedMetadata) {
                continue;
            }

            const value = values[column.propertyName];

            row[column.propertyName] = isJsonColumn(column) ? storedJson(column, value) : value ?? null;
        }

        return this.read(row as E);
    }

    /**
     * Refuses a value read with a field selection (`EntityQueryError`): an
     * upsert writes every column, so it would clear the unselected ones.
     */
    protected assertWhole(entities: T[]): void {
        const partial = entities.some((entity) => this.marks.partial.has(entity));

        if (partial) {
            throw new EntityQueryError(this.options.entity);
        }
    }

    /** The public value of a row, remembered as read: its `save` updates. */
    protected read(row: E): T {
        const value = this.options.fromEntity ? this.options.fromEntity(row) : structuredClone({ ...row }) as unknown as T;

        this.marks.snapshots.set(value, structuredClone(this.toEntity(value)));

        return value;
    }

    /**
     * Mark a written entity as read with these column values; a rollback
     * of the transaction restores its marks, so a retry behaves as the
     * first attempt (a created entity inserts, a read entity writes its
     * change).
     */
    protected remember(entity: T, values: EntityRecord): void {
        const { created, snapshots } = this.marks;
        const wasCreated = created.has(entity);
        const snapshot = snapshots.get(entity);

        this.tx?.undo.push(() => {
            if (wasCreated) {
                created.add(entity);
            }

            if (snapshot) {
                snapshots.set(entity, snapshot);
            } else {
                snapshots.delete(entity);
            }
        });

        created.delete(entity);
        snapshots.set(entity, structuredClone(values));
    }

    /**
     * Entity values as a TypeORM where: `null` is `IS NULL`, an array is
     * `IN` (or `IS NULL` for a `null` in it); a non-uuid value on a uuid
     * column matches nothing (dropped from an array). `undefined` when
     * nothing can match.
     */
    protected toFindWhere(values: EntityRecord): FindOptionsWhere<E> | undefined {
        const where: EntityRecord = {};

        for (const [property, value] of Object.entries(values)) {
            if (value === undefined) {
                continue;
            }

            const uuid = isUuidColumn(this.metadata.findColumnWithPropertyName(property));

            if (Array.isArray(value)) {
                // a null in the array matches a missing value, as a null value does
                const nullable = value.includes(null);
                const items = value.filter((item) => item !== null && (!uuid || isUuidValue(item)));

                if (items.length === 0 && !nullable) {
                    return undefined;
                }

                if (!nullable) {
                    where[property] = In(items);
                } else {
                    where[property] = items.length > 0 ? Or(In(items), IsNull()) : IsNull();
                }
            } else if (value === null) {
                where[property] = IsNull();
            } else if (uuid && !isUuidValue(value)) {
                return undefined;
            } else {
                where[property] = value;
            }
        }

        return where as FindOptionsWhere<E>;
    }

    /** The primary key of entity values as a where; `undefined` when it cannot match a row. */
    protected keyOf(values: EntityRecord): FindOptionsWhere<E> | undefined {
        const key: EntityRecord = {};

        for (const column of this.metadata.primaryColumns) {
            const value = values[column.propertyName];

            if (value === undefined || value === null || (isUuidColumn(column) && !isUuidValue(value))) {
                return undefined;
            }

            key[column.propertyName] = value;
        }

        return key as FindOptionsWhere<E>;
    }

    protected isKey(row: ObjectLiteral, key: FindOptionsWhere<E>): boolean {
        return this.metadata.primaryColumns
            .every((column) => row[column.propertyName] === (key as EntityRecord)[column.propertyName]);
    }

    protected primaryOrder(): FindOptionsOrder<E> {
        return Object.fromEntries(this.metadata.primaryColumns.map((column) => [column.propertyName, 'ASC'])) as FindOptionsOrder<E>;
    }

    /** The primary key and every unique constraint or index, as property names. */
    protected uniqueGroups(): string[][] {
        const groups = [
            this.metadata.primaryColumns,
            ...this.metadata.uniques.map((unique) => unique.columns),
            ...this.metadata.indices.filter((index) => index.isUnique).map((index) => index.columns),
        ].map((columns) => columns.map((column) => column.propertyName));
        const seen = new Set<string>();

        return groups.filter((group) => {
            const id = group.join('\0');

            if (seen.has(id)) {
                return false;
            }

            seen.add(id);

            return true;
        });
    }
}
