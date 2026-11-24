/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Filter,
    Filters,
    isFilter,
    isFilters,
} from '@rapiq/core';
import type { ICondition, IFilter, IFilters } from '@rapiq/core';
import { isEqual } from 'smob';
import { EntityQueryError } from '@chamvi/store';
import type { EntityRecord, IEntityRepository } from '@chamvi/store';

function isPlain(value: unknown): value is string | number | boolean | bigint {
    const type = typeof value;

    return type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint';
}

function isMissing(value: unknown): boolean {
    return value === null || value === undefined;
}

/** The test of one condition: a list of plain values is a set lookup, so a long id list costs one pass over the rows. */
function conditionOf(value: unknown): (field: unknown) => boolean {
    if (Array.isArray(value)) {
        // a null in the array matches a missing value, as a null value does
        const nullable = value.includes(null);
        const items = value.filter((item) => item !== null);

        const plain = items.every(isPlain);

        if (plain) {
            const set = new Set<unknown>(items);

            return (field) => (nullable && isMissing(field)) || set.has(field);
        }

        return (field) => (nullable && isMissing(field)) || items.some((item) => isEqual(field, item));
    }

    if (isMissing(value)) {
        return isMissing;
    }

    return (field) => isEqual(field, value);
}

/**
 * The test of a where, built once for many rows: the row matches every
 * condition; an array matches any of its values, `null` and `undefined`
 * match a missing value.
 */
export function matcherOf(where: EntityRecord): (row: EntityRecord) => boolean {
    const conditions = Object.entries(where).map(([field, value]) => [field, conditionOf(value)] as const);

    return (row) => conditions.every(([field, test]) => test(row[field]));
}

/** Whether the row matches the where (`matcherOf` for a single row). */
export function matches(row: EntityRecord, where: EntityRecord): boolean {
    return matcherOf(where)(row);
}

/**
 * Orders strings by Unicode code point, like a database's `COLLATE "C"`
 * on UTF-8 (`<` compares UTF-16 code units, which puts an astral
 * character such as U+1F600 before U+FFFD).
 */
export function compareCodePoints(a: string, b: string): number {
    const left = a[Symbol.iterator]();
    const right = b[Symbol.iterator]();

    for (;;) {
        const l = left.next();
        const r = right.next();

        if (l.done || r.done) {
            if (l.done && r.done) {
                return 0;
            }

            return l.done ? -1 : 1;
        }

        const diff = l.value.codePointAt(0)! - r.value.codePointAt(0)!;

        if (diff !== 0) {
            return diff;
        }
    }
}

function readPath(row: EntityRecord, path: string): unknown {
    let value: unknown = row;

    for (const segment of path.split('.')) {
        if (value === null || typeof value !== 'object') {
            return null;
        }

        value = (value as EntityRecord)[segment];
    }

    return value ?? null;
}

/** Two sort values of one comparable type (number, string by code point, boolean, Date); 0 otherwise. */
function compareSortValues(a: unknown, b: unknown): number {
    const left = a instanceof Date ? a.getTime() : a;
    const right = b instanceof Date ? b.getTime() : b;

    if (typeof left === 'string' && typeof right === 'string') {
        return Math.sign(compareCodePoints(left, right));
    }

    if ((typeof left === 'number' && typeof right === 'number') || (typeof left === 'boolean' && typeof right === 'boolean')) {
        if (left === right || Number.isNaN(left) || Number.isNaN(right)) {
            return 0;
        }

        return left < right ? -1 : 1;
    }

    return 0;
}

/**
 * The rows in the order of `sorts` (stable): as rapiq's memory adapter
 * orders them (an absent value last ascending, first descending), except
 * that strings compare by code point, as the database's `COLLATE "C"`.
 */
