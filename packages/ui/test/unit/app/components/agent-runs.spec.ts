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
import { defineComponent, h } from 'vue';
import type { AgentWire, RunListQuery, RunPage } from '@chamvi/http-kit';
import { fromDateInput, toDateInput } from '@vuecs/forms';
import AgentRuns from '../../../../app/components/agent-runs/AgentRuns.vue';
import { RouteName } from '../../../../app/router/constants.ts';
import { fakeClient } from '../../../utils/client.ts';
import { ALL } from '../../../utils/permissions.ts';
import { filterOf } from '../../../utils/runs.ts';
import { mountView, settle } from '../../../utils/view.ts';

const AGENT: AgentWire = {
    name: 'deploy',
    kind: 'model',
    channels: [{ channel: 'http', id: 'http' }],
    budget: { maxSteps: 20 },
    state: [],
    private: false,
};

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
    const view = await mountView(defineComponent({ render: () => h(AgentRuns, { agent: AGENT }) }), {
        path,
        pattern: '/agents/:name',
        name: RouteName.AGENT,
        client: fakeClient({
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

    return { ...view, listed: () => filterOf(queries.at(-1)) };
}

const buttonOf = (root: ParentNode, text: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((element) => element.textContent?.trim() === text);

describe('the agent page runs tab', () => {
    it('narrows the runs to a preset day range: the offset resets and the list refetches with the bounds', async () => {
        const view = await open('/agents/deploy?tab=runs&page[offset]=25');
        const today = toDateInput(new Date());

        buttonOf(view.root, 'Today')!.click();
        await settle();

        expect(view.router.currentRoute.value.query).toEqual({
            tab: 'runs', 
            from: today, 
            to: today, 
        });
        expect(view.listed()).toMatchObject({
            agent: 'deploy',
            createdAt: { gte: fromDateInput(today, 'start'), lte: fromDateInput(today, 'end') },
            offset: 0,
        });
    });

    it('clears the days with the status filter from the no-results state', async () => {
        const view = await open('/agents/deploy?tab=runs&from=2026-11-01&filter[status]=failed');

        expect(view.listed().createdAt).toEqual({ gte: fromDateInput('2026-11-01', 'start') });

        buttonOf(view.testId('empty')!, 'Clear filters')!.click();
        await settle();

        expect(view.router.currentRoute.value.query).toEqual({ tab: 'runs' });
        expect(view.listed().createdAt).toBeUndefined();
    });
});
