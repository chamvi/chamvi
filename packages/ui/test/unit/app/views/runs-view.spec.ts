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
import type { AgentList, RunPage } from '@chamvi/http-kit';
import { RouteName } from '../../../../app/router/constants.ts';
import RunsView from '../../../../app/views/RunsView.vue';
import { fakeClient } from '../../../utils/client.ts';
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
    const view = await mountView(RunsView, {
        path,
        pattern: '/runs',
        name: RouteName.RUNS,
        client: fakeClient({
            agent: { getMany: async (): Promise<AgentList> => ({ data: [], issues: [] }) },
            schedule: { getMany: async () => [] },
            run: { getMany: async () => EMPTY },
        }),
        names: ALL,
    });

    unmount = view.unmount;

    return view;
}

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
});
