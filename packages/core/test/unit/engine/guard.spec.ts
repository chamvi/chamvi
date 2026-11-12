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
import { Engine, defineModelAgent, defineSimpleAgent } from '@chamvi/core';
import type { EngineOptions, IEngine, Run } from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';

const answer = () => mockModel([{ parts: [{ type: 'text', text: 'done' }] }]);

/** Runs a hook after the claim, right before the execution looks the agent up. */
class HookedEngine extends Engine {
    beforeExecute: ((engine: HookedEngine, run: Run) => Promise<void> | void) | undefined;

    forget(name: string): void {
        this.agents.delete(name);
        this.revisions.delete(name);
    }

    adopt(name: string, revision: string | undefined): void {
        this.revisions.set(name, revision);
    }

    protected override async execute(run: Run, signal: AbortSignal): Promise<void> {
        await this.beforeExecute?.(this, run);

        return super.execute(run, signal);
    }
}

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function make(opts: Partial<EngineOptions> & { store: ReturnType<typeof createMemoryStore>; clock: ControllableClock }) {
    const errors: unknown[] = [];
    const engine = new HookedEngine({
        agents: [],
        onError: (error) => {
            errors.push(error);
        },
        ...opts,
    });

    engines.push(engine);

    return { engine, errors };
}

function setup() {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = createMemoryStore({ clock });

    return { clock, store };
}

