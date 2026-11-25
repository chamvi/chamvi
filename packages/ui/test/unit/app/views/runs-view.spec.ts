/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { AgentList, RunListQuery, RunPage } from '@chamvi/http-kit';
import { fromDateInput, toDateInput } from '@vuecs/forms';
import { RouteName } from '../../../../app/router/constants.ts';
import { RUN_LIST_PAGE_SIZE } from '../../../../app/runs/constants.ts';
import RunsView from '../../../../app/views/RunsView.vue';
import { fakeClient } from '../../../utils/client.ts';
import { filterOf } from '../../../utils/runs.ts';
import { ALL } from '../../../utils/permissions.ts';
import { mountView, settle } from '../../../utils/view.ts';

const EMPTY: RunPage = {
    data: [],
    meta: {
        total: 0, 
        limit: 25, 
        offset: 0, 
    }, 
};

let unmount: (() => void) | undefined;

afterEach(() => {
    unmount?.();
    unmount = undefined;
});

async function open(path: string) {
    const queries: RunListQuery[] = [];
    const view = await mountView(RunsView, {
        path,
        pattern: '/runs',
        name: RouteName.RUNS,
        client: fakeClient({
            agent: { getMany: async (): Promise<AgentList> => ({ data: [], issues: [] }) },
            schedule: { getMany: async () => [] },
            run: {
                getMany: async (query?: RunListQuery) => {
                    queries.push(query ?? {});

                    return EMPTY;
                },
            },
        }),
        names: ALL,
    });

    unmount = view.unmount;

    // the list's own requests: the counters and the activity cards ask for other pages
    const listed = () => filterOf(queries.filter((query) => filterOf(query).limit === RUN_LIST_PAGE_SIZE).at(-1));

    return { ...view, listed };
}

const buttonOf = (root: ParentNode, text: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((element) => element.textContent?.trim() === text);

describe('the runs view', () => {
    it('shows an empty collection without an action', async () => {
        const view = await open('/runs');
        const empty = view.testId('empty');

        expect(empty?.textContent).toContain('No runs yet');
        expect(empty?.querySelector('button')).toBeNull();
    });

    it('clears the filters from the no-results state', async () => {
        const view = await open('/runs?filter[status]=cancelled');
        const empty = view.testId('empty');

        expect(empty?.textContent).toContain('No runs match these filters');

        const reset = empty?.querySelector('button');

        expect(reset?.textContent?.trim()).toBe('Clear filters');

        reset?.click();
        await settle();

        expect(view.router.currentRoute.value.query).toEqual({});
        expect(view.testId('empty')?.textContent).toContain('No runs yet');
    });

    it('narrows the runs to a preset day range: the offset resets and the list refetches with the bounds', async () => {
        const view = await open('/runs?filter[status]=failed&page[offset]=25');
        const today = toDateInput(new Date());

        buttonOf(view.root, 'Today')!.click();
        await settle();

        expect(view.router.currentRoute.value.query).toEqual({
            'codec': 'url-simple',
            'filter[status]': 'failed',
            'from': today,
            'to': today,
        });
        expect(view.listed()).toMatchObject({
            status: ['failed'],
            createdAt: { gte: fromDateInput(today, 'start'), lte: fromDateInput(today, 'end') },
            offset: 0,
        });
    });

    it('reads the days from the route and clears them with the other filters', async () => {
        const view = await open('/runs?from=2026-11-01&to=2026-11-07');

        expect(view.listed().createdAt).toEqual({
            gte: fromDateInput('2026-11-01', 'start'),
            lte: fromDateInput('2026-11-07', 'end'),
        });

        const empty = view.testId('empty');

        expect(empty?.textContent).toContain('No runs match these filters');

        buttonOf(empty!, 'Clear filters')!.click();
        await settle();

        expect(view.router.currentRoute.value.query).toEqual({});
        expect(view.listed().createdAt).toBeUndefined();
    });
});
