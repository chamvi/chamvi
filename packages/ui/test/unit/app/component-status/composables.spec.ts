/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import type { ComponentWire } from '@chamvi/ui-kit';
import { useComponents } from '../../../../app/component-status/composables.ts';
import { COMPONENTS_POLL_MS } from '../../../../app/component-status/constants.ts';
import { apiError, fakeClient } from '../../../utils/client.ts';
import { createFakeTimers, flush } from '../../../utils/timers.ts';

const COMPONENTS: ComponentWire[] = [
    {
        name: 'store-purge',
        kind: 'job',
        lastSuccessAt: '2026-11-18T10:00:00.000Z',
        lastRunAt: '2026-11-18T10:00:00.000Z',
    },
    {
        name: 'cron',
        kind: 'channel',
        runningSince: '2026-11-18T09:00:00.000Z',
    },
];

describe('useComponents', () => {
    it('lists the components and marks the list loaded', async () => {
        const client = fakeClient({ listComponents: async () => COMPONENTS });
        const scope = effectScope();
        const state = scope.run(() => useComponents(client, createFakeTimers().timers))!;

        expect(state.loaded.value).toBe(false);
        await flush();
        expect(state.components.value).toEqual(COMPONENTS);
        expect(state.loaded.value).toBe(true);
        expect(state.error.value).toBeUndefined();
        scope.stop();
    });

    it('a 403 sets error without throwing', async () => {
        const client = fakeClient({
            listComponents: async () => {
                throw apiError(403, 'forbidden');
            },
        });
        const scope = effectScope();
        const state = scope.run(() => useComponents(client, createFakeTimers().timers))!;

        await flush();
        expect(state.error.value?.status).toBe(403);
        expect(state.loaded.value).toBe(true);
        scope.stop();
    });

    it('refreshes every COMPONENTS_POLL_MS and stops with its scope', async () => {
        let calls = 0;
        const client = fakeClient({
            listComponents: async () => {
                calls++;

                return calls === 1 ? COMPONENTS : [COMPONENTS[0]!];
            },
        });
        const fake = createFakeTimers();
        const scope = effectScope();
        const state = scope.run(() => useComponents(client, fake.timers))!;

        await flush();
        expect(calls).toBe(1);
        expect(fake.pending()).toEqual([COMPONENTS_POLL_MS]);

        fake.fire();
        await flush();
        expect(calls).toBe(2);
        expect(state.components.value.map((component) => component.name)).toEqual(['store-purge']);

        scope.stop();
        expect(fake.pending()).toEqual([]);
    });

    it('clears an earlier error once a pass succeeds', async () => {
        let calls = 0;
        const client = fakeClient({
            listComponents: async () => {
                calls++;

                if (calls === 1) {
                    throw apiError(503, 'database_unavailable');
                }

                return COMPONENTS;
            },
        });
        const fake = createFakeTimers();
        const scope = effectScope();
        const state = scope.run(() => useComponents(client, fake.timers))!;

        await flush();
        expect(state.error.value?.code).toBe('database_unavailable');

        fake.fire();
        await flush();
        expect(state.error.value).toBeUndefined();
        expect(state.components.value).toEqual(COMPONENTS);
        scope.stop();
    });
});
