/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '@chamvi/core';
import type { IEngine, IStore } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import type { IShutdown } from '@chamvi/http';
import { HealthService } from '../../../src/health/service.ts';

type Setup = {
    shuttingDown?: boolean;
    draining?: boolean;
    hanging?: boolean;
};

function setup({
    shuttingDown = false,
    draining = false,
    hanging = false,
}: Setup = {}) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store: IStore = createMemoryStore({ clock });

    if (hanging) {
        store.runs.findOne = () => new Promise(() => {});
    }

    const shutdown: IShutdown = {
        shuttingDown,
        onShutdown: () => () => {},
        shutdown: async () => {},
    };
    const service = new HealthService({
        engine: { isDraining: draining } as IEngine,
        store,
        clock,
        shutdown,
        readyTimeoutMs: 2_000,
    });

    return { clock, service };
}

describe('HealthService', () => {
    it('answers ok and clears its store timeout', async () => {
        const { clock, service } = setup();
        const cleared: boolean[] = [];
        const { setTimeout } = clock;

        clock.setTimeout = (fn, ms) => {
            const index = cleared.length;

            cleared.push(false);

            const timer = setTimeout.call(clock, fn, ms);

            return {
                clear: () => {
                    cleared[index] = true;
                    timer.clear();
                },
            };
        };

        expect(await service.readiness()).toEqual({ status: 'ok' });
        // no timer stays pending once readiness answered
        expect(cleared).toEqual([true]);
    });

    it('answers shutting-down once the shutdown started', async () => {
        const { service } = setup({ shuttingDown: true });

        expect(await service.readiness()).toEqual({ status: 'unavailable', reason: 'shutting-down' });
    });

    it('answers draining while the engine drains', async () => {
        const { service } = setup({ draining: true });

        expect(await service.readiness()).toEqual({ status: 'unavailable', reason: 'draining' });
    });

    it('answers store-unreachable when the store does not answer in time', async () => {
        const { clock, service } = setup({ hanging: true });
        let settled = false;
        const pending = service.readiness().then((view) => {
            settled = true;

            return view;
        });

        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(settled).toBe(false);
        clock.advance(2_000);

        expect(await pending).toEqual({ status: 'unavailable', reason: 'store-unreachable' });
    });

    it('answers shutting-down before draining and draining before the store', async () => {
        expect(await setup({
            shuttingDown: true,
            draining: true,
            hanging: true,
        }).service.readiness())
            .toEqual({ status: 'unavailable', reason: 'shutting-down' });
        expect(await setup({ draining: true, hanging: true }).service.readiness())
            .toEqual({ status: 'unavailable', reason: 'draining' });
    });
});