function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const createdAt = new Date(1_000);

    return {
        id,
        agent: 'ghost',
        status: 'queued',
        trigger: {
            id: `t-${id}`,
            agent: 'ghost',
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: createdAt,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

const env = (agent = 'triage') => ({
    agent,
    trigger: 'http',
    channel: 'http' as const,
    payload: {},
});

const statusOf = async (store: ReturnType<typeof createMemoryStore>, id: string) => (await store.runs.findOne(id))?.status;

/** One poll of the queue (claimTtlMs 60 s: every 20 s), then everything it started. */
async function poll(engine: IEngine, clock: ControllableClock): Promise<void> {
    clock.advance(20_000);
    await engine.idle();
}

describe('execution guard', () => {
    it('a queued run of an unknown agent stays queued', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });
        const { engine, errors } = make({
            store,
            clock,
            agents: [triage],
        });

        await store.runs.insert(makeRun('r1'));

        await engine.start();
        await engine.idle();
        await poll(engine, clock);

        expect(await statusOf(store, 'r1')).toBe('queued');
        expect((await store.runs.findOne('r1'))?.claim).toBeUndefined();
        expect(errors).toEqual([]);
        expect(model.doStreamCalls).toHaveLength(0);
    });

    it('a lagging replica does not execute a run after the marker moved', async () => {
        const { clock, store } = setup();
        const modelA = answer();
        const modelB = answer();
        const triageA = defineModelAgent({
            name: 'triage',
            model: modelA,
            instructions: 'x',
        });
        const triageB = defineModelAgent({
            name: 'triage',
            model: modelB,
            instructions: 'x',
        });
        const { engine: b, errors: errorsB } = make({
            store,
            clock,
            agents: [],
            owner: 'B',
        });
        const { engine: a, errors: errorsA } = make({
            store,
            clock,
            agents: [],
            owner: 'A',
        });

        await b.putAgent(triageB, { revision: 'h1' });
        await a.putAgent(triageA, { revision: 'h2' });
        expect((await store.agentRevisions.findOne('triage'))?.hash).toBe('h2');

        await b.start();

        const { runId } = await b.dispatch(env());

        await b.idle();
        await poll(b, clock);
        expect(await statusOf(store, runId)).toBe('queued');
        expect(modelB.doStreamCalls).toHaveLength(0);

        await a.start();
        await a.idle();
        expect(await statusOf(store, runId)).toBe('completed');
        expect(modelA.doStreamCalls).toHaveLength(1);
        expect(modelB.doStreamCalls).toHaveLength(0);
        expect(errorsA).toEqual([]);
        expect(errorsB).toEqual([]);
    });

    it('an agent without a revision is never held back by markers', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });

        await store.agentRevisions.save({
            agent: 'triage',
            hash: 'h9',
            changedAt: clock.now(),
        });

        const { engine, errors } = make({
            store,
            clock,
            agents: [triage],
        });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await engine.idle();

        expect(await statusOf(store, runId)).toBe('completed');
        expect(model.doStreamCalls).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    it('a run of an unknown agent with cancelRequested settles cancelled', async () => {
        const { clock, store } = setup();
        const { engine, errors } = make({
            store,
            clock,
            agents: [],
        });

        await store.runs.insert(makeRun('r1', { cancelRequested: true }));

        await engine.start();
        await engine.idle();

        expect(await statusOf(store, 'r1')).toBe('cancelled');
        expect(errors).toEqual([]);
    });

    it('a run whose agent is removed between claim and execute goes back to queued', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });
        const { engine, errors } = make({
            store,
            clock,
            agents: [triage],
        });

        engine.beforeExecute = (e) => e.forget('triage');

        const updates: Run['status'][] = [];

        engine.on('run.updated', (e) => {
            updates.push(e.run.status);
        });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('queued');
        expect(run?.claim).toBeUndefined();
        expect(run?.startedAt).toBeUndefined();
        expect(updates).toEqual(['queued', 'running', 'queued']);
        expect(errors).toEqual([]);
        expect(model.doStreamCalls).toHaveLength(0);
    });

    it('a run whose marker moves between claim and execute goes back to queued', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });
        const { engine, errors } = make({
            store,
            clock,
            agents: [],
        });

        await engine.putAgent(triage, { revision: 'h1' });
        engine.beforeExecute = async () => {
            await store.agentRevisions.save({
                agent: 'triage',
                hash: 'h2',
                changedAt: clock.now(),
            });
        };

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await engine.idle();
        await poll(engine, clock);

        expect(await statusOf(store, runId)).toBe('queued');
        expect(errors).toEqual([]);
        expect(model.doStreamCalls).toHaveLength(0);
    });

    it('a checked run of a lagging replica is cancelled by the replica at the marker\'s revision', async () => {
        const { clock, store } = setup();
        const modelA = answer();
        const modelB = answer();
        const triageA = defineModelAgent({
            name: 'triage',
            model: modelA,
            instructions: 'x',
        });
        const triageB = defineModelAgent({
            name: 'triage',
            model: modelB,
            instructions: 'x',
        });
        const { engine: b, errors: errorsB } = make({
            store,
            clock,
            agents: [],
            owner: 'B',
        });
        const { engine: a, errors: errorsA } = make({
            store,
            clock,
            agents: [],
            owner: 'A',
        });

        await b.putAgent(triageB, { revision: 'h1' });
        await a.putAgent(triageA, { revision: 'h2' });
        await b.start();

        const { runId } = await b.dispatch({ ...env(), checked: triageB });

        expect((await store.runs.findOne(runId))?.agentRevision).toBe('h1');

        await b.idle();
        await poll(b, clock);
        expect(await statusOf(store, runId)).toBe('queued');

        // a stale cancel emits run.updated (cancelled) only: no agents.cancelled, no running
        const updates: Run['status'][] = [];
        const sweeps: string[] = [];

        a.on('run.updated', (e) => {
            updates.push(e.run.status);
        });
        a.on('agents.cancelled', (e) => {
            sweeps.push(e.name);
        });

        await a.start();
        await a.idle();
        await poll(a, clock);

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('cancelled');
        expect(run?.error?.code).toBe('agent_replaced');
        expect(updates).toEqual(['cancelled']);
        expect(sweeps).toEqual([]);
        expect(modelA.doStreamCalls).toHaveLength(0);
        expect(modelB.doStreamCalls).toHaveLength(0);
        expect(errorsA).toEqual([]);
        expect(errorsB).toEqual([]);
    });

    it('a checked run stamped with the former revision starts', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });

        await store.agentRevisions.save({
            agent: 'triage',
            hash: 'h1',
            changedAt: clock.now(),
        });
        await store.runs.insert(makeRun('r1', {
            agent: 'triage',
            agentRevision: 'h1',
            trigger: { ...makeRun('r1').trigger, agent: 'triage' },
        }));

        const { engine, errors } = make({
            store,
            clock,
            agents: [],
        });

        await engine.putAgent(triage, { revision: 'h2', formerRevision: 'h1' });
        expect((await store.agentRevisions.findOne('triage'))?.hash).toBe('h2');

        await engine.start();
        await engine.idle();

        expect(await statusOf(store, 'r1')).toBe('completed');
        expect(model.doStreamCalls).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    it('a checked run stamped at the current revision starts', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });
        const { engine, errors } = make({
            store,
            clock,
            agents: [],
        });

        await engine.putAgent(triage, { revision: 'h1' });
        await engine.start();

        const { runId } = await engine.dispatch({ ...env(), checked: triage });

        await engine.idle();

        expect(await statusOf(store, runId)).toBe('completed');
        expect(errors).toEqual([]);
    });

    it('a checked run found stale after the claim settles cancelled', async () => {
        const { clock, store } = setup();
        const model = answer();
        const triage = defineModelAgent({
            name: 'triage',
            model,
            instructions: 'x',
        });
        const { engine, errors } = make({
            store,
            clock,
            agents: [],
        });

        await engine.putAgent(triage, { revision: 'h1' });
        engine.beforeExecute = async (e) => {
            await store.agentRevisions.save({
                agent: 'triage',
                hash: 'h2',
                changedAt: clock.now(),
            });
            e.adopt('triage', 'h2');
        };

        const updates: Run['status'][] = [];

        engine.on('run.updated', (e) => {
            updates.push(e.run.status);
        });

        await engine.start();

        const { runId } = await engine.dispatch({ ...env(), checked: triage });

        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('cancelled');
        expect(run?.error?.code).toBe('agent_replaced');
        expect(updates).toEqual(['queued', 'running', 'cancelled']);
        expect(model.doStreamCalls).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    it('drain waits for the cancel of a stale checked run', async () => {
        const { clock, store } = setup();
        const triage = defineModelAgent({
            name: 'triage',
            model: answer(),
            instructions: 'x',
        });
        const { engine: b } = make({
            store,
            clock,
            agents: [],
            owner: 'B',
        });
        const { engine: a, errors } = make({
            store,
            clock,
            agents: [],
            owner: 'A',
        });

        await b.putAgent(triage, { revision: 'h1' });
        await a.putAgent(defineModelAgent({
            name: 'triage',
            model: answer(),
            instructions: 'x',
        }), { revision: 'h2' });

        const { runId } = await b.dispatch({ ...env(), checked: triage });

        // the stale cancel's write is held until drain() has started
        const update = store.runs.update.bind(store.runs);
        const held = Promise.withResolvers<void>();
        const entered = Promise.withResolvers<void>();

        store.runs.update = async (...args) => {
            if (args[0] === runId && args[1].status === 'cancelled') {
                entered.resolve();
                await held.promise;
            }

            return update(...args);
        };

        await a.start();
        await entered.promise;

        let drained = false;
        const draining = a.drain({ timeoutMs: 10_000 }).then(() => {
            drained = true;
        });

        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(drained).toBe(false);

        held.resolve();
        await draining;

        expect(await statusOf(store, runId)).toBe('cancelled');
        expect(errors).toEqual([]);
    });
});

