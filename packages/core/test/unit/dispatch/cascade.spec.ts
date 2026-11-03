/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    agent,
    agentChannel,
    defineAgent,
    defineTool,
    dispatch,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import type { IEngine, IStore, Run } from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { gate, nextRun, treeModel } from '../../utils/dispatch.ts';
import type { ChildTurn, ParentTurn } from '../../utils/dispatch.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (toolName: string, input: unknown, toolCallId: string): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const done = () => Array.from({ length: 10 }, () => text('done'));

/** A model call that settles only by aborting. */
const hanging = (options: LanguageModelV4CallOptions) => new Promise<MockResponse>((_resolve, reject) => {
    options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
});

const fan = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => {
        const started = await Promise.all(payloads.map((payload) => dispatch(context, { payload })));

        return waitForDispatch(context, started);
    },
});

const start = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => Promise.all(payloads.map((payload) => dispatch(context, { payload }))),
});

const fanTo = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => {
        const started = await Promise.all(payloads.map((payload) => dispatchTo(context, { agent: 'worker', payload })));

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

function leadAgent(parent: ParentTurn[], child: ChildTurn) {
    return defineAgent({
        name: 'lead',
        instructions: 'You lead.',
        model: treeModel([...parent, ...done()], child),
        channels: [agent.on({ maxDepth: 2 })],
        tools: {
            fan, 
            start, 
            fanTo, 
        },
    });
}

function build(parent: ParentTurn[], child: ChildTurn, worker: ChildTurn = (_p, options) => hanging(options)) {
    const clock = new ControllableClock(START);
    const store = createMemoryStore({ clock });
    const engine = new Engine({
        store,
        clock,
        agents: [
            leadAgent(parent, child),
            defineAgent({
                name: 'worker',
                instructions: 'You work.',
                model: treeModel(done(), worker),
                channels: [agent.on({ from: ['lead'] })],
            }),
        ],
        channels: [agentChannel()],
        onError: () => {},
    });

    engines.push(engine);

    return {
        engine,
        store,
        clock,
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

async function children(store: IStore, parentId: string): Promise<Run[]> {
    const { data } = await store.runs.find({ parentRunId: parentId });

    return data;
}

/** Resolves once `count` runs dispatched by some run are `running`. */
function runningChildren(engine: IEngine, count: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const seen = new Set<string>();

    engine.on('run.updated', ({ run }) => {
        if (run.parentRunId === undefined || run.status !== 'running') {
            return;
        }

        seen.add(run.id);

        if (seen.size >= count) {
            resolve();
        }
    });

    return promise;
}

describe('dispatch cancel cascade', () => {
    it('cancelling a waiting parent cancels its children recursively', async () => {
        // a dispatches g and waits; g never answers
        const child: ChildTurn = (payload, options) => (payload === 'a' ?
            turn(call('fan', { payloads: ['g'] }, 'a1')) :
            hanging(options));
        const { engine, store } = build([turn(call('fan', { payloads: ['a'] }, 'c1'))], child);
        const grandchildRuns = runningChildren(engine, 2);
        const childWaits = nextRun(engine, (run) => run.parentRunId !== undefined && run.status === 'waiting');
        const parentId = await root(engine);

        await Promise.all([grandchildRuns, childWaits]);

        const [a] = await children(store, parentId);
        const [g] = await children(store, a!.id);

        expect(g?.status).toBe('running');
        expect((await store.runs.findOne(a!.id))?.status).toBe('waiting');
        expect((await store.runs.findOne(parentId))?.status).toBe('waiting');

        await engine.cancel(parentId);
        await engine.idle();

        expect((await store.runs.findOne(parentId))?.status).toBe('cancelled');
        expect((await store.runs.findOne(a!.id))?.status).toBe('cancelled');
        expect((await store.runs.findOne(g!.id))?.status).toBe('cancelled');
    });

    it('fire-and-forget children are cancelled too', async () => {
        const { engine, store } = build([
            turn(call('start', { payloads: ['a', 'b'] }, 'c1')),
            hanging,
        ], (_payload, options) => hanging(options));
        const started = runningChildren(engine, 2);
        const parentId = await root(engine);

        await started;
        await engine.cancel(parentId);
        await engine.idle();

        expect((await store.runs.findOne(parentId))?.status).toBe('cancelled');
        expect((await children(store, parentId)).map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    });

    it('a completed parent leaves its children running', async () => {
        const { engine, store } = build([
            turn(call('start', { payloads: ['a'] }, 'c1')),
            text('done'),
        ], (_payload, options) => hanging(options));
        const started = runningChildren(engine, 1);
        const completed = nextRun(engine, (run) => run.parentRunId === undefined && run.status === 'completed');
        const parentId = await root(engine);

        await Promise.all([started, completed]);

        const [a] = await children(store, parentId);

        expect(a?.status).toBe('running');
        expect(a?.cancelRequested).toBeUndefined();
    });

    it('a child settling after its parent was cancelled does nothing', async () => {
        const hold = gate();
        const { engine, store } = build([turn(call('fan', { payloads: ['a'] }, 'c1'))], async () => {
            await hold.wait();

            return text('out-a');
        });
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await root(engine);

        await paused;

        // cancelled behind the engine's back: no cascade reaches the child
        const cancelled = await store.runs.update(parentId, {
            status: 'cancelled',
            waiting: undefined,
            finishedAt: START,
        }, { expectStatus: ['waiting'] });
        const [a] = await children(store, parentId);

        hold.open();
        await engine.idle();
        await engine.tick();

        expect((await store.runs.findOne(a!.id))?.status).toBe('completed');

        const after = await store.runs.findOne(parentId);

        expect(after?.status).toBe('cancelled');
        expect(after?.updatedAt).toEqual(cancelled.updatedAt);
        expect((await store.steps.find(parentId)).filter((s) => s.kind === 'wait')).toHaveLength(0);
    });

    it('registry replacement cascades', async () => {
        const {
            engine, 
            store, 
            clock, 
        } = build([turn(call('fanTo', { payloads: ['w'] }, 'c1'))], (_payload, options) => hanging(options));
        const started = runningChildren(engine, 1);
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await root(engine);

        await Promise.all([started, paused]);

        const [w] = await children(store, parentId);

        expect(w?.agent).toBe('worker');
        expect((await store.runs.findOne(parentId))?.status).toBe('waiting');

        // the replacement cancels the runs created before it
        clock.advance(1_000);
        await expect(engine.putAgent(leadAgent([], (_payload, options) => hanging(options)))).resolves.toBe('replaced');
        await engine.idle();

        const parent = await store.runs.findOne(parentId);

        expect(parent?.status).toBe('cancelled');
        expect(parent?.error?.code).toBe('agent_replaced');
        expect((await store.runs.findOne(w!.id))?.status).toBe('cancelled');
    });
});
