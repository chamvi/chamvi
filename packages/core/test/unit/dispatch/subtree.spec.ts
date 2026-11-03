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
    vi,
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    agent,
    agentChannel,
    defineAgent,
    defineTool,
    dispatch,
    waitForDispatch,
} from '@chamvi/core';
import type { IEngine, IStore } from '@chamvi/core';
import { MemoryRunRepository, createMemoryStore } from '../../../src/repository/index.ts';
import type { RunFindOptions } from '../../../src/repository/types.ts';
import { ControllableClock } from '../../utils/clock.ts';
import {
    gate,
    nextRun,
    promptHas,
    treeModel,
} from '../../utils/dispatch.ts';
import type { ChildTurn, ParentTurn } from '../../utils/dispatch.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';
import { createMemoryStoreWithRuns } from '../../utils/store.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (toolName: string, input: unknown, toolCallId: string): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const turn = (usage: MockResponse['usage'], ...parts: MockPart[]): MockResponse => ({ parts, usage });
const text = (t: string, usage?: MockResponse['usage']): MockResponse => ({ parts: [{ type: 'text', text: t }], usage });
const done = () => Array.from({ length: 10 }, () => text('done', { inputTokens: 0, outputTokens: 0 }));

const fan = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => {
        const started = await Promise.all(payloads.map((payload) => dispatch(context, { payload })));

        return waitForDispatch(context, started);
    },
});

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function build(parent: ParentTurn[], child: ChildTurn, options: {
    store?: IStore;
    clock?: ControllableClock;
    maxSubtreeTokens?: number
} = {}) {
    const clock = options.clock ?? new ControllableClock(START);
    const store = options.store ?? createMemoryStore({ clock });
    const errors: unknown[] = [];
    const lead = defineAgent({
        name: 'lead',
        instructions: 'You lead.',
        model: treeModel([...parent, ...done()], child),
        channels: [agent.on({ maxDepth: 2 })],
        tools: { fan },
        ...(options.maxSubtreeTokens !== undefined ? { budget: { maxSubtreeTokens: options.maxSubtreeTokens } } : {}),
    });
    const engine = new Engine({
        store,
        clock,
        agents: [lead],
        channels: [agentChannel()],
        onError: (error) => {
            errors.push(error);
        },
    });

    engines.push(engine);

    return {
        engine,
        store,
        errors,
    };
}

async function root(engine: IEngine): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'lead',
        trigger: 'test',
        channel: 'test',
        payload: {},
    });

    return runId;
}

