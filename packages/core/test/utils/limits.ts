/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { z } from 'zod';
import {
    approve,
    defineEffectTool,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type {
    AgentLimits,
    ChannelMessage,
    IChannel,
    IEngine,
    ToolLimit,
} from '@chamvi/core';
import { recordApprovals } from './approvals.ts';
import { ControllableClock } from './clock.ts';
import { createTestEngine, createTestServices } from './engine.ts';
import type { TestServices } from './engine.ts';
import { mockModel } from './mock-model.ts';
import type { MockPart, MockResponse } from './mock-model.ts';

export const LIMIT_START = 1_000_000;

export const HOUR = 60 * 60 * 1000;

export const call = (toolName: string, input: unknown, toolCallId?: string): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    ...(toolCallId !== undefined ? { toolCallId } : {}),
});

export const turn = (...parts: MockPart[]): MockResponse => ({ parts });

export const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

/** A plain chamvi tool recording each executed query in `log`. */
export function searchTool(log: string[], limit?: ToolLimit, options: { approve?: boolean; fail?: boolean } = {}) {
    return defineTool({
        inputSchema: z.object({ q: z.string() }),
        ...(limit !== undefined ? { limit } : {}),
        execute: async ({ q }, { context }) => {
            log.push(q);

            if (options.fail) {
                throw new Error(`search ${q} failed`);
            }

            if (options.approve) {
                const decision = await approve(context, { title: `Search ${q}?` });

                return decision.approved ? `found ${q}` : `not searched ${q}`;
            }

            return `found ${q}`;
        },
    });
}

/** An effect tool keyed by `to` across runs, recording each application in `log`. */
export function sendTool(log: string[], limit?: ToolLimit, alreadyApplied?: (to: string) => unknown) {
    return defineEffectTool({
        inputSchema: z.object({ to: z.string() }),
        ...(limit !== undefined ? { limit } : {}),
        effectKey: (input) => `send:${input.to}`,
        ...(alreadyApplied ? { alreadyApplied: async (_key: string, input: { to: string }) => alreadyApplied(input.to) } : {}),
        execute: async ({ to }) => {
            log.push(to);

            return `sent ${to}`;
        },
    });
}

/** A source channel with `out`, recording what it is sent. */
export function chatChannel(name = 'chat') {
    const sent: Array<{ message: ChannelMessage; address: string }> = [];
    const channel: IChannel = {
        name,
        async out(message, address) {
            sent.push({ message, address });
        },
    };

    return { channel, sent };
}

export type LimitSetup = {
    tools: ToolSet | (() => ToolSet);
    responses: MockResponse[];
    limits?: AgentLimits;
    channels?: IChannel[];
    services?: TestServices;
    /** Default 30: a poll every 10 ms of the clock. */
    claimTtlMs?: number;
};

export function setupLimits(s: LimitSetup) {
    const clock = new ControllableClock(new Date(LIMIT_START));
    const store = createTestServices({ clock });
    const model = mockModel(s.responses);
    const errors: unknown[] = [];
    const engine = createTestEngine({
        services: s.services ?? store,
        agents: [defineModelAgent({
            name: 'limited',
            instructions: 'You search.',
            model,
            tools: s.tools,
            ...(s.limits !== undefined ? { limits: s.limits } : {}),
        })],
        channels: s.channels ?? [],
        clock,
        claimTtlMs: s.claimTtlMs ?? 30,
        onError: (error) => {
            errors.push(error);
        },
    });
    const notifier = recordApprovals(engine);

    return {
        clock,
        store,
        model,
        engine,
        errors,
        notifier,
    };
}

export type LimitCtx = ReturnType<typeof setupLimits>;

const started = new WeakSet<IEngine>();

/** Starts the engine, dispatches one run of `limited` (from `channel`/`address`) and waits until it settled or paused. */
export async function dispatchLimited(ctx: LimitCtx, source: { channel?: string; address?: string } = {}): Promise<string> {
    if (!started.has(ctx.engine)) {
        started.add(ctx.engine);
        await ctx.engine.start();
    }

    const { runId } = await ctx.engine.dispatch({
        agent: 'limited',
        trigger: source.channel ?? 'http',
        channel: source.channel ?? 'http',
        payload: {},
        ...(source.address !== undefined ? { address: source.address } : {}),
    });

    await ctx.engine.idle();

    return runId;
}

/** Answers the i-th approval the engine asked for and waits until the engine settled. */
export async function answerLimited(ctx: LimitCtx, approved: boolean, i = 0): Promise<void> {
    const asked = ctx.notifier.calls[i]!;

    await ctx.engine.approve(asked.runId, { approvalId: asked.approvalId, approved });
    await ctx.engine.idle();
}

/** The prompt of the i-th model call, as JSON. */
export const promptOf = (ctx: LimitCtx, i: number) => JSON.stringify(ctx.model.doStreamCalls[i]?.prompt);

export function stopEngines(engines: IEngine[]): void {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
}
