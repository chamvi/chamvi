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
    Engine,
    agent,
    agentChannel,
    approve,
    defineModelAgent,
    defineTool,
    dispatch,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import type {
    ChannelMessage,
    DispatchOutcome,
    IChannel,
    IEngine,
    IStore,
    Run,
} from '@chamvi/core';
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
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const done = () => Array.from({ length: 10 }, () => text('done'));
const answer: ChildTurn = (payload) => text(`out-${String(payload)}`);
// settles only by aborting
const hang: ChildTurn = (_payload, options) => new Promise<MockResponse>((_resolve, reject) => {
    options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
});

const fan = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => {
        const started = await Promise.all(payloads.map((payload) => dispatch(context, { payload })));

        return waitForDispatch(context, started);
    },
});

const ask = defineTool({
    inputSchema: z.object({}),
    execute: async (_input, { context }) => {
        const decision = await approve(context, { title: 'Go on?' });

        return decision.approved ? 'ok-approved' : 'ok-denied';
    },
});

const share = defineTool({
    inputSchema: z.object({ wait: z.boolean(), timeoutMs: z.number().optional() }),
    execute: async ({ wait, timeoutMs }, { context }) => {
        const child = await dispatchTo(context, {
            agent: 'worker',
            payload: 'x',
            idempotencyKey: 'shared',
        });

        if (!wait) {
            return child;
        }

        return waitForDispatch(context, child, timeoutMs === undefined ? undefined : { timeoutMs });
    },
});

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

type Options = {
    store?: IStore;
    clock?: ControllableClock;
    channels?: IChannel[];
    worker?: ChildTurn;
    p1?: ParentTurn[];
    p2?: ParentTurn[];
};

function build(parent: ParentTurn[], child: ChildTurn = answer, options: Options = {}) {
    const clock = options.clock ?? new ControllableClock(START);
    const store = options.store ?? createMemoryStore({ clock });
    const errors: unknown[] = [];
    const lead = defineModelAgent({
        name: 'lead',
        instructions: 'You lead.',
        model: treeModel([...parent, ...done()], child),
        channels: [agent.on()],
        tools: { fan, ask },
    });
    const worker = defineModelAgent({
        name: 'worker',
        instructions: 'You work.',
        model: treeModel(done(), options.worker ?? answer),
        channels: [agent.on({ from: ['p1', 'p2'] })],
    });
    const p1 = defineModelAgent({
        name: 'p1',
        instructions: 'You are p1.',
        model: treeModel([...options.p1 ?? [], ...done()], answer),
        tools: { share },
    });
    const p2 = defineModelAgent({
        name: 'p2',
        instructions: 'You are p2.',
        model: treeModel([...options.p2 ?? [], ...done()], answer),
        tools: { share },
    });
    const engine = new Engine({
        store,
        clock,
        agents: [lead, worker, p1, p2],
        channels: [agentChannel(), ...options.channels ?? []],
        onError: (error) => {
            errors.push(error);
        },
    });

    engines.push(engine);

    return {
        engine,
        store,
        clock,
        errors,
    };
}

