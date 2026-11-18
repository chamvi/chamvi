/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { ChannelSubscription, IChannel, IEngine } from '@chamvi/core';
import {
    InvalidAgentDefinitionError,
    defineModelAgent,
} from '@chamvi/core';
import type { CronChannelOptions } from '@chamvi/channel-cron';
import { cron, cronChannel } from '@chamvi/channel-cron';
import { textModel } from '../../utils/model.ts';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';
import { advance, createRecordingClock } from '../../utils/clock.ts';

const agentWith = (channels: ChannelSubscription[], name = 'sweep') => defineModelAgent({
    name,
    model: textModel(),
    instructions: 'x',
    channels,
});

describe('cronChannel', () => {
    let engines: IEngine[] = [];
    let clock: ControllableClock;

    const make = (
        channels: IChannel<any, any>[],
        agents: ReturnType<typeof agentWith>[],
        storage = createTestEngine({ agents: [], clock }),
    ) => {
        const engine = createTestEngine({
            replicaOf: storage,
            agents,
            channels,
            onError: () => {},
        });

        engines.push(engine);

        return { engine, storage };
    };

    const quiet = (options: CronChannelOptions = {}) => cronChannel({ onError: () => {}, ...options });

    const runs = async (storage: IEngine) => (await storage.runService.find({})).data;

    beforeEach(() => {
        clock = new ControllableClock(new Date('2026-03-01T07:59:30Z'));
    });

    afterEach(async () => {
        await Promise.all(engines.map((e) => e.drain({ timeoutMs: 1_000 })));
        engines = [];
    });

    it('is named cron by default and has no in or out', () => {
        const channel = cronChannel();

        expect(channel.name).toBe('cron');
        expect(channel.in).toBeUndefined();
        expect(channel.out).toBeUndefined();
    });

    it('fires its subscriptions once the engine started it, through the channel', async () => {
        const { engine, storage } = make([quiet()], [agentWith([cron.on('* * * * *', { overlap: 'allow' })])]);

        await advance(clock, 60_000);
        expect(await runs(storage)).toHaveLength(0);

        await engine.start();
        await advance(clock, 60_000);

        const [run] = await runs(storage);

        expect(run?.trigger).toMatchObject({
            channel: 'cron',
            trigger: 'cron:* * * * *',
            payload: { scheduledAt: '2026-03-01T08:01:00.000Z' },
        });
    });

    it('starts components only for its own subscriptions', async () => {
        const eu = quiet({ name: 'cron-eu' });
        // a channel named cron that schedules nothing: cron.on() subscriptions validate, but nobody fires them
        const idle: IChannel = { name: 'cron' };
        const { engine, storage } = make([eu, idle], [agentWith([
            eu.on('* * * * *', { overlap: 'allow', id: 'eu' }),
            cron.on('* * * * *', { overlap: 'allow', id: 'default' }),
        ])]);

        await engine.start();

        await advance(clock, 120_000);

        const fired = await runs(storage);

        expect(fired).toHaveLength(2);
        expect(fired.map((run) => [run.trigger.trigger, run.trigger.channel])).toEqual([
            ['eu', 'cron-eu'],
            ['eu', 'cron-eu'],
        ]);
    });

    it('start({ channels: false }) schedules nothing', async () => {
        const { engine, storage } = make([quiet()], [agentWith([cron.on('* * * * *', { overlap: 'allow' })])]);

        await engine.start({ channels: false });

        await advance(clock, 120_000);

        expect(await runs(storage)).toHaveLength(0);
    });

    it('drain() unschedules, a restart schedules once again', async () => {
        const { engine, storage } = make([quiet()], [agentWith([cron.on('* * * * *', { overlap: 'allow' })])]);

        await engine.start();
        await engine.drain();

        await advance(clock, 120_000);
        expect(await runs(storage)).toHaveLength(0);

        await engine.start();
        await engine.start();
        await advance(clock, 60_000);
        expect(await runs(storage)).toHaveLength(1);
    });

    it('follows agents registered after start', async () => {
        const { engine, storage } = make([quiet()], []);

        await engine.start();

        await engine.putAgent(agentWith([cron.on('* * * * *', { overlap: 'allow' })]));
        await advance(clock, 60_000);

        expect(await runs(storage)).toHaveLength(1);
    });

    it('fails engine.start() for a subscription of an agent passed in code hubwire cannot schedule', async () => {
        const { engine } = make([quiet()], [agentWith([cron.on('0 0 * * 1/2')])]);

        const started = engine.start();

        await expect(started).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(started).rejects.toThrow(/sweep.*cron:0 0 \* \* 1\/2/);
    });

    it('reports a folder agent hubwire cannot schedule with agent and subscription', async () => {
        const onError = vi.fn();
        const { engine } = make([cronChannel({ onError })], []);

        await engine.putAgent(agentWith([cron.on('0 0 * * 1/2')]), { revision: 'h1' });

        await engine.start();

        expect(onError).toHaveBeenCalledWith(expect.any(InvalidAgentDefinitionError), {
            agent: 'sweep',
            subscription: 'cron:0 0 * * 1/2',
        });
    });

    it('reports a failing lock with agent and subscription and keeps ticking', async () => {
        const error = new Error('lock store down');
        const storage = createTestEngine({ agents: [], clock });
        const acquire = storage.lockService.acquire.bind(storage.lockService);

        vi.spyOn(storage.lockService, 'acquire')
            .mockRejectedValueOnce(error)
            .mockImplementation(acquire);

        const onError = vi.fn();
        const { engine } = make(
            [cronChannel({ onError })],
            [agentWith([cron.on('* * * * *', { overlap: 'allow' })])],
            storage,
        );

        await engine.start();

        await advance(clock, 60_000);
        expect(onError).toHaveBeenCalledWith(error, { agent: 'sweep', subscription: 'cron:* * * * *' });
        expect(await runs(storage)).toHaveLength(0);

        await advance(clock, 60_000);
        expect(await runs(storage)).toHaveLength(1);
    });

    it('two replicas on one store dispatch once per tick', async () => {
        const storage = createTestEngine({ agents: [], clock });
        const agent = agentWith([cron.on('* * * * *', { overlap: 'allow' })]);
        const a = make([quiet({ owner: 'a' })], [agent], storage);
        const b = make([quiet({ owner: 'b' })], [agent], storage);

        await a.engine.start();
        await b.engine.start();

        await advance(clock, 60_000);
        expect(await runs(storage)).toHaveLength(1);
    });

    it('arms its timers on the engine clock without unref, so they hold the process', async () => {
        const recording = createRecordingClock(new Date('2026-03-01T07:59:30Z'));
        const build = (channels: IChannel<any, any>[], agents: ReturnType<typeof agentWith>[]) => {
            const engine = createTestEngine({
                agents,
                channels,
                clock: recording.clock,
                onError: () => {},
            });

            engines.push(engine);

            return engine;
        };

        // the engine's own timers never hold the process
        await build([], []).start();
        expect(recording.holding()).toHaveLength(0);

        await build([quiet()], [agentWith([cron.on('* * * * *', { overlap: 'allow' })])]).start();
        expect(recording.holding()).toHaveLength(1);

        // the tick re-arms a timer that holds the process as well
        recording.inner.advance(30_000);
        expect(recording.timers.filter((t) => t.fired && !t.unrefed).length).toBeGreaterThan(0);
        expect(recording.holding()).toHaveLength(1);
    });

    describe('status()', () => {
        it('answers {} before the start and before any pass', async () => {
            const channel = quiet();
            const { engine } = make([channel], [agentWith([cron.on('* * * * *', { overlap: 'allow' })])]);

            expect(channel.status()).toEqual({});

            await engine.start();
            expect(channel.status()).toEqual({});
        });

        it('answers the latest lastSuccessAt and lastRunAt over its subscriptions', async () => {
            const channel = quiet();
            const { engine } = make([channel], [agentWith([
                cron.on('* * * * *', { overlap: 'allow', id: 'minutely' }),
                cron.on('*/2 * * * *', { overlap: 'allow', id: 'even' }),
            ])]);

            await engine.start();
            // 08:00 fires both, 08:01 the minutely one only
            await advance(clock, 90_000);

            const at = new Date('2026-03-01T08:01:00Z').getTime();
            const status = channel.status();

            expect(status?.lastSuccessAt).toBeGreaterThanOrEqual(at);
            expect(status?.lastRunAt).toBe(status?.lastSuccessAt);
            expect(status?.lastErrorAt).toBeUndefined();
            expect(status?.runningSince).toBeUndefined();
        });

        it('answers the earliest runningSince of the ticks in flight and lastErrorAt of a failed one', async () => {
            const storage = createTestEngine({ agents: [], clock });
            const create = storage.runService.create.bind(storage.runService);
            const { promise: gate, resolve: release } = Promise.withResolvers<void>();

            vi.spyOn(storage.runService, 'create')
                .mockImplementationOnce(async (...args) => {
                    await gate;

                    return create(...args);
                })
                .mockRejectedValueOnce(new Error('store down'))
                .mockImplementation(create);

            const channel = quiet();
            const { engine } = make([channel], [agentWith([
                cron.on('* * * * *', { overlap: 'allow', id: 'slow' }),
                cron.on('*/2 * * * *', { overlap: 'allow', id: 'failing' }),
            ])], storage);

            await engine.start();
            await advance(clock, 31_000);

            const status = channel.status();
            const tick = new Date('2026-03-01T08:00:00Z').getTime();

            expect(status?.runningSince).toBeGreaterThanOrEqual(tick);
            expect(status?.runningSince).toBeLessThan(tick + 1_000);
            expect(status?.lastErrorAt).toBeGreaterThanOrEqual(tick);
            expect(status?.lastSuccessAt).toBeUndefined();

            release();
            await advance(clock, 1_000);

            expect(channel.status().runningSince).toBeUndefined();
            expect(channel.status().lastSuccessAt).toBeGreaterThanOrEqual(tick);
        });

        it('answers {} again once stopped', async () => {
            const channel = quiet();
            const { engine } = make([channel], [agentWith([cron.on('* * * * *', { overlap: 'allow' })])]);

            await engine.start();
            await advance(clock, 60_000);
            expect(channel.status().lastSuccessAt).toBeDefined();

            await engine.drain();
            expect(channel.status()).toEqual({});
        });
    });

    it('refuses an invalid lockTtlMs when built', () => {
        expect(() => cronChannel({ lockTtlMs: 0 })).toThrow(InvalidAgentDefinitionError);
        expect(() => cronChannel({ lockTtlMs: 1.5 })).toThrow(InvalidAgentDefinitionError);
    });
});
