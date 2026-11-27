/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildQueryString, decodeRunListQuery } from '@chamvi/http-kit';
import type { RunListFields, RunListQuery } from '@chamvi/http-kit';
import type { RunStatusLiteral } from '@chamvi/core-kit';
import {
    and,
    eq,
    gte,
    inArray,
    lte,
} from '@rapiq/core';
import type { IFilter } from '@rapiq/core';
import { fromDateInput } from '@vuecs/forms';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import { RUN_LIST_PAGE_SIZE, RUN_STATUSES } from './constants.ts';
import type { RunListFilter } from './types.ts';

/** The route query keys of the day range, kept apart from the rapiq parameters. */
const DAY_KEYS = ['from', 'to'] as const;

/**
 * The days of a range that name real local days in order: a malformed day
 * is dropped, a reversed range (a hand-edited URL) is dropped whole.
 */
function dayRangeOf(from: unknown, to: unknown): Pick<RunListFilter, 'from' | 'to'> {
    const day = (value: unknown) => (typeof value === 'string' && fromDateInput(value, 'start') !== undefined ? value : undefined);
    const first = day(from);
    const last = day(to);

    // YYYY-MM-DD compares in calendar order as text
    if (first !== undefined && last !== undefined && first > last) {
        return {};
    }

    return {
        ...(first === undefined ? {} : { from: first }),
        ...(last === undefined ? {} : { to: last }),
    };
}

/**
 * The API query of a filter: its set parts as rapiq filters and the page.
 * The days become the instants of their local start and end (the browser's
 * time zone), both bounds inclusive.
 */
export function toRunQuery(filter: RunListFilter): RunListQuery {
    const filters: IFilter[] = [];
    const { from, to } = dayRangeOf(filter.from, filter.to);

    if (filter.agent !== undefined) {
        filters.push(eq('agent', filter.agent));
    }

    if (filter.parent !== undefined) {
        filters.push(eq('parent', filter.parent));
    }

    if (filter.status !== undefined) {
        filters.push(inArray('status', filter.status));
    }

    if (filter.waiting !== undefined) {
        filters.push(eq('waiting', filter.waiting));
    }

    if (from !== undefined) {
        filters.push(gte('createdAt', fromDateInput(from, 'start')));
    }

    if (to !== undefined) {
        filters.push(lte('createdAt', fromDateInput(to, 'end')));
    }

    return {
        filters: and(...filters),
        pagination: {
            ...(filter.limit === undefined ? {} : { limit: filter.limit }),
            ...(filter.offset === undefined ? {} : { offset: filter.offset }),
        },
    } as RunListQuery;
}

type FilterLeaf = { field: string; value: unknown };

/** The field conditions of a decoded rapiq filter tree. */
function leavesOf(filters: unknown): FilterLeaf[] {
    const node = filters as { value?: unknown; field?: unknown } | undefined;

    if (typeof node?.field === 'string') {
        return [node as FilterLeaf];
    }

    return Array.isArray(node?.value) ? node.value.flatMap(leavesOf) : [];
}

/**
 * The runs list filter kept in the route query: agent, statuses and the
 * offset as rapiq parameters (`filter[agent]`, `filter[status]`,
 * `page[offset]`), decoded by rapiq; the days as `from` and `to`.
 */
export function filterFromQuery(query: LocationQuery): RunListFilter {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if ((DAY_KEYS as readonly string[]).includes(key)) {
            continue;
        }

        for (const item of Array.isArray(value) ? value : [value]) {
            if (typeof item === 'string') {
                params.append(key, item);
            }
        }
    }

    const decoded = decodeRunListQuery(params);
    let agent: string | undefined;
    let status: RunStatusLiteral[] = [];

    for (const leaf of leavesOf(decoded.filters)) {
        if (leaf.field === 'agent') {
            // rapiq reads a name like `007` or `null` as a number or null: the raw parameter keeps it
            agent = typeof leaf.value === 'string' ? leaf.value : (params.get('filter[agent]') ?? String(leaf.value));
        }

        if (leaf.field === 'status') {
            status = (Array.isArray(leaf.value) ? leaf.value : [leaf.value])
                .filter((value): value is RunStatusLiteral => (RUN_STATUSES as readonly unknown[]).includes(value));
        }
    }

    const offset = Math.max(0, decoded.pagination.offset ?? 0);

    return {
        ...(agent ? { agent } : {}),
        ...(status.length > 0 ? { status } : {}),
        ...dayRangeOf(query.from, query.to),
        limit: RUN_LIST_PAGE_SIZE,
        offset: offset - (offset % RUN_LIST_PAGE_SIZE),
    };
}

/** The route query of a filter: agent, statuses and the offset (the page size is fixed), rapiq-encoded, and the days. */
export function queryFromFilter(filter: RunListFilter): LocationQueryRaw {
    const text = buildQueryString<RunListFields>({
        filters: {
            ...(filter.agent ? { agent: filter.agent } : {}),
            ...(filter.status?.length ? { status: filter.status } : {}),
        },
        ...(filter.offset ? { pagination: { offset: filter.offset } } : {}),
    });

    return {
        ...Object.fromEntries(new URLSearchParams(text.slice(1))),
        ...dayRangeOf(filter.from, filter.to),
    };
}