describe('subtree usage', () => {
    it('subtreeUsage sums descendants', async () => {
        // a: dispatches g (4+2), then answers (6+3); b answers (20+5); g answers (1+1)
        const child: ChildTurn = (payload, options) => {
            if (payload === 'a') {
                return promptHas(options, 'out-g') ?
                    text('out-a', { inputTokens: 6, outputTokens: 3 }) :
                    turn({ inputTokens: 4, outputTokens: 2 }, call('fan', { payloads: ['g'] }, 'a1'));
            }

            return payload === 'b' ?
                text('out-b', { inputTokens: 20, outputTokens: 5 }) :
                text('out-g', { inputTokens: 1, outputTokens: 1 });
        };
        const { engine, store } = build([turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['a', 'b'] }, 'c1'))], child);
        const parentId = await root(engine);

        await engine.idle();

        const parent = await store.runs.findOne(parentId);
        const { data } = await store.runs.find({ parentRunId: parentId });
        const a = data.find((r) => r.trigger.payload === 'a')!;
        const b = data.find((r) => r.trigger.payload === 'b')!;

        expect(parent?.status).toBe('completed');
        expect(a.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
        expect(b.usage).toEqual({ inputTokens: 20, outputTokens: 5 });
        expect(a.subtreeUsage).toEqual({ inputTokens: 1, outputTokens: 1 });
        // a run that dispatched nothing has none
        expect(b.subtreeUsage).toBeUndefined();
        expect(parent?.subtreeUsage).toEqual({ inputTokens: 31, outputTokens: 11 });
    });

    it('a child settling moves neither the parent\'s updatedAt nor the wait step start', async () => {
        const clock = new ControllableClock(START);
        const holdA = gate();
        const holdB = gate();
        const { engine, store } = build([turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['a', 'b'] }, 'c1'))], async (payload) => {
            await (payload === 'a' ? holdA : holdB).wait();

            return text(`out-${String(payload)}`, { inputTokens: 1, outputTokens: 1 });
        }, { clock });
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await root(engine);

        await paused;

        const waited = await store.runs.findOneOrFail(parentId);

        clock.advance(1_000);
        holdA.open();
        await vi.waitFor(async () => {
            expect((await store.runs.findOneOrFail(parentId)).subtreeUsage).toEqual({ inputTokens: 1, outputTokens: 1 });
        });
        expect((await store.runs.findOneOrFail(parentId)).updatedAt).toEqual(waited.updatedAt);

        clock.advance(1_000);
        holdB.open();
        await engine.idle();

        const wait = (await store.steps.find(parentId)).find((s) => s.kind === 'wait');

        expect((await store.runs.findOneOrFail(parentId)).status).toBe('completed');
        expect(wait?.startedAt).toEqual(waited.updatedAt);
    });

    it('no double count after a lost push and tick heal', async () => {
        const clock = new ControllableClock(START);
        const runs = new (class extends MemoryRunRepository {
            armed = false;

            override async find(options: RunFindOptions) {
                const result = await super.find(options);
                const settled = result.data.length > 0 && result.data.every((r) => r.status === 'completed');

                // the push's read of the settled children fails once
                if (this.armed && options.ids && settled) {
                    this.armed = false;

                    throw new Error('lost push');
                }

                return result;
            }
        })({ clock });
        const store = createMemoryStoreWithRuns(runs, { clock });
        const hold = gate();
        const { engine } = build([turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['a'] }, 'c1'))], async () => {
            await hold.wait();

            return text('out-a', { inputTokens: 7, outputTokens: 3 });
        }, { store, clock });
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await root(engine);

        await paused;
        runs.armed = true;
        hold.open();
        await engine.idle();

        expect((await store.runs.findOne(parentId))?.status).toBe('waiting');

        await engine.tick();
        await engine.idle();
        await engine.tick();

        const parent = await store.runs.findOne(parentId);

        expect(parent?.status).toBe('completed');
        expect(parent?.subtreeUsage).toEqual({ inputTokens: 7, outputTokens: 3 });
        expect((await store.steps.find(parentId)).filter((s) => s.kind === 'wait')).toHaveLength(1);
    });

    it('a dispatch is refused once an ancestor\'s subtree budget is reached', async () => {
        const { engine, store } = build([
            turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['a'] }, 'c1')),
            turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['b'] }, 'c2')),
        ], (payload) => text(`out-${String(payload)}`, { inputTokens: 20, outputTokens: 10 }), { maxSubtreeTokens: 30 });
        const parentId = await root(engine);

        await engine.idle();

        const parent = await store.runs.findOne(parentId);
        const tools = (await store.steps.find(parentId)).filter((s) => s.kind === 'tool');

        expect(parent?.status).toBe('completed');
        expect(parent?.subtreeUsage).toEqual({ inputTokens: 20, outputTokens: 10 });
        expect(tools[1]?.error).toEqual({
            code: 'BudgetExceeded',
            message: `Run ${parentId} reached its subtree token budget of 30 tokens.`,
        });
        expect((await store.runs.find({ parentRunId: parentId })).data).toHaveLength(1);
    });

    it('interleaved sibling settles leave the correct total', async () => {
        const clock = new ControllableClock(START);
        const reached = Promise.withResolvers<void>();
        const release = gate();
        const store = createMemoryStore({ clock });
        const find = store.runs.find.bind(store.runs);
        let stallFor: string | undefined;

        store.runs.find = async (options) => {
            const result = await find(options);

            // the first recompute reads the children, then stalls until the sibling's settle wrote
            if (stallFor !== undefined && options.parentRunId === stallFor && options.status === undefined) {
                stallFor = undefined;
                reached.resolve();
                await release.wait();
            }

            return result;
        };

        const holdA = gate();
        const holdB = gate();
        const { engine } = build([turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['a', 'b'] }, 'c1'))], async (payload) => {
            await (payload === 'a' ? holdA : holdB).wait();

            return text(`out-${String(payload)}`, { inputTokens: 1, outputTokens: 1 });
        }, { store, clock });
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await root(engine);

        await paused;
        stallFor = parentId;
        holdA.open();
        await reached.promise;

        const completed = nextRun(engine, (run) => run.id === parentId && run.status === 'completed');

        holdB.open();
        await completed;
        expect((await store.runs.findOneOrFail(parentId)).subtreeUsage).toEqual({ inputTokens: 2, outputTokens: 2 });

        // the stalled recompute writes its stale read last
        release.open();
        await engine.idle();

        expect((await store.runs.findOneOrFail(parentId)).subtreeUsage).toEqual({ inputTokens: 2, outputTokens: 2 });
    });

    it('a stale stored subtree total does not bypass the budget', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const update = store.runs.update.bind(store.runs);

        // every subtree recompute is lost: the stored total stays empty
        store.runs.update = async (id, patch, options) => (patch.subtreeUsage !== undefined ?
            store.runs.findOneOrFail(id) :
            update(id, patch, options));

        const { engine } = build([
            turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['a'] }, 'c1')),
            turn({ inputTokens: 0, outputTokens: 0 }, call('fan', { payloads: ['b'] }, 'c2')),
        ], (payload) => text(`out-${String(payload)}`, { inputTokens: 20, outputTokens: 10 }), {
            store,
            clock,
            maxSubtreeTokens: 30,
        });
        const parentId = await root(engine);

        await engine.idle();

        const parent = await store.runs.findOne(parentId);
        const tools = (await store.steps.find(parentId)).filter((s) => s.kind === 'tool');

        expect(parent?.subtreeUsage).toBeUndefined();
        expect(tools[1]?.error).toEqual({
            code: 'BudgetExceeded',
            message: `Run ${parentId} reached its subtree token budget of 30 tokens.`,
        });
        expect((await store.runs.find({ parentRunId: parentId })).data).toHaveLength(1);
    });
});
