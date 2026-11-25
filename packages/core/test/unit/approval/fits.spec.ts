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
import { z } from 'zod';
import { ValidationError, defineTool } from '@chamvi/core';
import type { ChannelMessage, IChannel, IEngine } from '@chamvi/core';
import { approvalWait } from '../../utils/approvals.ts';
import {
    HOUR,
    call,
    dispatchLimited,
    promptOf,
    searchTool,
    setupLimits,
    stopEngines,
    text,
    turn,
} from '../../utils/limits.ts';

const engines: IEngine[] = [];

afterEach(() => stopEngines(engines));

/** A channel whose `fits` refuses a title longer than `max`, recording what it was asked and sent. */
function boundedChannel(max: number) {
    const checked: Array<{ message: ChannelMessage; address: string }> = [];
    const sent: Array<{ message: ChannelMessage; address: string }> = [];
    const channel: IChannel = {
        name: 'chat',
        fits(message, address) {
            checked.push({ message, address });

            if ((message.title ?? '').length > max) {
                throw new ValidationError(`The approval does not fit ${max} characters.`);
            }
        },
        async out(message, address) {
            sent.push({ message, address });
        },
    };

    return {
        channel,
        checked,
        sent,
    };
}

const ask = (title: string) => defineTool({
    inputSchema: z.object({}),
    execute: async (_input, { context }) => {
        const decision = await context.channels.findOneOrFail('chat').approve({ title, address: 'room-2' });

        return decision.approved ? 'yes' : 'no';
    },
});

function setup(...args: Parameters<typeof setupLimits>) {
    const ctx = setupLimits(...args);

    engines.push(ctx.engine);

    return ctx;
}

describe('approval fits', () => {
    it('a ChannelHandle approval the channel refuses is the tool\'s error: nothing waits or is sent', async () => {
        const {
            channel,
            checked,
            sent,
        } = boundedChannel(5);
        const ctx = setup({
            tools: { ask: ask('Far too long a title') },
            channels: [channel],
            responses: [turn(call('ask', {})), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(checked).toHaveLength(1);
        expect(sent).toEqual([]);
        expect(ctx.notifier.calls).toEqual([]);
        expect(promptOf(ctx, 1)).toContain('The approval does not fit 5 characters.');
    });

    it('checks the message delivery sends, then suspends', async () => {
        const {
            channel,
            checked,
            sent,
        } = boundedChannel(50);
        const ctx = setup({
            tools: { ask: ask('Short') },
            channels: [channel],
            responses: [turn(call('ask', {})), text('done')],
        });
        const runId = await dispatchLimited(ctx);
        const run = await ctx.store.runService.findOne(runId);

        expect(run?.status).toBe('waiting');
        expect(sent).toHaveLength(1);
        expect(checked).toEqual(sent);
        expect(checked[0]).toMatchObject({
            address: 'room-2',
            message: {
                kind: 'approval',
                title: 'Short',
                approvalId: approvalWait(run)!.approvalId,
            },
        });
    });

    it('a recorded decision is returned without asking the channel again', async () => {
        const { channel, checked } = boundedChannel(50);
        const ctx = setup({
            tools: { ask: ask('Short') },
            channels: [channel],
            responses: [turn(call('ask', {})), text('done')],
        });
        const runId = await dispatchLimited(ctx);
        const asked = ctx.notifier.calls[0]!;

        await ctx.engine.approve(asked.runId, { approvalId: asked.approvalId, approved: true });
        await ctx.engine.idle();
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(checked).toHaveLength(1);
    });

    it('a tool limit approval the source channel refuses is the tool\'s error and counts nothing', async () => {
        const { channel, sent } = boundedChannel(5);
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            channels: [channel],
            responses: [turn(call('search', { q: 'a' })), turn(call('search', { q: 'b' })), text('done')],
        });
        const runId = await dispatchLimited(ctx, { channel: 'chat', address: 'room-1' });

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a']);
        expect(sent).toEqual([]);
        expect(promptOf(ctx, 2)).toContain('The approval does not fit 5 characters.');
        expect(await ctx.store.limitService.used('limited:search', HOUR)).toBe(1);
    });
});
