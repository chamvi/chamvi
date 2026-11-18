/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildQueryString } from '@chamvi/http-kit';
import type { RunListFields } from '@chamvi/http-kit';
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
            filters: {
                agent: 'a',
                parent: 'p',
                status: ['failed'],
                waiting: 'approval',
            },
            pagination: { limit: 10, offset: 20 },
        });
        expect(toRunQuery({})).toEqual({ filters: {}, pagination: {} });
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
