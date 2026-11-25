/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/store';
import { BadRequestError } from '@ebec/http';
import {
    defineSchema,
    eq,
    gte,
    inArray,
    lte,
} from '@rapiq/core';
import type { IFilter } from '@rapiq/core';
import { parseFilterScalar } from '@rapiq/parser-simple';
import { isObject } from 'smob';
import { DEFAULT_PAGE_LIMIT } from '../../app/constants.ts';
import { decodeFlatQuery } from '../../query/helpers.ts';
import type { RunFindFilter, RunListRequest } from '../types.ts';

const RUN_LIST_SCHEMA = defineSchema({
    filters: { allowed: ['agent', 'createdAt', 'parent', 'status', 'waiting'] },
    sorts: { allowed: ['createdAt'] },
    throwOnFailure: true,
});

const RUN_STATUSES = new Set<string>(Object.values(RunStatus));

/**
 * An ISO 8601 instant: a calendar day, a time to the minute or finer (at
 * most milliseconds, the stored precision) and an offset (`Z` or `+hh:mm`).
 */
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const CREATED_AT_MESSAGE = 'filter[createdAt] takes a lower (>=) and an upper (<=) bound, each an ISO 8601 instant with a time and an offset.';

/**
 * The instant a `filter[createdAt]` bound names, else 400: `Date` would
 * roll `2026-02-30` over to March, so the day must exist as written.
 */
function instantOf(value: unknown): Date {
    const match = typeof value === 'string' ? INSTANT_PATTERN.exec(value) : null;
    const date = match ? new Date(value as string) : undefined;

    if (!match || !date || Number.isNaN(date.getTime())) {
        throw new BadRequestError({ message: CREATED_AT_MESSAGE });
    }

    const [, year, month, day] = match.map(Number);
    const calendar = new Date(Date.UTC(year!, month! - 1, day!));

    if (calendar.getUTCMonth() !== month! - 1 || calendar.getUTCDate() !== day) {
        throw new BadRequestError({ message: CREATED_AT_MESSAGE });
    }

    return date;
}

/**
 * The wire is untyped: rapiq coerces `123`, `007`, `true` or `null` to a
 * scalar, even quoted. Such a value names the registered agent whose name
 * coerces to it; an unregistered one reads in canonical form.
 */
function agentNameOf(filter: IFilter, agentNames: Iterable<string>): string {
    const { value } = filter;

    if (filter.operator !== 'eq' || Array.isArray(value) || isObject(value)) {
        throw new BadRequestError({ message: 'filter[agent] takes one agent name.' });
    }

    if (typeof value === 'string') {
        return value;
    }

    const matches = [...agentNames].filter((name) => parseFilterScalar(name) === value);

    if (matches.length > 1) {
        throw new BadRequestError({ message: 'filter[agent] matches more than one agent; the query string cannot tell them apart.' });
    }

    return matches[0] ?? String(value);
}

/**
 * A decoded `GET /runs` filter as a filter on the run's fields, else 400:
 * `agent` (one name), `createdAt` (`gte` or `lte` an instant, as a `Date`), `parent` (one run id, on `parentRunId`), `status`
 * (run statuses, as `in`) and `waiting` (`approval` or `dispatch`). A value
 * the wire coerced to a scalar reads in canonical form.
 */
function checkRunFilter(filter: IFilter, agentNames: Iterable<string>): IFilter {
    const { value } = filter;

    switch (filter.field) {
        case 'agent':
            return eq('agent', agentNameOf(filter, agentNames));
        case 'createdAt':
            if (filter.operator === 'gte') {
                return gte('createdAt', instantOf(value));
            }

            if (filter.operator === 'lte') {
                return lte('createdAt', instantOf(value));
            }

            throw new BadRequestError({ message: CREATED_AT_MESSAGE });
        case 'parent':
            if (filter.operator !== 'eq' || Array.isArray(value) || isObject(value)) {
                throw new BadRequestError({ message: 'filter[parent] takes one run id.' });
            }

            return eq('parentRunId', String(value));
        case 'waiting':
            if (filter.operator !== 'eq' || (value !== 'approval' && value !== 'dispatch')) {
                throw new BadRequestError({ message: 'filter[waiting] takes approval or dispatch.' });
            }

            return filter;
        default: {
            let values: unknown[] | undefined;

            if (filter.operator === 'eq') {
                values = [value];
            } else if (filter.operator === 'in' && Array.isArray(value)) {
                values = value;
            }

            const hasInvalidStatus = values !== undefined &&
                values.some((item) => !(typeof item === 'string' && RUN_STATUSES.has(item)));

            if (!values || hasInvalidStatus) {
                throw new BadRequestError({ message: 'filter[status] takes run statuses.' });
            }

            return inArray('status', values);
        }
    }
}

