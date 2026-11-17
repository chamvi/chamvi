/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ValueTransformer } from 'typeorm';

function toISOString(value: unknown): unknown {
    return value instanceof Date ? value.toISOString() : value;
}

/**
 * A date column's transformer, in both directions: a `Date` becomes its
 * ISO 8601 UTC string (`toISOString()`), a string, `null` and `undefined`
 * pass through. With it a date column reads as the same string on
 * PostgreSQL and SQLite (the data source is pinned to UTC), and an entity
 * types the property as `string`. Give the column no type (the driver's
 * default from decorator metadata) or `@CreateDateColumn` /
 * `@UpdateDateColumn`, so one entity runs on both drivers. A `findMany`
 * filter value on a date column (an ISO string with any offset, a `Date`)
 * is compared as the instant it names on both drivers (`applyQuery`
 * writes it as the driver stores it); one that names no instant is
 * refused with `EntityQueryError`.
 */
export const dateToISOStringTransformer: ValueTransformer = {
    to: toISOString,
    from: toISOString,
};
