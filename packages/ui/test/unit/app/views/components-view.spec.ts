/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import { Permission } from '@chamvi/access';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { ApiError } from '@chamvi/ui-kit';
import type { ComponentWire } from '@chamvi/ui-kit';
import { RouteName } from '../../../../app/router/constants.ts';
import ComponentsView from '../../../../app/views/ComponentsView.vue';
import { fakeClient } from '../../../utils/client.ts';
import { ALL } from '../../../utils/permissions.ts';
import { mountView } from '../../../utils/view.ts';

const MINUTE = 60_000;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

let unmount: (() => void) | undefined;

afterEach(() => {
    unmount?.();
    unmount = undefined;
});

async function open(listComponents: () => Promise<ComponentWire[]>) {
    const view = await mountView(ComponentsView, {
        path: '/components',
        pattern: '/components',
        name: RouteName.COMPONENTS,
        client: fakeClient({ listComponents }),
        names: ALL,
    });

    unmount = view.unmount;

    return view;
}

const row = (root: HTMLElement, name: string) => root.querySelector<HTMLTableRowElement>(`tr[data-component="${CSS.escape(name)}"]`)!;
const cell = (tr: HTMLTableRowElement, key: string) => tr.querySelector<HTMLTableCellElement>(`td[data-time="${CSS.escape(key)}"]`)!;

describe('the components view', () => {
    it('lists jobs, then channels, with their kind, status and pass times', async () => {
        const success = ago(3 * MINUTE);
        const view = await open(async () => [
            {
                name: 'store-purge',
                kind: 'job',
                lastSuccessAt: success,
                lastRunAt: success,
            },
            {
                name: 'agents-packages',
                kind: 'job',
                lastSuccessAt: ago(60 * MINUTE),
                lastErrorAt: ago(4 * MINUTE),
                lastRunAt: ago(4 * MINUTE),
            },
            { name: 'knowledge-managed', kind: 'job' },
            {
                name: 'cron',
                kind: 'channel',
                lastSuccessAt: ago(MINUTE),
                runningSince: ago(120 * MINUTE),
            },
        ]);
        const names = [...view.root.querySelectorAll('tr[data-component]')].map((tr) => tr.getAttribute('data-component'));

        expect(names).toEqual(['store-purge', 'agents-packages', 'knowledge-managed', 'cron']);
        expect(view.testId('components-count')?.textContent).toBe('3 jobs · 1 channel');

        const purge = row(view.root, 'store-purge');

        expect(purge.querySelector('.comp-name')?.textContent).toBe('store-purge');
        expect(purge.querySelector('.kind')?.textContent).toBe('job');
        expect(purge.querySelector('.kind-channel')).toBeNull();
        expect(purge.querySelector('[data-testid="component-status"]')?.className).toContain('chip-completed');
        expect(purge.querySelector('[data-testid="component-status"]')?.textContent).toBe('healthy');

        const when = cell(purge, 'lastSuccessAt').querySelector('.when')!;

        // relative text, the absolute time as the title
        expect(when.getAttribute('title')).toBe(new Date(success).toLocaleString());
        expect(when.textContent).toMatch(/ago/);
        expect(cell(purge, 'lastErrorAt').textContent?.trim()).toBe('—');
        expect(cell(purge, 'runningSince').textContent?.trim()).toBe('—');

        const failing = row(view.root, 'agents-packages');

        expect(failing.querySelector('[data-testid="component-status"]')?.textContent).toBe('failing');
        expect(failing.querySelector('[data-testid="component-status"]')?.className).toContain('chip-failed');
        expect(cell(failing, 'lastErrorAt').querySelector('.when-fail')).not.toBeNull();
        expect(cell(failing, 'lastSuccessAt').querySelector('.when-fail')).toBeNull();

        const idle = row(view.root, 'knowledge-managed').querySelector('[data-testid="component-status"]');

        expect(idle?.textContent).toBe('idle');
        expect(idle?.className).toContain('chip-queued');

        const cron = row(view.root, 'cron');

        expect(cron.classList.contains('kind-break')).toBe(true);
        expect(row(view.root, 'store-purge').classList.contains('kind-break')).toBe(false);
        expect(cron.querySelector('.kind.kind-channel')?.textContent).toBe('channel');
        expect(cron.querySelector('[data-testid="component-status"]')?.className).toContain('chip-running');
        expect(cell(cron, 'runningSince').querySelector('.when')?.textContent).toMatch(/ago/);
    });

    it('shows the empty state when the app has no component', async () => {
        const view = await open(async () => []);

        expect(view.testId('empty')?.textContent).toContain('No components');
        expect(view.testId('components')).toBeNull();
        expect(view.testId('components-count')?.textContent).toBe('0 jobs · 0 channels');
    });

    it('names the permission on a 403 for a direct visit', async () => {
        const view = await open(async () => {
            throw new ApiError(403, 'FORBIDDEN', `Missing permission "${Permission.COMPONENT_READ}".`);
        });

        expect(view.testId('components-forbidden')?.textContent).toContain(Permission.COMPONENT_READ);
        expect(view.testId('components')).toBeNull();
        expect(view.testId('empty')).toBeNull();
        expect(view.testId('components-count')).toBeNull();
    });

    it('shows another failure by code and message', async () => {
        const view = await open(async () => {
            throw new ApiError(503, 'database_unavailable', 'The store did not answer.');
        });

        expect(view.testId('components-error')?.textContent?.trim()).toBe('database_unavailable · The store did not answer.');
    });
});
