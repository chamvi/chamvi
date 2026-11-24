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
import { approvalWait } from '../../utils/approvals.ts';
import {
    HOUR,
    answerLimited,
    call,
    chatChannel,
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

const TITLE = 'Limit reached for search: 1 of 1 used in the last 1h. Allow this call?';

/** Two searches in two model steps, then the answer: the second is over a limit of one. */
const twoSearches = () => [
    turn(call('search', { q: 'a' }, 'c1')),
    turn(call('search', { q: 'b' }, 'c2')),
    text('done'),
];

describe('tool limits: approval', () => {
    it('asks over the limit with the exact title and the detail body, delivered to the source channel', async () => {
        const log: string[] = [];
        const { channel, sent } = chatChannel();
        const ctx = setup({
            tools: {
                search: searchTool(log, {
                    max: 1,
                    windowMs: HOUR,
                    detail: (input: { q: string }) => `search for ${input.q}`,
                }),
            },
            channels: [channel],
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx, { channel: 'chat', address: 'room-1' });
        const run = await ctx.store.runService.findOne(runId);

        expect(run?.status).toBe('waiting');
        expect(log).toEqual(['a']);
        expect(approvalWait(run)).toMatchObject({
            toolName: 'search',
            title: TITLE,
            body: 'search for b',
        });
        expect(approvalWait(run)?.approvalId).toMatch(/^bound:/);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
            address: 'room-1',
            message: {
                kind: 'approval',
                title: TITLE,
                body: 'search for b',
            },
        });
    });

    it.each([
        ['a tainted run to an address that is no direct one', { untrusted: true, direct: false }, true],
        ['a tainted run to a channel that cannot tell', { untrusted: true }, true],
        ['a tainted run to a direct address', { untrusted: true, direct: true }, false],
        ['an untainted run', { untrusted: false, direct: false }, false],
    ] as const)('sends the detail to the source only when it stays private: %s', async (_name, options, generic) => {
        const { channel, sent } = chatChannel('chat', options);
        const ctx = setup({
            tools: {
                search: searchTool([], {
                    max: 1,
                    windowMs: HOUR,
                    detail: (input: { q: string }) => `search for ${input.q}`,
                }),
            },
            channels: [channel],
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx, { channel: 'chat', address: 'room-1' });
        const waiting = approvalWait(await ctx.store.runService.findOne(runId));

        // the inbox and the API always hold the body
        expect(waiting?.body).toBe('search for b');
        expect(sent).toHaveLength(1);

        if (generic) {
            expect(waiting?.notification).toBe('A tool call over its limit requires review in the approval inbox.');
            expect(sent[0]!.message).toMatchObject({ body: 'A tool call over its limit requires review in the approval inbox.', generic: true });
            expect(JSON.stringify(sent[0]!.message)).not.toContain('search for b');
        } else {
            expect(waiting?.notification).toBeUndefined();
            expect(sent[0]!.message.body).toBe('search for b');
            expect(sent[0]!.message.generic).toBeUndefined();
        }
    });

    it('asks in the inbox only when the source channel has no out', async () => {
        const ctx = setup({
            tools: { search: searchTool([], { max: 1, windowMs: HOUR }) },
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx, { address: 'caller' });
        const waiting = approvalWait(await ctx.store.runService.findOne(runId));

        expect(waiting?.title).toBe(TITLE);
        expect(waiting?.channel).toBeUndefined();
        expect(waiting?.address).toBeUndefined();
        expect(waiting?.body).toBeUndefined();
    });

    it('an approved call runs and counts', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx);

        await answerLimited(ctx, true);
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a', 'b']);
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(await ctx.store.limitService.used('limited:search')).toBe(2);
    });

    it('a denied call is a tool error and counts nothing', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx);

        await answerLimited(ctx, false);
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a']);
        expect(promptOf(ctx, 2)).toContain('Over the limit of search and not approved.');
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('a denied call resumed after the window drained does not run and counts nothing', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx);

        ctx.clock.advance(HOUR);
        expect(await ctx.store.limitService.used('limited:search')).toBe(0);
        await answerLimited(ctx, false);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a']);
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(promptOf(ctx, 2)).toContain('Over the limit of search and not approved.');
        expect(await ctx.store.limitService.used('limited:search')).toBe(0);
    });

    it('an approved call resumed after the window drained runs once and counts once', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx);

        ctx.clock.advance(HOUR);
        await answerLimited(ctx, true);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a', 'b']);
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('a counted call resumed after its use expired and was purged is not checked again', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: 60_000 }, { approve: true }) },
            responses: [turn(call('search', { q: 'a' }, 'c1')), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?']);

        ctx.clock.advance(120_000);
        await ctx.store.limitService.purgeExpired();
        await ctx.store.limitService.record('limited:search', 'other-run:0:x', 1, HOUR);
        await answerLimited(ctx, true);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a', 'a']);
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('a weight larger than max always asks', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: {
                search: searchTool(log, {
                    max: 2,
                    windowMs: HOUR,
                    weight: () => 3,
                }),
            },
            responses: [turn(call('search', { q: 'a' })), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('waiting');
        expect(log).toEqual([]);
        expect(ctx.notifier.calls[0]?.title).toBe('Limit reached for search: 0 of 2 used in the last 1h (this call: 3). Allow this call?');

        await answerLimited(ctx, true);
        expect(log).toEqual(['a']);
        expect(await ctx.store.limitService.used('limited:search')).toBe(3);
    });

    it('a call resumed after the window drained runs without a second ask, counts once and keeps its own approve() ids', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }, { approve: true }) },
            responses: twoSearches(),
        });
        const runId = await dispatchLimited(ctx);

        // the first search asks for its own approval: it was counted before
        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?']);
        expect(ctx.notifier.calls[0]!.approvalId).toBe('0:c1:0');
        await answerLimited(ctx, true, 0);

        // the replayed first call was counted already: no limit approval, no second count
        expect(log).toEqual(['a', 'a']);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?', TITLE]);

        ctx.clock.advance(HOUR);
        await answerLimited(ctx, true, 1);

        // the second call runs without asking for the limit again; its own approve() is ordinal 0
        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?', TITLE, 'Search b?']);
        expect(ctx.notifier.calls[2]!.approvalId).toMatch(/^\d+:c2:0$/);
        await answerLimited(ctx, true, 2);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual(['a', 'a', 'b', 'b']);
        expect(ctx.notifier.calls).toHaveLength(3);
        expect(await ctx.store.limitService.used('limited:search')).toBe(1);
    });

    it('a call resumed within the window takes the recorded decision', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }, { approve: true }) },
            responses: [turn(call('search', { q: 'a' }, 'c1'), call('search', { q: 'b' }, 'c2')), text('done')],
        });
        const runId = await dispatchLimited(ctx);

        // one call counted and asks for its own approval, the other asks for the limit
        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?']);
        await answerLimited(ctx, true, 0);
        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?', TITLE]);
        await answerLimited(ctx, true, 1);
        expect(ctx.notifier.calls.map((c) => c.title)).toEqual(['Search a?', TITLE, 'Search b?']);
        await answerLimited(ctx, true, 2);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(ctx.notifier.calls).toHaveLength(3);
        expect(await ctx.store.limitService.used('limited:search')).toBe(2);
    });

    it('parallel identical effect calls over the limit ask once and count once', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { send: sendTool(log, { max: 1, windowMs: HOUR }) },
            responses: [
                turn(call('send', { to: 'ann' })),
                turn(call('send', { to: 'bob' }), call('send', { to: 'bob' })),
                text('done'),
            ],
        });
        const runId = await dispatchLimited(ctx);

        expect(ctx.notifier.calls).toHaveLength(1);
        await answerLimited(ctx, true);
        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(ctx.notifier.calls).toHaveLength(1);
        expect(log).toEqual(['ann', 'bob']);
        expect(await ctx.store.limitService.used('limited:send')).toBe(2);
    });
});
