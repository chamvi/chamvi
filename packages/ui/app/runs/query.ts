/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildQueryString, decodeRunListQuery } from '@chamvi/http-kit';
import type { RunListFields, RunListQuery } from '@chamvi/http-kit';
import type { RunStatusLiteral } from '@chamvi/store';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import { RUN_LIST_PAGE_SIZE, RUN_STATUSES } from './constants.ts';
import type { RunListFilter } from './types.ts';

/** The API query of a filter: its set parts as rapiq filters and the page. */
export function toRunQuery(filter: RunListFilter): RunListQuery {
    const filters: Record<string, unknown> = {};

    for (const key of ['agent', 'parent', 'status', 'waiting'] as const) {
        if (filter[key] !== undefined) {
            filters[key] = filter[key];
        }
    }

    return {
        filters,
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

/** The runs list filter kept in the route query (rapiq: `filter[agent]`, `filter[status]`, `page[offset]`), decoded by rapiq. */
export function filterFromQuery(query: LocationQuery): RunListFilter {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
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
        if (leaf.field === 'agent' && typeof leaf.value === 'string') {
            agent = leaf.value;
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
        limit: RUN_LIST_PAGE_SIZE,
        offset: offset - (offset % RUN_LIST_PAGE_SIZE),
    };
}

/** The route query of a filter: agent, statuses and the offset (the page size is fixed), rapiq-encoded. */
export function queryFromFilter(filter: RunListFilter): LocationQueryRaw {
    const text = buildQueryString<RunListFields>({
        filters: {
            ...(filter.agent ? { agent: filter.agent } : {}),
            ...(filter.status?.length ? { status: filter.status } : {}),
        },
        ...(filter.offset ? { pagination: { offset: filter.offset } } : {}),
    });

    return Object.fromEntries(new URLSearchParams(text.slice(1)));
}