/** 400 for a `createdAt` lower bound after its upper bound; the message names the key only. */
function assertCreatedAtRange(filters: readonly IFilter[]): void {
    const boundOf = (operator: string) => filters.find((filter) => filter.field === 'createdAt' && filter.operator === operator)?.value as Date | undefined;
    const lower = boundOf('gte');
    const upper = boundOf('lte');

    if (lower && upper && lower.getTime() > upper.getTime()) {
        throw new BadRequestError({ message: 'filter[createdAt] has its lower bound after its upper bound.' });
    }
}

/**
 * `GET /runs` query, decoded with rapiq and checked: one agent, one parent
 * run, statuses, one wait point kind, each given once, and at most one
 * lower and one upper `createdAt` bound (both inclusive, in order), joined
 * with `and`; a page; `sort=createdAt` only. `agentNames` (the app's agents)
 * resolve an agent name the wire coerced.
 */
export function parseRunListQuery(searchParams: URLSearchParams, agentNames: Iterable<string> = []): RunListRequest {
    const decoded = decodeFlatQuery(searchParams, RUN_LIST_SCHEMA);
    const seen = new Set<string>();
    const filters: IFilter[] = [];
    let agent: string | undefined;

    for (const filter of decoded.filters) {
        // createdAt takes one bound of each kind; the operator is checked with the value
        const key = filter.field === 'createdAt' ? `createdAt:${filter.operator}` : filter.field;

        if (seen.has(key)) {
            throw new BadRequestError({
                message: filter.field === 'createdAt' ?
                    'filter[createdAt] may be given once per bound.' :
                    `filter[${filter.field}] may be given once.`,
            });
        }

        seen.add(key);

        const checked = checkRunFilter(filter, agentNames);

        if (checked.field === 'agent') {
            agent = checked.value as string;
        }

        filters.push(checked);
    }

    assertCreatedAtRange(filters);

    const [sort, ...others] = decoded.sorts;

    if (others.length > 0 || (sort && sort.name !== 'createdAt')) {
        throw new BadRequestError({ message: 'Only sort=createdAt or sort=-createdAt is supported.' });
    }

    return {
        filters,
        ...(agent !== undefined ? { agent } : {}),
        limit: decoded.limit ?? DEFAULT_PAGE_LIMIT,
        offset: decoded.offset ?? 0,
        sorts: sort ? { [sort.name]: sort.operator } : {},
    };
}

/**
 * A run listing's request from an already validated filter (MCP
 * `list_runs`): the same rapiq filters `parseRunListQuery` builds.
 */
export function toRunListRequest(filter: RunFindFilter): RunListRequest {
    const filters: IFilter[] = [];

    if (filter.agent !== undefined) {
        filters.push(eq('agent', filter.agent));
    }

    if (filter.parent !== undefined) {
        filters.push(eq('parentRunId', filter.parent));
    }

    if (filter.status !== undefined) {
        filters.push(inArray('status', [...filter.status]));
    }

    if (filter.waiting !== undefined) {
        filters.push(eq('waiting', filter.waiting));
    }

    return {
        filters,
        ...(filter.agent !== undefined ? { agent: filter.agent } : {}),
        limit: filter.limit,
        offset: filter.offset,
        sorts: filter.order === 'desc' ? { createdAt: 'DESC' } : {},
    };
}
