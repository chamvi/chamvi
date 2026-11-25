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
import { approve, defineTool, toolLimitApproved } from '@chamvi/core';
import type { IEngine, ToolContext, ToolLimit } from '@chamvi/core';
import {
    HOUR,
    answerLimited,
    call,
    dispatchLimited,
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

/** A tool recording `toolLimitApproved(ctx)` per execution; `ask` makes it call approve() after. */
function probeTool(log: boolean[], limit?: ToolLimit, options: { ask?: boolean } = {}) {
    return defineTool({
        inputSchema: z.object({ q: z.string() }),
        ...(limit !== undefined ? { limit } : {}),
        execute: async ({ q }, { context }) => {
            log.push(toolLimitApproved(context));

            if (options.ask) {
                await approve(context, { title: `Search ${q}?` });
            }

            return `found ${q}`;
        },
    });
}

const twoCalls = () => [
    turn(call('probe', { q: 'a' }, 'c1')),
    turn(call('probe', { q: 'b' }, 'c2')),
    text('done'),
];

describe('toolLimitApproved', () => {
    it('under the limit is false', async () => {
        const log: boolean[] = [];
        const ctx = setup({
            tools: { probe: probeTool(log, { max: 2, windowMs: HOUR }) },
            responses: twoCalls(),
        });
        const runId = await dispatchLimited(ctx);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual([false, false]);
    });

    it('over the limit and approved is true', async () => {
        const log: boolean[] = [];
        const ctx = setup({
            tools: { probe: probeTool(log, { max: 1, windowMs: HOUR }) },
            responses: twoCalls(),
        });
        const runId = await dispatchLimited(ctx);

        await answerLimited(ctx, true);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual([false, true]);
    });

    it('a replay of an approved over-limit call after a crash past the count is true', async () => {
        const log: boolean[] = [];
        const ctx = setup({
            tools: { probe: probeTool(log, { max: 1, windowMs: HOUR }, { ask: true }) },
            responses: twoCalls(),
        });
        const runId = await dispatchLimited(ctx);

        // the first call is under the limit and asks for its own approval
        await answerLimited(ctx, true, 0);
        // the second is over the limit: approved, counted, then it asks for its own
        await answerLimited(ctx, true, 1);
        expect(log).toEqual([false, false, true]);

        // the resumed second call re-runs execute with its counted marker present
        await answerLimited(ctx, true, 2);

        expect((await ctx.store.runService.findOne(runId))?.status).toBe('completed');
        expect(log).toEqual([false, false, true, true]);
        expect(await ctx.store.limitService.used('limited:probe', HOUR)).toBe(2);
    });

    it('a tool without a limit is false', async () => {
        const log: boolean[] = [];
        const ctx = setup({
            tools: { probe: probeTool(log) },
            responses: twoCalls(),
        });

        await dispatchLimited(ctx);

        expect(log).toEqual([false, false]);
    });

    it('outside a tool call is false', () => {
        expect(toolLimitApproved({ run: { runId: 'r1' } } as ToolContext)).toBe(false);
    });
});
