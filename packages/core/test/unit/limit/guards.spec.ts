/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { IEngine } from '@chamvi/core';
import { stableHash } from '../../../src/effect/helpers.ts';
import { LockService } from '../../../src/lock/index.ts';
import { createTestServices } from '../../utils/engine.ts';
import {
    HOUR,
    LIMIT_START,
    call,
    promptOf,
    searchTool,
    sendTool,
    setupLimits,
    stopEngines,
    text,
    turn,
} from '../../utils/limits.ts';
import { ControllableClock } from '../../utils/clock.ts';

const engines: IEngine[] = [];

afterEach(() => stopEngines(engines));

function setup(...args: Parameters<typeof setupLimits>) {
    const ctx = setupLimits(...args);

    engines.push(ctx.engine);

    return ctx;
}

const flush = () => new Promise((resolve) => {
    setImmediate(resolve);
});

describe('tool limits: guards', () => {
    it('a run that ends while its call waits on the limit lock never executes the tool', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 5, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' })), text('done')],
            claimTtlMs: 60_000,
        });

        await ctx.store.lockService.acquire('limit:limited:search', 'other', 60_000);
        await ctx.engine.start();

        const { runId } = await ctx.engine.dispatch({
            agent: 'limited',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        for (let i = 0; i < 5; i++) {
            ctx.clock.advance(100);
            await flush();
        }

        await ctx.engine.cancel(runId);
        await ctx.store.lockService.release('limit:limited:search', 'other');

        for (let i = 0; i < 5; i++) {
            ctx.clock.advance(100);
            await flush();
        }

        await ctx.engine.idle();
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('cancelled');
        expect(log).toEqual([]);
        expect(await ctx.store.limitService.used('limited:search', HOUR)).toBe(0);
    });

    it('an effect tool of a run that ended while it waited on the lock never applies', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { send: sendTool(log, { max: 5, windowMs: HOUR }) },
            responses: [turn(call('send', { to: 'ann' })), text('done')],
            claimTtlMs: 60_000,
        });

        await ctx.store.lockService.acquire('limit:limited:send', 'other', 60_000);
        await ctx.engine.start();

        const { runId } = await ctx.engine.dispatch({
            agent: 'limited',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        await flush();
        await ctx.engine.cancel(runId);
        await ctx.store.lockService.release('limit:limited:send', 'other');

        for (let i = 0; i < 5; i++) {
            ctx.clock.advance(100);
            await flush();
        }

        await ctx.engine.idle();
        expect(log).toEqual([]);
    });

    it('a use recorded without its marker is not counted or checked again', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 2, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' }, 'c1')), text('done')],
        });
        const { runId } = await ctx.engine.dispatch({
            agent: 'limited',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        // the use of the call landed, its marker did not (a crash in between); others filled the scope
        await ctx.store.limitService.record('limited:search', `${runId}:0:${stableHash('c1')}`, 1);
        await ctx.store.limitService.record('limited:search', 'other-run:0:x', 1);
        await ctx.engine.start();
        await ctx.engine.idle();

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a']);
        expect(ctx.notifier.calls).toEqual([]);
        expect(await ctx.store.limitService.used('limited:search', HOUR)).toBe(2);
        expect(await ctx.store.effectService.findOne(`limit:limited:search:${runId}:0:${stableHash('c1')}`)).toBeDefined();
    });

    it('refuses the call when the lock\'s lease was lost before the use is recorded', async () => {
        const log: string[] = [];
        const clock = new ControllableClock(new Date(LIMIT_START));
        const services = createTestServices({
            clock,
            lockService: (lockContext) => new class extends LockService {
                override async holds(): Promise<boolean> {
                    return false;
                }
            }(lockContext),
        });
        const ctx = setup({
            tools: { search: searchTool(log, { max: 2, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' })), text('done')],
            services,
        });

        await ctx.engine.start();
        await ctx.engine.dispatch({
            agent: 'limited',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });
        await ctx.engine.idle();

        expect(log).toEqual([]);
        expect(promptOf(ctx, 1)).toContain('lost its lease');
        expect(await services.limitService!.used('limited:search', HOUR)).toBe(0);
    });

    it('reads an agent limit entry only from its own keys: a tool named constructor stays unlimited', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { constructor: searchTool(log) },
            limits: {},
            responses: [turn(call('constructor', { q: 'a' })), text('done')],
        });
        const { runId } = await ctx.engine.dispatch({
            agent: 'limited',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        await ctx.engine.start();
        await ctx.engine.idle();

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a']);
    });
});
