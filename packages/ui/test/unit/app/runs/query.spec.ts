/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildQueryString } from '@chamvi/http-kit';
import type { RunListFields } from '@chamvi/http-kit';
import {
    and,
    eq,
    gte,
    inArray,
    lte,
} from '@rapiq/core';
import { describe, expect, it } from 'vitest';
import { filterFromQuery, queryFromFilter, toRunQuery } from '../../../../app/runs/query.ts';

/** A route query as vue-router parses it from the rapiq query string. */
const routeQuery = (text: string) => Object.fromEntries(new URLSearchParams(text.replace(/^\?/, '')));

describe('run list query', () => {
    it('reads agent, known statuses and the page through rapiq', () => {
        const text = buildQueryString<RunListFields>({
            filters: { agent: 'deploy', status: ['waiting', 'nope' as never, 'failed'] },
            pagination: { offset: 50 },
        });

        expect(filterFromQuery(routeQuery(text))).toEqual({
            agent: 'deploy',
            status: ['waiting', 'failed'],
            limit: 25,
            offset: 50,
        });
    });

    it('drops what the run list does not take and clamps the offset to a page', () => {
        expect(filterFromQuery({ 'filter[secret]': 'x', 'page[offset]': '-5' })).toEqual({ limit: 25, offset: 0 });
        expect(filterFromQuery({ 'page[offset]': '30' })).toEqual({ limit: 25, offset: 25 });
        expect(filterFromQuery({ page: '3', agent: 'old' })).toEqual({ limit: 25, offset: 0 });
    });

    it('round-trips through the route query', () => {
        const filter = {
            agent: 'a',
            status: ['queued' as const],
            limit: 25,
            offset: 25,
        };

        expect(filterFromQuery(queryFromFilter(filter) as Record<string, string>)).toEqual(filter);
        expect(queryFromFilter({ limit: 25, offset: 0 })).toEqual({});
    });

    it('builds the API query of a filter', () => {
        expect(toRunQuery({
            agent: 'a',
            parent: 'p',
            status: ['failed'],
            waiting: 'approval',
            limit: 10,
            offset: 20,
        })).toEqual({
            filters: and(eq('agent', 'a'), eq('parent', 'p'), inArray('status', ['failed']), eq('waiting', 'approval')),
            pagination: { limit: 10, offset: 20 },
        });
        expect(toRunQuery({})).toEqual({ filters: and(), pagination: {} });
    });

    it('sends the days as the instants of their local start and end', () => {
        // local days: the expected instants follow the time zone the test runs in
        const start = new Date(2026, 10, 1).toISOString();
        const end = new Date(2026, 10, 7, 23, 59, 59, 999).toISOString();

        expect(toRunQuery({
            status: ['failed'], 
            from: '2026-11-01', 
            to: '2026-11-07', 
        }).filters)
            .toEqual(and(inArray('status', ['failed']), gte('createdAt', start), lte('createdAt', end)));
        expect(toRunQuery({ from: '2026-11-01' }).filters).toEqual(and(gte('createdAt', start)));
        expect(toRunQuery({ to: '2026-11-07' }).filters).toEqual(and(lte('createdAt', end)));
        // one day is its whole local day
        expect(toRunQuery({ from: '2026-11-07', to: '2026-11-07' }).filters)
            .toEqual(and(gte('createdAt', new Date(2026, 10, 7).toISOString()), lte('createdAt', end)));
    });

    it('sends no bound of a reversed or malformed range', () => {
        expect(toRunQuery({ from: '2026-11-07', to: '2026-11-01' }).filters).toEqual(and());
        expect(toRunQuery({ from: '2026-02-30', to: 'soon' }).filters).toEqual(and());
    });

    it('keeps the days in the route query and drops a cleared, malformed or reversed range', () => {
        const filter = {
            agent: 'a',
            status: ['queued' as const],
            from: '2026-11-01',
            to: '2026-11-07',
            limit: 25,
            offset: 25,
        };
        const query = queryFromFilter(filter);

        expect(query).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
        expect(filterFromQuery(query as Record<string, string>)).toEqual(filter);
        expect(queryFromFilter({ to: '2026-11-07' })).toEqual({ to: '2026-11-07' });
        expect(filterFromQuery({ to: '2026-11-07' })).toEqual({
            to: '2026-11-07', 
            limit: 25, 
            offset: 0, 
        });
        expect(filterFromQuery({ from: '2026-11-07', to: '2026-11-01' })).toEqual({ limit: 25, offset: 0 });
        expect(filterFromQuery({ from: '2026-13-01', to: 'tomorrow' })).toEqual({ limit: 25, offset: 0 });
        expect(filterFromQuery({ from: ['2026-11-01', '2026-11-02'] })).toEqual({ limit: 25, offset: 0 });
    });

    it.each(['null', '007', '1e5', '42'])('keeps the agent %s through the route query', (agent) => {
        const query = queryFromFilter({
            agent, 
            status: ['failed'], 
            offset: 25, 
        });

        expect(filterFromQuery(query as Record<string, string>)).toEqual({
            agent,
            status: ['failed'],
            limit: 25,
            offset: 25,
        });
    });
});
