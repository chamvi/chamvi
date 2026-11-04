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
import {
    APPROVAL_TIMEOUT_MAX_MS,
    Engine,
    InvalidRunStateError,
    agent,
    agentChannel,
    defineModelAgent,
    defineTool,
    dispatch,
    waitForDispatch,
} from '@chamvi/core';
import type {
    DispatchWaitPoint,
    IEngine,
    IStore,
    Run,
    ToolContext,
} from '@chamvi/core';
import { answerDispatchWait } from '../../../src/engine/dispatch/module.ts';
import { MemoryRunRepository, createMemoryStore } from '../../../src/repository/index.ts';
import type { RunUpdateOptions } from '../../../src/repository/types.ts';
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
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const done = () => Array.from({ length: 10 }, () => text('done'));
const answer: ChildTurn = (payload) => text(`out-${String(payload)}`);

const fan = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()), timeoutMs: z.number().optional() }),
    execute: async ({ payloads, timeoutMs }, { context }) => {
        const started = await Promise.all(payloads.map((payload) => dispatch(context, { payload })));

        return waitForDispatch(context, started, timeoutMs === undefined ? undefined : { timeoutMs });
    },
});

const pair = defineTool({
    inputSchema: z.object({}),
    execute: async (_input, { context }) => {
        const a = await dispatch(context, { payload: 'a' });
        const b = await dispatch(context, { payload: 'b' });

        return {
            single: await waitForDispatch(context, a),
            list: await waitForDispatch(context, [b, a.runId, b]),
        };
    },
});

const start = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => Promise.all(payloads.map((payload) => dispatch(context, { payload }))),
});

const wait = defineTool({
    inputSchema: z.object({ runIds: z.array(z.string()), timeoutMs: z.number().optional() }),
    execute: async ({ runIds, timeoutMs }, { context }) => waitForDispatch(context, runIds, timeoutMs === undefined ? undefined : { timeoutMs }),
});

const streamed = defineTool({
    inputSchema: z.object({ runIds: z.array(z.string()) }),
    async* execute({ runIds }, { context }) {
        yield 'started';
        yield await waitForDispatch(context as ToolContext, runIds);
    },
});

const fetchPage = defineTool({
    inputSchema: z.object({}),
    trust: { taint: true },
    execute: async () => 'page',
});

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

class TestEngine extends Engine {
    answerWait(runId: string): Promise<boolean> {
        return answerDispatchWait(this.dispatchContext(), runId);
    }
}

