/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    Engine,
    agent,
    agentChannel,
    defineAgent,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import type {
    CodeRunContext,
    DispatchResult,
    IStore,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { nextRun, treeModel } from '../../utils/dispatch.ts';
import type { ChildTurn } from '../../utils/dispatch.ts';
import type { MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const text = (t: string, usage?: MockResponse['usage']): MockResponse => ({
    parts: [{ type: 'text', text: t }],
    ...(usage ? { usage } : {}),
});

type FanRun = (payload: unknown, ctx: CodeRunContext) => unknown;

function build(store: IStore, clock: ControllableClock, run: FanRun, child: ChildTurn, maxSubtreeTokens?: number) {
    const fan = defineAgent({
        name: 'fan',
        run,
        ...(maxSubtreeTokens !== undefined ? { budget: { maxSubtreeTokens } } : {}),
    });
    const worker = defineAgent({
        name: 'worker',
        instructions: 'You work.',
        model: treeModel([], child),
        channels: [agent.on({ role: 'item', from: ['fan'] })],
    });

    return new Engine({
        store,
        clock,
        agents: [fan, worker],
        channels: [agentChannel()],
        onError: () => {},
    });
}

async function root(engine: Engine): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'fan',
        trigger: 'test',
        channel: 'test',
        payload: { items: ['a', 'b'] },
    });

    return runId;
}

describe('code agent fan-out', () => {
    it('dispatches two children, waits and completes with both outcomes', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const engine = build(store, clock, async (payload, ctx) => {
            const { items } = payload as { items: string[] };
            const started = await Promise.all(items.map((item) => dispatchTo(ctx, {
                agent: 'worker', 
                role: 'item', 
                payload: item, 
            })));

            return waitForDispatch(ctx, started);
        }, (payload) => text(`out-${String(payload)}`));
        const waiting = nextRun(engine, (run) => run.agent === 'fan' && run.status === 'waiting');
        const parentId = await root(engine);

        await waiting;
        await engine.idle();

        const parent = await store.runs.findOne(parentId);
        const { data: children } = await store.runs.find({ parentRunId: parentId });
        const idOf = (p: string) => children.find((r) => r.trigger.payload === p)!.id;

        expect(children).toHaveLength(2);
        expect(children.every((c) => c.parentRunId === parentId && c.status === 'completed')).toBe(true);
        expect(parent?.status).toBe('completed');
        expect(parent?.output).toEqual([
            {
                runId: idOf('a'),
                agent: 'worker',
                role: 'item',
                status: 'completed',
                output: 'out-a',
            },
            {
                runId: idOf('b'),
                agent: 'worker',
                role: 'item',
                status: 'completed',
                output: 'out-b',
            },
        ]);

        await engine.stop();
    });

    it('a third dispatch past the subtree budget fails the run', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const engine = build(store, clock, async (payload, ctx) => {
            const { items } = payload as { items: string[] };
            const started = await Promise.all(items.map((item) => dispatchTo(ctx, {
                agent: 'worker', 
                role: 'item', 
                payload: item, 
            })));

            await waitForDispatch(ctx, started);
            await dispatchTo(ctx, {
                agent: 'worker', 
                role: 'item', 
                payload: 'c', 
            });

            return 'unreachable';
        }, (payload) => text(`out-${String(payload)}`, { inputTokens: 10, outputTokens: 5 }), 30);
        const parentId = await root(engine);

        await engine.idle();

        const parent = await store.runs.findOne(parentId);

        expect(parent?.status).toBe('failed');
        expect(parent?.error).toEqual({
            code: 'BudgetExceeded',
            message: `Run ${parentId} reached its subtree token budget of 30 tokens.`,
        });
        expect((await store.runs.find({ parentRunId: parentId })).data).toHaveLength(2);

        await engine.stop();
    });

    it('recovers after a drain between dispatch and wait without re-creating a child', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const results: DispatchResult[][] = [];
        let calls = 0;
        let hold = true;
        const fanRun: FanRun = async (payload, ctx) => {
            calls++;

            const { items } = payload as { items: string[] };
            const started = await Promise.all(items.map((item) => dispatchTo(ctx, {
                agent: 'worker', 
                role: 'item', 
                payload: item, 
            })));

            results.push(started);

            if (hold) {
                // the crash window: children exist, the wait was not reached
                await new Promise<never>((_resolve, reject) => {
                    ctx.run.signal.addEventListener('abort', () => reject(ctx.run.signal.reason), { once: true });
                });
            }

            return waitForDispatch(ctx, started);
        };
        // engine A: the children never answer
        const a = build(store, clock, fanRun, () => new Promise<MockResponse>(() => {}));
        const created = Promise.withResolvers<void>();
        let seen = 0;

        a.on('run.updated', ({ run }) => {
            if (run.agent === 'worker' && run.status === 'running' && ++seen === 2) {
                created.resolve();
            }
        });

        const parentId = await root(a);

        await created.promise;

        const draining = a.drain({ timeoutMs: 1_000 });

        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        clock.advance(1_000);
        await draining;

        expect((await store.runs.findOne(parentId))?.status).toBe('interrupted');

        hold = false;

        const b = build(store, clock, fanRun, (payload) => text(`out-${String(payload)}`));

        await b.start();
        await b.idle();

        const parent = await store.runs.findOne(parentId);
        const { data: children } = await store.runs.find({ parentRunId: parentId });

        expect(children).toHaveLength(2);
        expect(parent?.status).toBe('completed');
        expect((parent?.output as Array<{ status: string }>).map((o) => o.status)).toEqual(['completed', 'completed']);
        expect(calls).toBeGreaterThanOrEqual(3);

        for (const started of results) {
            expect(started).toEqual(results[0]);
            expect(started.every((r) => r.deduplicated === false)).toBe(true);
        }

        await b.stop();
    });
});