export function sortRows(rows: EntityRecord[], sorts: readonly { name: string; operator: string }[]): EntityRecord[] {
    return rows.toSorted((a, b) => {
        for (const sort of sorts) {
            const desc = sort.operator === 'DESC';
            const left = readPath(a, sort.name);
            const right = readPath(b, sort.name);
            let result: number;

            if (left === null || right === null) {
                if (left === right) {
                    continue;
                }

                result = left === null ? 1 : -1;
            } else {
                result = compareSortValues(left, right);
            }

            if (result !== 0) {
                return desc ? -result : result;
            }
        }

        return 0;
    });
}

/**
 * The stored row with the properties the entity changed since `snapshot`
 * (a property that became `undefined` is removed). Properties the entity
 * did not change keep the stored value, also when another writer changed
 * them after the read.
 */
export function applyChanges(stored: EntityRecord, snapshot: EntityRecord, entity: EntityRecord): EntityRecord {
    const next = structuredClone(stored);
    const fields = new Set([...Object.keys(snapshot), ...Object.keys(entity)]);

    for (const field of fields) {
        if (isEqual(snapshot[field], entity[field])) {
            continue;
        }

        if (entity[field] === undefined) {
            delete next[field];
        } else {
            next[field] = structuredClone(entity[field]);
        }
    }

    return next;
}

/**
 * Remove every row whose `expiresAt` is at or before `time`, in one
 * transaction, and resolve how many were removed. Each candidate is read
 * again with a single-row read (locking it), so a row a transaction in
 * flight renews past `time` stays.
 */
export async function removeRowsExpiredBy<T extends EntityRecord & { id: string; expiresAt: Date }>(
    repository: IEntityRepository<T>,
    time: Date,
): Promise<number> {
    return removeRowsDatedBy(repository, 'expiresAt', time);
}

/**
 * Remove every row whose date `field` is at or before `time`, in one
 * transaction, and resolve how many were removed; a row a transaction in
 * flight moves past `time` stays (see removeRowsExpiredBy()).
 */
export async function removeRowsDatedBy<K extends string, T extends EntityRecord & { id: string } & Record<K, Date>>(
    repository: IEntityRepository<T>,
    field: K,
    time: Date,
): Promise<number> {
    const isExpired = (row: T) => row[field].getTime() <= time.getTime();

    return repository.transaction(async (bound) => {
        let removed = 0;

        for (const candidate of (await bound.findManyBy({})).filter(isExpired)) {
            const row = await bound.findOneById(candidate.id);

            if (row && isExpired(row)) {
                await bound.remove(row);
                removed += 1;
            }
        }

        return removed;
    });
}

/**
 * Refuse a where with a property set to `undefined` (a filter that would
 * silently match more), and for a remove one without any property.
 */
export function assertWhere(entity: string, where: EntityRecord, remove = false): void {
    const values = Object.values(where);

    if (values.includes(undefined) || (remove && values.length === 0)) {
        throw new EntityQueryError(entity);
    }
}

/**
 * A filter on a date field compared as the instant it names: each value a
 * `Date`. A value that names no instant is refused (`EntityQueryError`
 * labelled `entity`), as a database repository refuses it.
 */
function toInstantFilter(filter: IFilter, entity: string): ICondition {
    const {
        field,
        operator,
        value,
    } = filter;
    const instant = (item: unknown): Date | null => {
        if (item === null) {
            return null;
        }

        const date = item instanceof Date || typeof item === 'string' || typeof item === 'number' ? new Date(item) : undefined;

        if (!date || Number.isNaN(date.getTime())) {
            throw new EntityQueryError(entity);
        }

        return date;
    };

    return new Filter(operator, field, Array.isArray(value) ? value.map(instant) : instant(value));
}

/** The condition with every filter on one of `dates` compared as an instant; `entity` labels a refusal. */
export function toInstantConditions(condition: ICondition, dates: readonly string[], entity: string): ICondition {
    if (isFilters(condition)) {
        const { preserved } = condition as IFilters & { preserved?: boolean };

        return new Filters(
            condition.operator,
            condition.value.map((child) => toInstantConditions(child, dates, entity)),
            preserved ? { preserved } : undefined,
        );
    }

    if (isFilter(condition) && dates.includes(condition.field)) {
        return toInstantFilter(condition, entity);
    }

    return condition;
}