async function root(engine: IEngine, name = 'lead', channel = 'test'): Promise<string> {
    const { runId } = await engine.dispatch({
        agent: name,
        trigger: 'test',
        channel,
        address: 'a1',
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

/** A run repository whose next `find({ ids })` that reads only settled runs fails (a lost push). */
class LosingRuns extends MemoryRunRepository {
    armed = false;

    override async find(options: RunFindOptions) {
        const result = await super.find(options);
        const settled = result.data.length > 0 &&
            result.data.every((run) => ['completed', 'failed', 'cancelled'].includes(run.status));

        if (this.armed && options.ids && settled) {
            this.armed = false;

            throw new Error('lost push');
        }

        return result;
    }
}

describe('dispatch wait heal', () => {
    it('tick answers a parent whose push was lost', async () => {
        const clock = new ControllableClock(START);
        const runs = new LosingRuns({ clock });
        const store = createMemoryStoreWithRuns(runs, { clock });
        const hold = gate();
        const { engine, errors } = build([turn(call('fan', { payloads: ['a'] }, 'c1'))], async (payload, options) => {
            await hold.wait();

            return answer(payload, options);
        }, { store, clock });

        await engine.start();

        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const parentId = await root(engine);

        await paused;
        runs.armed = true;

        const settled = nextRun(engine, (run) => run.parentRunId === parentId && run.status === 'completed');

        hold.open();
        await settled;
        await engine.idle();

        expect(runs.armed).toBe(false);
        expect(errors.map((e) => (e as Error).message)).toContain('lost push');
        expect((await store.runs.findOne(parentId))?.status).toBe('waiting');
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(0);

        await engine.tick();
        await engine.idle();

        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);
    });

    it('tick leaves a dispatch wait undelivered', async () => {
        const sent: { message: ChannelMessage; address: string }[] = [];
        const inbox: IChannel = {
            name: 'inbox',
            async out(message, address) {
                sent.push({ message, address });
            },
        };
        // the child asks for an approval, the parent waits on the child
        const {
            engine,
            store,
            clock,
        } = build(
            [turn(call('fan', { payloads: ['a'] }, 'c1'))],
            (payload, options) => (promptHas(options, 'ok-approved') ? answer(payload, options) : turn(call('ask', {}, 'k1'))),
            { channels: [inbox] },
        );

        await engine.start();

        const childWaits = nextRun(engine, (run) => run.parentRunId !== undefined && run.status === 'waiting');
        const parentId = await root(engine, 'lead', 'inbox');
        const child = await childWaits;

        await engine.idle();

        const parked = await store.runs.findOne(parentId);

        expect(parked?.waiting?.kind).toBe('dispatch');

        await engine.tick();
        clock.advance(3_600_000);
        await engine.tick();
        await engine.idle();

        const still = await store.runs.findOne(parentId);

        expect(still?.status).toBe('waiting');
        expect(still?.waiting).toEqual(parked?.waiting);
        expect(sent).toEqual([]);
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(0);

        // only the child's approval is answerable
        const waiting = (await store.runs.findOne(child.id))?.waiting;

        expect(waiting?.kind).toBe('approval');

        await engine.approve(child.id, { approvalId: waiting!.id, approved: true });
        await engine.idle();

        expect((await store.runs.findOne(child.id))?.status).toBe('completed');
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);
    });

    it('a deduplicated child of another parent', async () => {
        const hold = gate();
        const { engine, store } = build([], answer, {
            worker: async (payload, options) => {
                await hold.wait();

                return answer(payload, options);
            },
            p1: [turn(call('share', { wait: false }, 's1'))],
            p2: [turn(call('share', { wait: true }, 's2'))],
        });

        await engine.start();

        const p1Done = nextRun(engine, (run) => run.agent === 'p1' && run.status === 'completed');
        const p1 = await root(engine, 'p1');

        await p1Done;

        const p2Waits = nextRun(engine, (run) => run.agent === 'p2' && run.status === 'waiting');
        const p2 = await root(engine, 'p2');

        await p2Waits;

        const [child] = await children(store, p1);

        expect(child).toBeDefined();
        expect(await children(store, p2)).toEqual([]);

        const settled = nextRun(engine, (run) => run.id === child!.id && run.status === 'completed');

        hold.open();
        await settled;
        await engine.idle();

        // the push reached p1 (the owner) only
        expect((await store.runs.findOne(p2))?.status).toBe('waiting');

        await engine.tick();
        await engine.idle();

        expect((await store.runs.findOne(p2))?.status).toBe('completed');

        const [step] = await stepsOf(store, p2, 'tool');

        expect(step?.output).toEqual({
            runId: child!.id,
            agent: 'worker',
            role: 'default',
            status: 'completed',
            output: 'out-x',
        });
        expect(await stepsOf(store, p2, 'wait')).toHaveLength(1);
    });

    it('a deduplicated child of another parent: the wait times out without cancelling it', async () => {
        const {
            engine,
            store,
            clock,
        } = build([], answer, {
            worker: hang,
            p1: [turn(call('share', { wait: false }, 's1'))],
            p2: [turn(call('share', { wait: true, timeoutMs: 60_000 }, 's2'))],
        });

        await engine.start();

        const p1Done = nextRun(engine, (run) => run.agent === 'p1' && run.status === 'completed');
        const p1 = await root(engine, 'p1');

        await p1Done;

        const p2Waits = nextRun(engine, (run) => run.agent === 'p2' && run.status === 'waiting');
        const p2 = await root(engine, 'p2');

        await p2Waits;

        const [child] = await children(store, p1);
        const p2Done = nextRun(engine, (run) => run.id === p2 && run.status === 'completed');

        clock.advance(60_000);
        await engine.tick();
        await p2Done;

        const [step] = await stepsOf(store, p2, 'tool');
        const outcome = step?.output as DispatchOutcome;

        expect(outcome).toMatchObject({
            runId: child!.id,
            agent: 'worker',
            role: 'default',
            status: 'timeout',
        });
        expect(outcome.error?.code).toBe('Timeout');

        const kept = await store.runs.findOne(child!.id);

        expect(['queued', 'running']).toContain(kept?.status);
        expect(kept?.cancelRequested).toBeUndefined();
    });

    it('drain and recover keep the parent parked', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const a = build([turn(call('fan', { payloads: ['a', 'b'] }, 'c1'))], hang, { store, clock });

        await a.engine.start();

        const running = Promise.withResolvers<void>();
        let started = 0;

        a.engine.on('run.updated', ({ run }) => {
            if (run.parentRunId !== undefined && run.status === 'running' && ++started === 2) {
                running.resolve();
            }
        });

        const parentId = await root(a.engine);

        await running.promise;

        const draining = a.engine.drain({ timeoutMs: 1_000 });

        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        clock.advance(1_000);
        await draining;

        expect((await store.runs.findOne(parentId))?.status).toBe('waiting');
        expect((await children(store, parentId)).map((r) => r.status)).toEqual(['interrupted', 'interrupted']);

        const b = build([], answer, { store, clock });

        await b.engine.start();
        await b.engine.idle();

        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);
        expect((await children(store, parentId)).map((r) => r.status)).toEqual(['completed', 'completed']);
    });

    it('the child settles on one engine and the parent on another resumes once', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const child: ChildTurn = (payload, options) => (promptHas(options, 'ok-approved') ?
            answer(payload, options) :
            turn(call('ask', {}, 'k1')));
        const a = build([turn(call('fan', { payloads: ['a'] }, 'c1'))], child, { store, clock });
        const b = build([], child, { store, clock });
        const resumedOn: string[] = [];

        for (const [name, e] of [['a', a.engine], ['b', b.engine]] as const) {
            e.on('step.appended', ({ step }) => {
                if (step.kind === 'wait' && step.runId !== undefined) {
                    resumedOn.push(`${name}:${step.name}`);
                }
            });
        }

        await a.engine.start();
        await b.engine.start();

        const childWaits = nextRun(a.engine, (run) => run.parentRunId !== undefined && run.status === 'waiting');
        const parentId = await root(a.engine);
        const waitingChild = await childWaits;

        await a.engine.idle();

        expect((await store.runs.findOne(parentId))?.waiting?.kind).toBe('dispatch');

        // B answers the child: B executes it, and its settle answers the parent A paused
        const approvalId = (await store.runs.findOne(waitingChild.id))!.waiting!.id;
        const completed = nextRun(b.engine, (run) => run.id === parentId && run.status === 'completed');

        await b.engine.approve(waitingChild.id, { approvalId, approved: true });
        await completed;
        await b.engine.idle();
        await a.engine.tick();
        await b.engine.tick();

        const [step] = await stepsOf(store, parentId, 'tool');

        expect((step?.output as DispatchOutcome[])[0]).toMatchObject({ status: 'completed', output: 'out-a' });
        expect(await stepsOf(store, parentId, 'wait')).toHaveLength(1);
        expect(resumedOn).toEqual(['b:ask', 'b:fan']);
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });
});
