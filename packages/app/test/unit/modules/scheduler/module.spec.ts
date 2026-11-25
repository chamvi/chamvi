/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { cron } from '@chamvi/channel-cron';
import { defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    ModuleName,
    configModule,
    engineModule,
    schedulerModule,
    storeModule,
} from '@chamvi/app';
import type { AppMode } from '@chamvi/app';
import { createHarness } from '../../../utils/harness.ts';
import type { Harness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { ControllableClock, mockModel } from '@chamvi/test-kit';


function sweep(): Agent {
    return defineModelAgent({
        name: 'sweep',
        model: mockModel(Array.from({ length: 10 }, () => ({ parts: [{ type: 'text' as const, text: 'swept' }] }))),
        instructions: 'sweep',
        channels: [cron.on('* * * * *', { overlap: 'allow' })],
    });
}

let harnesses: Harness[] = [];
let clock: ControllableClock;

/** Lets the promise chains a fired timer started (lock, dispatch, run) settle. */
const flush = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

/** Advances the clock in one-second steps, flushing after each, as a real event loop would. */
async function advance(ms: number): Promise<void> {
    for (let left = ms; left > 0; left -= 1_000) {
        clock.advance(Math.min(1_000, left));
        await flush();
    }
}

/** Advances the clock until the promise settled (a drain waits on the engine's timers). */
async function settle(promise: Promise<void>): Promise<void> {
    let done = false;
    const tracked = promise.finally(() => {
        done = true;
    });

    while (!done) {
        await advance(1_000);
    }

    await tracked;
}

afterEach(async () => {
    if (harnesses.length === 0) {
        return;
    }

    await settle(Promise.all(harnesses.map((h) => h.stop())).then(() => undefined));
    harnesses = [];
});

async function setup(options: { mode?: AppMode; env?: Record<string, string> } = {}) {
    // the engine, its cron channel and the components run on this clock
    clock = new ControllableClock(new Date('2026-03-01T07:59:30Z'));

    const logger = createRecordingLogger(clock);
    const harness = await createHarness({
        mode: options.mode,
        env: { ...options.env },
        agents: [sweep()],
        modules: [
            configModule({ clock, logger }),
            storeModule(),
            engineModule(),
            schedulerModule(),
        ],
    });

    harnesses.push(harness);

    return harness;
}

async function runs(harness: Harness) {
    return (await harness.container.resolve(AppToken.RUN_SERVICE).find({ agent: 'sweep' })).data;
}

describe('schedulerModule', () => {
    it('is named and depends on the config module', () => {
        const module = schedulerModule();

        expect(module.name).toBe(ModuleName.SCHEDULER);
        expect(module.dependencies).toEqual([ModuleName.CONFIG]);
    });

    it('contributes the cron channel, which engine.start() starts in start mode', async () => {
        const harness = await setup();
        const engine = harness.container.resolve(AppToken.ENGINE);

        expect(engine.getChannel('cron')?.start).toBeTypeOf('function');

        await advance(30_000);
        expect(await runs(harness)).toHaveLength(1);
    });

    it('SCHEDULER=false contributes a cron channel that fires nothing', async () => {
        const harness = await setup({ env: { SCHEDULER: 'false' } });
        const channel = harness.container.resolve(AppToken.ENGINE).getChannel('cron');

        expect(channel?.name).toBe('cron');
        expect(channel?.start).toBeUndefined();

        await advance(120_000);
        expect(await runs(harness)).toHaveLength(0);
    });

    it('job mode registers the cron channel but never starts it', async () => {
        const harness = await setup({ mode: 'job' });

        expect(harness.container.resolve(AppToken.ENGINE).getChannel('cron')?.start).toBeTypeOf('function');

        await advance(120_000);
        expect(await runs(harness)).toHaveLength(0);
    });

    it('teardown stops it', async () => {
        const harness = await setup();
        const runService = harness.container.resolve(AppToken.RUN_SERVICE);

        await advance(30_000);
        expect(await runs(harness)).toHaveLength(1);

        await settle(harness.stop());
        await advance(180_000);
        expect((await runService.find({ agent: 'sweep' })).data).toHaveLength(1);
    });
});