function setup(parent: ParentTurn[], child: ChildTurn = answer, options: { store?: IStore; clock?: ControllableClock } = {}) {
    const clock = options.clock ?? new ControllableClock(START);
    const store = options.store ?? createMemoryStore({ clock });
    const lead = defineModelAgent({
        name: 'lead',
        instructions: 'You lead.',
        model: treeModel([...parent, ...done()], child),
        channels: [agent.on()],
        tools: {
            fan,
            pair,
            start,
            wait,
            streamed,
            fetchPage,
        },
    });
    const other = defineModelAgent({
        name: 'other',
        instructions: 'You do other things.',
        model: treeModel(done(), answer),
    });
    const engine = new TestEngine({
        store,
        clock,
        agents: [lead, other],
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

async function startParent(engine: IEngine, agentName = 'lead'): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: agentName,
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

async function stepsOf(store: IStore, runId: string, kind: 'tool' | 'wait') {
    return (await store.steps.find(runId)).filter((step) => step.kind === kind);
}

function dispatchWait(run: Run | undefined): DispatchWaitPoint | undefined {
    return run?.waiting?.kind === 'dispatch' ? run.waiting : undefined;
}

/** Records whether the run was ever stored `waiting`. */
function watchWaiting(engine: IEngine): { ids: Set<string> } {
    const ids = new Set<string>();

    engine.on('run.updated', ({ run }) => {
        if (run.status === 'waiting') {
            ids.add(run.id);
        }
    });

    return { ids };
}

describe('waitForDispatch()', () => {
    it('outside a tool frame throws InvalidRunStateError', async () => {
        await expect(waitForDispatch({} as ToolContext, 'run-1')).rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('in a streaming tool body throws', async () => {
        const { engine, store } = setup([turn(call('streamed', { runIds: ['x'] }, 'c1')), text('done')]);
        const parentId = await startParent(engine);

        await engine.idle();

        const [step] = await stepsOf(store, parentId, 'tool');

        expect(step?.error).toMatchObject({ code: 'invalid_run_state' });
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('single in gives single out, list in gives list in order with duplicates', async () => {
        const { engine, store } = setup([turn(call('pair', {}, 'c1')), text('done')]);
        const parentId = await startParent(engine);

        await engine.idle();

        const kids = await children(store, parentId);
        const a = kids.find((r) => r.trigger.payload === 'a')!;
        const b = kids.find((r) => r.trigger.payload === 'b')!;
        const outcome = (run: Run, output: string) => ({
            runId: run.id,
            agent: 'lead',
            role: 'default',
            status: 'completed',
            output,
        });
        const [step] = await stepsOf(store, parentId, 'tool');

        expect(step?.output).toEqual({
            single: outcome(a, 'out-a'),
            list: [outcome(b, 'out-b'), outcome(a, 'out-a'), outcome(b, 'out-b')],
        });
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('empty list resolves []', async () => {
        const { engine, store } = setup([turn(call('wait', { runIds: [] }, 'c1')), text('done')]);
        const waiting = watchWaiting(engine);
        const parentId = await startParent(engine);

        await engine.idle();

        const [step] = await stepsOf(store, parentId, 'tool');

        expect(step?.output).toEqual([]);
        expect(waiting.ids.has(parentId)).toBe(false);
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(0);
    });

    it('already settled children resolve without suspending', async () => {
        let parentId = '';
        let ids: string[] = [];
        const holder: { engine?: IEngine; store?: IStore } = {};
        const { engine, store } = setup([
            turn(call('start', { payloads: ['a', 'b'] }, 'c1')),
            async () => {
                // the next parent turn only once both children settled
                const settled = async () => (await children(holder.store!, parentId)).filter((r) => r.status === 'completed');

                for (;;) {
                    const next = nextRun(holder.engine!, (run) => run.parentRunId === parentId && run.status === 'completed');

                    if ((await settled()).length >= 2) {
                        break;
                    }

                    await next;
                }

                ids = (await children(holder.store!, parentId)).map((r) => r.id);

                return turn(call('wait', { runIds: ids }, 'c2'));
            },
            text('done'),
        ]);

        holder.engine = engine;
        holder.store = store;

        const waiting = watchWaiting(engine);

        parentId = await startParent(engine);
        await engine.idle();

        const steps = await stepsOf(store, parentId, 'tool');

        expect((steps[1]?.output as { status: string }[]).map((o) => o.status)).toEqual(['completed', 'completed']);
        expect(waiting.ids.has(parentId)).toBe(false);
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(0);
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('refuses a run this run did not dispatch', async () => {
        const holder: { id?: string } = {};
        const { engine, store } = setup([
            () => turn(call('wait', { runIds: [holder.id!] }, 'c1')),
            text('done'),
        ]);
        const waiting = watchWaiting(engine);

        await engine.start();
        holder.id = (await engine.dispatch({
            agent: 'other',
            trigger: 'test',
            channel: 'test',
            payload: {},
        })).runId;
        await engine.idle();

        const parentId = await startParent(engine);

        await engine.idle();

        const [step] = await stepsOf(store, parentId, 'tool');

        expect(step?.error).toEqual({
            code: 'validation_error',
            message: `Run ${holder.id} was not dispatched by run ${parentId}.`,
        });
        expect(waiting.ids.has(parentId)).toBe(false);
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('wait id is <stepIndex>:<toolCallId>:w0 and the default expiresAt is now + 24 h', async () => {
        const hold = gate();
        const { engine, store } = setup([turn(call('fan', { payloads: ['a', 'b'] }, 'c1')), text('done')], async (payload) => {
            await hold.wait();

            return answer(payload, undefined as never);
        });
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await startParent(engine);
        const run = await paused;
        const kids = await children(store, parentId);

        expect(run.id).toBe(parentId);
        expect(dispatchWait(run)).toEqual({
            kind: 'dispatch',
            id: '0:c1:w0',
            toolName: 'fan',
            toolCallId: 'c1',
            runIds: expect.arrayContaining(kids.map((k) => k.id)),
            expiresAt: new Date(START.getTime() + 86_400_000),
        });
        expect(dispatchWait(run)?.runIds).toHaveLength(2);

        hold.open();
        await engine.idle();

        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);
    });

    it('a given timeoutMs sets expiresAt', async () => {
        const hold = gate();
        const { engine } = setup([turn(call('fan', { payloads: ['a'], timeoutMs: 60_000 }, 'c1')), text('done')], async (payload) => {
            await hold.wait();

            return answer(payload, undefined as never);
        });
        const paused = nextRun(engine, (run) => run.status === 'waiting');

        await startParent(engine);

        expect(dispatchWait(await paused)?.expiresAt).toEqual(new Date(START.getTime() + 60_000));
        hold.open();
        await engine.idle();
    });

    it('timeoutMs 0 and above APPROVAL_TIMEOUT_MAX_MS refused', async () => {
        const { engine, store } = setup([
            turn(
                call('fan', { payloads: ['a'], timeoutMs: 0 }, 'c1'),
                call('fan', { payloads: ['b'], timeoutMs: APPROVAL_TIMEOUT_MAX_MS + 1 }, 'c2'),
                call('fan', { payloads: ['c'], timeoutMs: 1.5 }, 'c3'),
            ),
            text('done'),
        ]);
        const waiting = watchWaiting(engine);
        const parentId = await startParent(engine);

        await engine.idle();

        const steps = await stepsOf(store, parentId, 'tool');

        expect(steps).toHaveLength(3);

        for (const step of steps) {
            expect(step.error).toEqual({
                code: 'validation_error',
                message: `A dispatch wait timeoutMs must be an integer from 1 to ${APPROVAL_TIMEOUT_MAX_MS}.`,
            });
        }

        expect(waiting.ids.has(parentId)).toBe(false);
    });

    it('a tainted child taints the parent before the outcome reaches the model', async () => {
        const seen: { taint?: Run['taint']; outcome?: boolean } = {};
        const holder: { store?: IStore; parentId?: string } = {};
        const { engine, store } = setup([
            turn(call('fan', { payloads: ['a'] }, 'c1')),
            async (options) => {
                seen.taint = (await holder.store!.runs.findOne(holder.parentId!))?.taint;
                seen.outcome = promptHas(options, 'out-a');

                return text('done');
            },
        ], (payload, options) => (promptHas(options, 'page') ?
            answer(payload, options) :
            turn(call('fetchPage', {}, 'f1'))));

        holder.store = store;
        holder.parentId = await startParent(engine);
        await engine.idle();

        const [child] = await children(store, holder.parentId);

        expect(child?.taint?.source).toBe('tool:fetchPage');
        expect(seen.outcome).toBe(true);
        expect(seen.taint?.source).toBe(`dispatch:${child!.id}`);
        expect((await store.runs.findOne(holder.parentId))?.status).toBe('completed');
    });

    it('two waits in one step resume one after another', async () => {
        const holds = { a: gate(), b: gate() };
        const { engine, store } = setup([
            turn(
                call('fan', { payloads: ['a'] }, 'c1'),
                call('fan', { payloads: ['b'] }, 'c2'),
            ),
            text('done'),
        ], async (payload, options) => {
            await holds[payload as 'a' | 'b'].wait();

            return answer(payload, options);
        });
        const first = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await startParent(engine);

        expect(dispatchWait(await first)).toMatchObject({ id: '0:c1:w0', toolCallId: 'c1' });

        const second = nextRun(engine, (run) => run.id === parentId && dispatchWait(run)?.id === '0:c2:w0');

        holds.a.open();
        expect(dispatchWait(await second)).toMatchObject({ toolCallId: 'c2' });

        holds.b.open();
        await engine.idle();

        const waits = await stepsOf(store, parentId, 'wait');

        expect(waits.map((s) => (s.input as { toolCallId: string }).toolCallId)).toEqual(['c1', 'c2']);
        expect(waits.map((s) => s.name)).toEqual(['fan', 'fan']);

        const tools = await stepsOf(store, parentId, 'tool');

        expect(tools.map((s) => (s.output as { output: string }[])[0]?.output)).toEqual(['out-a', 'out-b']);
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('a child settled before the pause landed resumes the parent', async () => {
        const clock = new ControllableClock(START);
        const settled = Promise.withResolvers<void>();
        let delayed = 0;

        const runs = new MemoryRunRepository({ clock });
        const update = runs.update.bind(runs);

        runs.update = async (id: string, patch: Partial<Run>, opts?: RunUpdateOptions): Promise<Run> => {
            if (patch.status === 'completed') {
                const updated = await update(id, patch, opts);

                if (updated.parentRunId !== undefined) {
                    settled.resolve();
                }

                return updated;
            }

            if (patch.status === 'waiting' && patch.waiting?.kind === 'dispatch') {
                delayed++;
                await settled.promise;
                // the child's whole settle (its push included) ends before the waiting write
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }

            return update(id, patch, opts);
        };

        const store = createMemoryStoreWithRuns(runs, { clock });
        const { engine } = setup([turn(call('fan', { payloads: ['a'] }, 'c1')), text('done')], answer, { store, clock });
        const parentId = await startParent(engine);

        await engine.idle();

        expect(delayed).toBe(1);
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('approve() refuses a dispatch wait', async () => {
        const hold = gate();
        const { engine } = setup([turn(call('fan', { payloads: ['a'] }, 'c1')), text('done')], async (payload) => {
            await hold.wait();

            return answer(payload, undefined as never);
        });
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await startParent(engine);

        await paused;

        const error = await engine.approve(parentId, { approvalId: '0:c1:w0', approved: true }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidRunStateError);
        expect((error as Error).message).toBe(`Run "${parentId}" waits on dispatched runs, not on an approval.`);

        hold.open();
        await engine.idle();
    });

    it('push and a second resume answer once', async () => {
        const { engine, store } = setup([turn(call('fan', { payloads: ['a'] }, 'c1')), text('done')], () => new Promise<MockResponse>(() => {}));
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await startParent(engine);

        await paused;

        // the child settles behind the engine's back: no push
        const [child] = await children(store, parentId);

        await store.runs.update(child!.id, {
            status: 'completed',
            output: 'out-a',
            claim: undefined,
            finishedAt: START,
        });

        const completed = nextRun(engine, (run) => run.id === parentId && run.status === 'completed');
        const answers = await Promise.all([engine.answerWait(parentId), engine.answerWait(parentId)]);

        await completed;

        expect(answers.toSorted()).toEqual([false, true]);
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);

        const [step] = await stepsOf(store, parentId, 'tool');

        expect(step?.output).toEqual([{
            runId: child!.id,
            agent: 'lead',
            role: 'default',
            status: 'completed',
            output: 'out-a',
        }]);
    });
});
