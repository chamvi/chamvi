/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { defineTool } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import { stableHash } from '../../../src/effect/helpers.ts';
import { formatLimitWindow } from '../../../src/limit/helpers.ts';
import {
    HOUR,
    call,
    dispatchLimited,
    promptOf,
    searchTool,
    sendTool,
    setupLimits,
    stopEngines,
    text,
    turn,
} from '../../utils/limits.ts';

const engines: IEngine[] = [];

afterEach(() => stopEngines(engines));

function setup(...args: Parameters<typeof setupLimits>) {
    const ctx = setupLimits(...args);

    engines.push(ctx.engine);

    return ctx;
}

describe('tool limits: counting', () => {
    it('runs and counts a call under the limit, keyed by run, step and call', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 2, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' }, 'c1')), text('done')],
        });
        const runId = await dispatchLimited(ctx);
        const run = await ctx.store.runService.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(log).toEqual(['a']);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
        expect(ctx.notifier.calls).toEqual([]);

        // the counted call is known under its key; a second record of it is no second use
        await ctx.store.limitService.record('limited:search', `${runId}:0:${stableHash('c1')}`, 1, HOUR);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('releases the lock of the scope after the check', async () => {
        const ctx = setup({
            tools: { search: searchTool([], { max: 2, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' })), text('done')],
        });

        await dispatchLimited(ctx);
        await expect(ctx.store.lockService.acquire('limit:limited:search', 'other', 1_000)).resolves.toBeTypeOf('number');
    });

    it('counts the weight of a call', async () => {
        const ctx = setup({
            tools: {
                search: searchTool([], {
                    max: 5,
                    windowMs: HOUR,
                    weight: (input: { q: string }) => input.q.length,
                }),
            },
            responses: [turn(call('search', { q: 'abc' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(await ctx.store.limitService.used('limited:search')).toBe(3);
    });

    it.each([0, 1.5, -1, NaN, '2', 2 ** 31])('refuses the weight %s as a tool error and counts nothing', async (weight) => {
        const log: string[] = [];
        const ctx = setup({
            tools: {
                search: searchTool(log, {
                    max: 5,
                    windowMs: HOUR,
                    weight: () => weight as number,
                }),
            },
            responses: [turn(call('search', { q: 'a' })), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual([]);
        expect(promptOf(ctx, 1)).toContain('The limit weight of tool \\"search\\" must be an integer from 1 to 2147483647.');
        expect(await ctx.store.limitService.used('limited:search')).toBe(0);
    });

    it('a call that throws after being counted stays counted', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 2, windowMs: HOUR }, { fail: true }) },
            responses: [turn(call('search', { q: 'a' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(log).toEqual(['a']);
        expect(promptOf(ctx, 1)).toContain('search a failed');
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('a bucket shared by two tools counts both', async () => {
        const mail = {
            max: 2,
            windowMs: HOUR,
            bucket: 'mail',
        };
        const ctx = setup({
            tools: { read: searchTool([], mail), list: searchTool([], mail) },
            responses: [
                turn(call('read', { q: 'a' }), call('list', { q: 'b' })),
                turn(call('read', { q: 'c' })),
                text('done'),
            ],
        });
        const runId = await dispatchLimited(ctx);

        expect(await ctx.store.limitService.used('limited:mail')).toBe(2);
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('waiting');
        expect(ctx.notifier.calls[0]?.title).toBe('Limit reached for read: 2 of 2 used in the last 1h. Allow this call?');
    });

    it('two parallel calls at max - 1 on one scope: exactly one runs unasked', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' }), call('search', { q: 'b' })), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        expect(log).toHaveLength(1);
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('waiting');
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('a recorded effect replay neither counts nor asks', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { send: sendTool(log, { max: 1, windowMs: HOUR }) },
            responses: [
                turn(call('send', { to: 'ann' })),
                turn(call('send', { to: 'ann' })),
                text('done'),
            ],
        });
        const runId = await dispatchLimited(ctx);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['ann']);
        expect(ctx.notifier.calls).toEqual([]);
        expect(await ctx.store.limitService.used('limited:send')).toBe(1);
    });

    it('an effect alreadyApplied found neither counts nor asks', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { send: sendTool(log, { max: 1, windowMs: HOUR }, (to) => `sent ${to} before`) },
            responses: [turn(call('send', { to: 'ann' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(log).toEqual([]);
        expect(await ctx.store.limitService.used('limited:send')).toBe(0);
    });

    it('parallel identical effect calls in one step are counted once', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { send: sendTool(log, { max: 2, windowMs: HOUR }) },
            responses: [turn(call('send', { to: 'ann' }), call('send', { to: 'ann' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(log).toEqual(['ann']);
        expect(await ctx.store.limitService.used('limited:send')).toBe(1);
    });

    it('a call counts again once the window passed', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            responses: [turn(call('search', { q: 'a' })), text('done'), turn(call('search', { q: 'b' })), text('done')],
        });

        await dispatchLimited(ctx);
        ctx.clock.advance(HOUR);
        await dispatchLimited(ctx);
        expect(log).toEqual(['a', 'b']);
        expect(ctx.notifier.calls).toEqual([]);
    });

    it('limits a streaming tool before it yields', async () => {
        const yielded: string[] = [];
        const stream = defineTool({
            inputSchema: z.object({ q: z.string() }),
            limit: {
                max: 1,
                windowMs: HOUR,
                onExceed: 'deny',
            },
            async* execute({ q }) {
                yielded.push(q);
                yield `found ${q}`;
            },
        });
        const ctx = setup({
            tools: { stream },
            responses: [turn(call('stream', { q: 'a' })), turn(call('stream', { q: 'b' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(yielded).toEqual(['a']);
        expect(promptOf(ctx, 2)).toContain('Over the limit of stream: 1 of 1 used in the last 1h.');
    });

    it('hashes a scope longer than 255 characters', async () => {
        const name = `t${'x'.repeat(260)}`;
        const ctx = setup({
            tools: {
                [name]: tool({
                    inputSchema: z.object({ q: z.string() }),
                    execute: async ({ q }) => q,
                }),
            },
            limits: { [name]: { max: 2, windowMs: HOUR } },
            responses: [turn(call(name, { q: 'a' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(await ctx.store.limitService.used(`limited:#${stableHash(name)}`)).toBe(1);
    });
});

describe('tool limits: deny', () => {
    it('onExceed deny gives the deny message as a tool error and counts nothing', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: {
                search: searchTool(log, {
                    max: 1,
                    windowMs: 90 * 60 * 1000,
                    onExceed: 'deny',
                }),
            },
            responses: [turn(call('search', { q: 'a' })), turn(call('search', { q: 'b' })), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a']);
        expect(ctx.notifier.calls).toEqual([]);
        expect(promptOf(ctx, 2)).toContain('Over the limit of search: 1 of 1 used in the last 90m.');
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('gives up on a lock held past its TTL with a tool error', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
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

        for (let i = 0; i < 300; i++) {
            const run = await ctx.store.runService.findOne(runId);

            if (run?.status === 'completed' || run?.status === 'failed') {
                break;
            }

            ctx.clock.advance(100);
            await new Promise((resolve) => {
                setImmediate(resolve);
            });
        }

        await ctx.engine.idle();
        expect((await ctx.store.runService.findOne(runId))?.error).toBeUndefined();
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual([]);
        expect(promptOf(ctx, 1)).toContain('was not released within 10000ms');
    });
});

describe('formatLimitWindow', () => {
    it.each([
        [3_600_000, '1h'],
        [7_200_000, '2h'],
        [5_400_000, '90m'],
        [45_000, '45s'],
        [60_000, '1m'],
        [1_500, '1500ms'],
        [1, '1ms'],
    ])('formats %i as %s', (ms, expected) => {
        expect(formatLimitWindow(ms)).toBe(expected);
    });
});
