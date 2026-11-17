/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Field,
    Fields,
    Filter,
    Filters,
    Query,
    Sort,
    Sorts,
    isFilter,
    isFilters,
} from '@rapiq/core';
import type { ICondition, IFilters, IQuery } from '@rapiq/core';
import { EntityQueryError } from '@chamvi/store';
import type { Driver, EntityMetadata } from 'typeorm';
import type { EntityColumn } from '../types.ts';
import { isUuidColumn, isUuidValue } from './uuid.ts';

/** A filter value that matches no row: dropped before the driver sees it. */
const NO_MATCH = Symbol('no-match');

type Convert = (value: unknown) => unknown;

/**
 * A filter with each value converted (`null` kept): a value converting to
 * `NO_MATCH` matches no row, so it is dropped (an `eq` or a comparison
 * becomes an empty `in`, an `ne` holds for every row with a value).
 */
function convertFilter(filter: Filter, convert: Convert): ICondition {
    const {
        field,
        operator,
        value,
    } = filter;
    const one = (item: unknown) => (item === null ? null : convert(item));
    const many = (items: unknown[]) => items.map(one).filter((item) => item !== NO_MATCH);

    switch (operator) {
        case 'eq':
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte': {
            const converted = one(value);

            return converted === NO_MATCH ? new Filter('in', field, []) : new Filter(operator, field, converted);
        }
        case 'ne': {
            const converted = one(value);

            // `<column> <> <value>` holds for every row with a value
            return converted === NO_MATCH ? new Filter('ne', field, null) : new Filter('ne', field, converted);
        }
        case 'in':
            return Array.isArray(value) ? new Filter('in', field, many(value)) : filter;
        case 'nin': {
            if (!Array.isArray(value)) {
                return filter;
            }

            const kept = many(value);

            return kept.length > 0 ? new Filter('nin', field, kept) : new Filter('ne', field, null);
        }
        default:
            return filter;
    }
}

/** A value on a uuid column: kept when it is a uuid (a PostgreSQL uuid column fails on anything else). */
function uuidValue(value: unknown): unknown {
    return isUuidValue(value) ? value : NO_MATCH;
}

/** The column types that hold an instant: TypeORM's `Date` from decorator metadata and the explicit names. */
const DATE_TIME_TYPES: unknown[] = [
    Date,
    'datetime',
    'datetime2',
    'datetimeoffset',
    'timestamp',
    'timestamptz',
    'timestamp with time zone',
    'timestamp without time zone',
];

function isDateTimeColumn(column: EntityColumn | undefined): column is EntityColumn {
    return !!column && DATE_TIME_TYPES.includes(column.type);
}

/**
 * A value on a date-time column as the driver stores it: the instant it
 * names (an ISO string with any offset, a `Date` or epoch milliseconds)
 * written as the driver writes a persisted value (SQLite's
 * `YYYY-MM-DD HH:MM:SS.SSS` text, an ISO string PostgreSQL casts), so a
 * comparison matches what was saved. A value that names no instant is
 * refused (`EntityQueryError` labelled `entity`), on every driver: no
 * filter stands in for it (with `ne` one would match every row).
 */
function dateValue(column: EntityColumn, driver: Driver, entity: string): Convert {
    return (value) => {
        const date = value instanceof Date || typeof value === 'string' || typeof value === 'number' ? new Date(value) : undefined;

        if (!date || Number.isNaN(date.getTime())) {
            throw new EntityQueryError(entity);
        }

        const stored: unknown = driver.preparePersistentValue(date, column);

        return stored instanceof Date ? stored.toISOString() : stored;
    };
}

function rewriteCondition(condition: ICondition, metadata: EntityMetadata, fields: Record<string, string>, entity: string): ICondition {
    if (isFilters(condition)) {
        const { preserved } = condition as IFilters & { preserved?: boolean };

        return new Filters(
            condition.operator,
            condition.value.map((child) => rewriteCondition(child, metadata, fields, entity)),
            preserved ? { preserved } : undefined,
        );
    }

    if (isFilter(condition)) {
        const field = fields[condition.field] ?? condition.field;
        const filter = new Filter(condition.operator, field, condition.value);

        const column = metadata.findColumnWithPropertyPath(field);

        if (isUuidColumn(column)) {
            return convertFilter(filter, uuidValue);
        }

        return isDateTimeColumn(column) ? convertFilter(filter, dateValue(column, metadata.connection.driver, entity)) : filter;
    }

    return condition;
}

/**
 * The public query as one on the entity: field, filter and sort paths
 * renamed through the field map, non-uuid values on uuid columns dropped,
 * values on date-time columns written as the driver stores it; a value
 * there that names no instant is `EntityQueryError` labelled `entity`
 * (default the entity's metadata name).
 */
export function prepareQuery(query: IQuery, metadata: EntityMetadata, fields: Record<string, string>, entity = metadata.name): IQuery {
    return new Query({
        fields: new Fields(query.fields.value.map((field) => new Field(fields[field.name] ?? field.name, field.operator, field.condition))),
        relations: query.relations,
        pagination: query.pagination,
        filters: rewriteCondition(query.filters, metadata, fields, entity) as IFilters,
        sorts: new Sorts(query.sorts.value.map((sort) => new Sort(fields[sort.name] ?? sort.name, sort.operator))),
        ...(query.groups ? { groups: query.groups } : {}),
        ...(query.aggregates ? { aggregates: query.aggregates } : {}),
    });
}
