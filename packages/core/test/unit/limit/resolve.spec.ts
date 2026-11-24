/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import type { ToolSet } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import type { Agent, AgentLimits, IEngine } from '@chamvi/core';
import { toolContextSchema } from '../../../src/tool/constants.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import type { TestServiceSet, TestServices } from '../../utils/engine.ts';
import { mockModel } from '../../utils/mock-model.ts';
import {
    HOUR,
    call,
    dispatchLimited,
    searchTool,
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

function servicesWithoutLimits(): TestServices {
    const services: Partial<TestServiceSet> = createTestServices();

    delete services.limitService;

    return services as TestServices;
}

/** Tool sets whose limits cannot be enforced, each with the message refusing it. */
function misconfigured(): Record<string, {
    tools: ToolSet;
    limits?: AgentLimits;
    withoutService?: boolean;
    message: string
}> {
    const hand = tool({
        inputSchema: z.object({ q: z.string() }),
        execute: async ({ q }: { q: string }) => q,
        contextSchema: toolContextSchema,
        limit: { max: 0, windowMs: HOUR },
    } as never);

    return {
        'buckets that disagree': {
            tools: {
                search: searchTool([], {
                    max: 2,
                    windowMs: HOUR,
                    bucket: 'mail',
                }),
                list: searchTool([], {
                    max: 3,
                    windowMs: HOUR,
                    bucket: 'mail',
                }),
            },
            message: 'share the limit bucket "mail"',
        },
        'a limit on a tool without execute': {
            tools: { search: searchTool([]), manual: tool({ inputSchema: z.object({ q: z.string() }) }) },
            limits: { manual: { max: 1, windowMs: HOUR } },
            message: 'The limit of manual needs a tool with execute.',
        },
        'a hand-built chamvi tool with a malformed limit': {
            tools: { search: searchTool([]), hand },
            message: 'tool "hand"',
        },
        'a tool\'s own limit without a limit service': {
            tools: { search: searchTool([], { max: 1, windowMs: HOUR }) },
            withoutService: true,
            message: 'needs an engine with a limit service',
        },
    };
}

async function failedRun(ctx: ReturnType<typeof setup>) {
    const runId = await dispatchLimited(ctx);

    return ctx.store.runService.findOne(runId);
}

describe('tool limits: resolution', () => {
    it('limits: { x: false } removes a tool\'s own limit', async () => {
        const log: string[] = [];
        const ctx = setup({
            tools: { search: searchTool(log, { max: 1, windowMs: HOUR }) },
            limits: { search: false },
            responses: [turn(call('search', { q: 'a' })), turn(call('search', { q: 'b' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(log).toEqual(['a', 'b']);
        expect(ctx.notifier.calls).toEqual([]);
        expect(await ctx.store.limitService.used('limited:search', HOUR)).toBe(0);
    });

    it('the agent\'s entry replaces the tool\'s own limit whole', async () => {
        const ctx = setup({
            tools: {
                search: searchTool([], {
                    max: 1,
                    windowMs: HOUR,
                    bucket: 'web',
                }),
            },
            limits: { search: { max: 3, windowMs: HOUR } },
            responses: [turn(call('search', { q: 'a' }), call('search', { q: 'b' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(ctx.notifier.calls).toEqual([]);
        expect(await ctx.store.limitService.used('limited:search', HOUR)).toBe(2);
        expect(await ctx.store.limitService.used('limited:web', HOUR)).toBe(0);
    });

    it('a third-party tool\'s own limit field is ignored, the agent\'s entry applies', async () => {
        const plain = (max: number) => tool({
            inputSchema: z.object({ q: z.string() }),
            execute: async ({ q }: { q: string }) => q,
            limit: { max, windowMs: HOUR },
        } as never);
        const ctx = setup({
            tools: { other: plain(1), named: plain(1) },
            limits: { named: { max: 5, windowMs: HOUR } },
            responses: [turn(call('other', { q: 'a' }), call('other', { q: 'b' }), call('named', { q: 'c' })), text('done')],
        });

        await dispatchLimited(ctx);
        expect(ctx.notifier.calls).toEqual([]);
        expect(await ctx.store.limitService.used('limited:other', HOUR)).toBe(0);
        expect(await ctx.store.limitService.used('limited:named', HOUR)).toBe(1);
    });

    it.each(Object.entries(misconfigured()))('a tools factory with %s fails the run', async (_name, item) => {
        const ctx = setup({
            tools: () => item.tools,
            ...(item.limits ? { limits: item.limits } : {}),
            ...(item.withoutService ? { services: servicesWithoutLimits() } : {}),
            responses: [turn(call('search', { q: 'a' })), text('done')],
        });
        const runId = await dispatchLimited(ctx);
        const run = await ctx.engine.runService.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error).toMatchObject({ code: 'invalid_agent_definition' });
        expect(run?.error?.message).toContain(item.message);
    });

    it.each(Object.entries(misconfigured()))('a static tool set with %s is refused at registration', (_name, item) => {
        const agent = defineModelAgent({
            name: 'limited',
            model: mockModel([]),
            instructions: 'x',
            tools: item.tools,
            ...(item.limits ? { limits: item.limits } : {}),
        });

        expect(() => createTestEngine({
            agents: [agent],
            ...(item.withoutService ? { services: servicesWithoutLimits() } : {}),
        })).toThrow(item.message);
    });
});

describe('tool limits: agent definition', () => {
    const model = mockModel([]);

    it('takes an agent whose limits are all false on an engine without a limit service', () => {
        const agent = defineModelAgent({
            name: 'open',
            model,
            instructions: 'x',
            tools: { search: searchTool([]) },
            limits: { search: false },
        });

        expect(() => createTestEngine({ services: servicesWithoutLimits(), agents: [agent] })).not.toThrow();
    });

    it('refuses a limits key naming no tool of a plain tool set', () => {
        expect(() => defineModelAgent({
            name: 'typo',
            model,
            instructions: 'x',
            tools: { search: searchTool([]) },
            limits: { serach: { max: 1, windowMs: HOUR } },
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => defineModelAgent({
            name: 'typo',
            model,
            instructions: 'x',
            tools: { search: searchTool([]) },
            limits: { serach: false },
        })).toThrow('Agent "typo" limits tool "serach", which it does not have.');
    });

    it('refuses an unknown limits key of a hand-built agent at registration', () => {
        const agent = {
            kind: 'model',
            name: 'hand',
            definition: {
                name: 'hand',
                model,
                instructions: 'x',
                tools: { search: searchTool([]) },
                limits: { serach: { max: 1, windowMs: HOUR } },
            },
        } as unknown as Agent;

        expect(() => createTestEngine({ agents: [agent] })).toThrow('Agent "hand" limits tool "serach", which it does not have.');
    });

    it('takes any limits key of a tools factory at definition, refusing an unknown one at execution', async () => {
        expect(() => defineModelAgent({
            name: 'factory',
            model,
            instructions: 'x',
            tools: () => ({ search: searchTool([]) }),
            limits: { serach: { max: 1, windowMs: HOUR } },
        })).not.toThrow();

        const ctx = setup({
            tools: () => ({ search: searchTool([]) }),
            limits: { serach: { max: 1, windowMs: HOUR } },
            responses: [turn(call('search', { q: 'a' })), text('done')],
        });
        const run = await failedRun(ctx);

        expect(run?.status).toBe('failed');
        expect(run?.error?.message).toBe('Agent "limited" limits tool "serach", which it does not have.');
    });
});