describe('checked runs of a replaced agent', () => {
    const recorder = (ran: string[], label: string) => defineSimpleAgent({
        name: 'triage',
        run: () => {
            ran.push(label);

            return label;
        },
    });

    it('a checked run created in the millisecond of a code agent\'s replacement is cancelled, not run on the replacement', async () => {
        const { clock, store } = setup();
        const ran: string[] = [];
        const a = recorder(ran, 'A');
        const { engine, errors } = make({
            store, 
            clock, 
            agents: [a], 
        });

        const { runId: checked } = await engine.dispatch({ ...env(), checked: a });
        const { runId: unchecked } = await engine.dispatch(env());

        // same clock reading: the sweep's strict createdAt < cutoff misses both runs
        await engine.putAgent(recorder(ran, 'B'));
        await engine.start();
        await engine.idle();

        const run = await store.runs.findOne(checked);

        expect(run?.status).toBe('cancelled');
        expect(run?.error?.code).toBe('agent_replaced');
        // an unchecked run of that millisecond runs on the replacement
        expect((await store.runs.findOne(unchecked))?.output).toBe('B');
        expect(ran).toEqual(['B']);
        expect(errors).toEqual([]);
    });

    it('a checked run whose post-insert cancel failed is cancelled at admission', async () => {
        const { clock, store } = setup();
        const ran: string[] = [];
        const a = recorder(ran, 'A');
        const { engine, errors } = make({
            store, 
            clock, 
            agents: [a], 
        });
        const insert = store.runs.insert.bind(store.runs);
        const update = store.runs.update.bind(store.runs);
        let failCancel = true;

        // the replacement lands while the run is inserted
        store.runs.insert = async (...args) => {
            await engine.putAgent(recorder(ran, 'B'));

            return insert(...args);
        };
        // the post-insert cancel fails once (a transient store error)
        store.runs.update = async (...args) => {
            if (failCancel && args[1].status === 'cancelled') {
                failCancel = false;

                throw new Error('store down');
            }

            return update(...args);
        };

        const { runId } = await engine.dispatch({ ...env(), checked: a });

        store.runs.insert = insert;
        expect(await statusOf(store, runId)).toBe('queued');
        expect(errors).toHaveLength(1);

        await engine.start();
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('cancelled');
        expect(run?.error?.code).toBe('agent_replaced');
        expect(ran).toEqual([]);
    });

    it('a stamped run stays queued on a replica that holds the agent without a revision', async () => {
        const { clock, store } = setup();
        const ran: string[] = [];
        const folder = recorder(ran, 'folder');
        const { engine: a } = make({
            store,
            clock,
            agents: [],
            owner: 'A',
        });
        const { engine: c, errors } = make({
            store,
            clock,
            agents: [recorder(ran, 'code')],
            owner: 'C',
        });

        await a.putAgent(folder, { revision: 'h1' });

        const { runId } = await a.dispatch({ ...env(), checked: folder });

        await c.start();
        await c.idle();
        await poll(c, clock);

        expect(await statusOf(store, runId)).toBe('queued');
        expect(ran).toEqual([]);
        expect(errors).toEqual([]);
    });

    it('a stamped run goes back to queued when its agent loses the revision after the claim', async () => {
        const { clock, store } = setup();
        const ran: string[] = [];
        const folder = recorder(ran, 'folder');
        const { engine, errors } = make({
            store, 
            clock, 
            agents: [], 
        });

        await engine.putAgent(folder, { revision: 'h1' });
        engine.beforeExecute = (e) => e.adopt('triage', undefined);
        await engine.start();

        const { runId } = await engine.dispatch({ ...env(), checked: folder });

        await engine.idle();

        expect(await statusOf(store, runId)).toBe('queued');
        expect(ran).toEqual([]);
        expect(errors).toEqual([]);
    });
});
