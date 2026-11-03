/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { ToolSet } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    InvalidAgentDefinitionError,
    agent,
    agentChannel,
    approve,
    defineAgent,
    defineTool,
    dispatch,
} from '@chamvi/core';
import type {
    ChannelSubscription,
    DispatchInput,
    IEngine,
    IStore,
    Run,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { approvalWait } from '../../utils/approvals.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (input: unknown, toolCallId: string, toolName = 'fan'): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

const fanInput = z.object({
    role: z.string().optional(),
    payload: z.unknown().optional(),
    concurrencyKey: z.string().optional(),
});

const fan = defineTool({
    inputSchema: fanInput,
    execute: async (input, { context }) => dispatch(context, input as DispatchInput),
});

function firstText(options: LanguageModelV4CallOptions): string {
    const first = options.prompt.find((m) => m.role === 'user');

    if (!first || typeof first.content === 'string') {
        return '';
    }

    return first.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

/** A model per run, picked by the first marker found in the run's trigger (`''` matches every run). */
function markedModel(scripts: [string, MockResponse[]][]) {
    const models = scripts.map(([marker, script]) => [marker, mockModel([...script, ...Array.from({ length: 20 }, () => text('done'))])] as const);

    return new MockLanguageModelV4({
        doStream: (options) => {
            const prompt = firstText(options);
            const [, model] = models.find(([marker]) => prompt.includes(marker))!;

            return model.doStream(options);
        },
    });
}

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function setup(options: {
    model: MockLanguageModelV4;
    channels: ChannelSubscription<any>[];
    tools?: ToolSet;
    maxSubtreeTokens?: number;
    concurrencyMaxRuns?: number;
    store?: IStore;
}) {
    const clock = new ControllableClock(START);
    const store = options.store ?? createMemoryStore({ clock });
    const maintainer = defineAgent({
        name: 'maintainer',
        instructions: 'You maintain.',
        model: options.model,
        channels: options.channels,
        tools: options.tools ?? { fan },
        ...(options.maxSubtreeTokens !== undefined ? { budget: { maxSubtreeTokens: options.maxSubtreeTokens } } : {}),
    });
    const engine = new Engine({
        store,
        clock,
        agents: [maintainer],
        channels: [agentChannel()],
        ...(options.concurrencyMaxRuns !== undefined ? { concurrencyMaxRuns: options.concurrencyMaxRuns } : {}),
        onError: () => {},
    });

    engines.push(engine);

    return { engine, store };
}

async function children(store: IStore): Promise<Run[]> {
    const { data } = await store.runs.find({ agent: 'maintainer' });

    return data.filter((run) => run.trigger.channel === 'agent');
}

async function toolSteps(store: IStore, runId: string) {
    return (await store.steps.find(runId)).filter((step) => step.kind === 'tool');
}

describe('dispatch guards', () => {
    it('refuses an ancestor key', async () => {
        const { engine, store } = setup({
            model: markedModel([['', [turn(call({ payload: 'job' }, 'c1')), text('done')]]]),
            channels: [agent.on({ concurrencyKey: () => 'k' })],
        });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
            concurrencyKey: 'k',
        });

        await engine.idle();

        const [step] = await toolSteps(store, runId);

        expect(step?.error).toEqual({
            code: 'validation_error',
            message: `A dispatch to agent "maintainer" with concurrency key "k" would wait on run ${runId}, which holds that key.`,
        });
        expect(await children(store)).toHaveLength(0);
        expect(await store.effects.findOne(`dispatch-count:${runId}:maintainer:default`)).toBeUndefined();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
    });

    it('another key passes', async () => {
        const { engine, store } = setup({
            model: markedModel([['', [turn(call({ payload: 'job', concurrencyKey: 'other' }, 'c1')), text('done')]]]),
            channels: [agent.on({ concurrencyKey: () => 'k' })],
        });

        await engine.start();
        await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
            concurrencyKey: 'k',
        });
        await engine.idle();

        const [child] = await children(store);

        expect(child?.concurrencyKey).toBe('other');
    });

    it("refuses a grandparent's key", async () => {
        const { engine, store } = setup({
            model: markedModel([
                ['level-1', [turn(call({ payload: 'level-2', concurrencyKey: 'k' }, 'g2'))]],
                ['', [turn(call({ payload: 'level-1', concurrencyKey: 'c1' }, 'g1'))]],
            ]),
            channels: [agent.on({ maxDepth: 2 })],
        });

        await engine.start();

        const { runId: rootId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
            concurrencyKey: 'k',
        });

        await engine.idle();

        const all = await children(store);

        expect(all).toHaveLength(1);
        expect(all[0]!.trigger.payload).toBe('level-1');

        const [refused] = await toolSteps(store, all[0]!.id);

        expect(refused?.error).toEqual({
            code: 'validation_error',
            message: `A dispatch to agent "maintainer" with concurrency key "k" would wait on run ${rootId}, which holds that key.`,
        });
    });

    it('refuses once the subtree budget is reached', async () => {
        const { engine, store } = setup({
            model: markedModel([['', [turn(call({ payload: 'job' }, 'c1')), text('done')]]]),
            channels: [agent.on()],
            maxSubtreeTokens: 1000,
        });
        const { runId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await store.runs.update(runId, { subtreeUsage: { inputTokens: 600, outputTokens: 400 } });
        await engine.start();
        await engine.idle();

        const [step] = await toolSteps(store, runId);

        expect(step?.error).toEqual({
            code: 'BudgetExceeded',
            message: `Run ${runId} reached its subtree token budget of 1000 tokens.`,
        });
        expect(await children(store)).toHaveLength(0);
        expect(await store.effects.findOne(`dispatch-count:${runId}:maintainer:default`)).toBeUndefined();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
    });

    it('a subtree under the budget passes', async () => {
        const { engine, store } = setup({
            model: markedModel([['', [turn(call({ payload: 'job' }, 'c1')), text('done')]]]),
            channels: [agent.on()],
            maxSubtreeTokens: 1000,
        });
        const { runId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await store.runs.update(runId, { subtreeUsage: { inputTokens: 600, outputTokens: 399 } });
        await engine.start();
        await engine.idle();

        expect(await children(store)).toHaveLength(1);
    });

    it('a replayed call keeps its child once the subtree budget is reached', async () => {
        const gated = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                const result = await dispatch(context, { payload: 'once' });

                await approve(context, { title: 'go on?' });

                return result;
            },
        });
        const { engine, store } = setup({
            model: markedModel([['', [turn(call({}, 'c1', 'gated')), text('done')]]]),
            channels: [agent.on()],
            tools: { gated },
            maxSubtreeTokens: 1000,
        });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await engine.idle();

        const paused = await store.runs.findOne(runId);

        expect(paused?.status).toBe('waiting');
        await store.runs.update(runId, { subtreeUsage: { inputTokens: 5000, outputTokens: 0 } });
        await engine.approve(runId, { approvalId: approvalWait(paused)!.approvalId, approved: true });
        await engine.idle();

        const all = await children(store);
        const [step] = await toolSteps(store, runId);

        expect(all).toHaveLength(1);
        expect(step?.output).toEqual({ runId: all[0]!.id, deduplicated: false });
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
    });

    it("an ancestor's subtree budget refuses", async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        // dispatches, then puts the root over its budget (one run at a time: the child starts after)
        const seed = defineTool({
            inputSchema: fanInput,
            execute: async (input, { context }) => {
                const result = await dispatch(context, input as DispatchInput);

                await store.runs.update(context.run.runId, { subtreeUsage: { inputTokens: 1000, outputTokens: 0 } });

                return result;
            },
        });
        const { engine } = setup({
            model: markedModel([
                ['level-1', [turn(call({ payload: 'level-2' }, 'g2'))]],
                ['', [turn(call({ payload: 'level-1' }, 'g1', 'seed'))]],
            ]),
            channels: [agent.on({ maxDepth: 2 })],
            tools: { fan, seed },
            maxSubtreeTokens: 1000,
            concurrencyMaxRuns: 1,
            store,
        });

        await engine.start();

        const { runId: rootId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await engine.idle();

        const all = await children(store);

        expect(all).toHaveLength(1);

        const [refused] = await toolSteps(store, all[0]!.id);

        expect(refused?.error).toEqual({
            code: 'BudgetExceeded',
            message: `Run ${rootId} reached its subtree token budget of 1000 tokens.`,
        });
    });

    it.each([0, 1.5, -1, NaN])('defineAgent refuses maxSubtreeTokens %s', (value) => {
        expect(() => defineAgent({
            name: 'maintainer',
            instructions: 'You maintain.',
            model: mockModel([]),
            budget: { maxSubtreeTokens: value },
        })).toThrow(new InvalidAgentDefinitionError('Agent "maintainer": budget.maxSubtreeTokens must be a positive integer.'));
    });

    it('defineAgent keeps a valid maxSubtreeTokens', () => {
        const defined = defineAgent({
            name: 'maintainer',
            instructions: 'You maintain.',
            model: mockModel([]),
            budget: { maxSubtreeTokens: 2_000_000 },
        });

        expect(defined.definition.budget.maxSubtreeTokens).toBe(2_000_000);
    });
});
