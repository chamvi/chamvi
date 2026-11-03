/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    Engine,
    ValidationError,
    approve,
    defineAgent,
} from '@chamvi/core';
import type {
    CodeAgentDefinition,
    IChannel,
    IStore,
    Run,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

function setup(def: Omit<CodeAgentDefinition, 'name'>, channels: IChannel[] = []) {
    const clock = new ControllableClock(START);
    const store: IStore = createMemoryStore({ clock });
    const engine = new Engine({
        store,
        clock,
        agents: [defineAgent({ name: 'code', ...def } as CodeAgentDefinition)],
        channels,
        onError: () => {},
    });

    return {
        clock, 
        store, 
        engine, 
    };
}

async function runOnce(engine: Engine, payload: unknown = { n: 1 }): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'code',
        trigger: 'test',
        channel: 'test',
        payload,
    });

    await engine.idle();

    return runId;
}

/** A promise that never settles on its own and rejects when `signal` aborts. */
function hang(signal: AbortSignal): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
}

function waitFor(engine: Engine, match: (run: Run) => boolean): Promise<Run> {
    const { promise, resolve } = Promise.withResolvers<Run>();
    const off = engine.on('run.updated', ({ run }) => {
        if (!match(run)) {
            return;
        }

        off();
        resolve(run);
    });

    return promise;
}

describe('code run execution', () => {
    it('completes with the returned value, one tool step and no checkpoint', async () => {
        const { store, engine } = setup({ run: (payload) => ({ ok: 1, payload }) });
        const runId = await runOnce(engine, { n: 2 });
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ ok: 1, payload: { n: 2 } });

        const steps = await store.steps.find(runId);

        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
            kind: 'tool',
            name: 'code',
            input: { n: 2 },
            output: { ok: 1, payload: { n: 2 } },
        });
        expect(await store.checkpoints.findOne(runId)).toBeUndefined();

        await engine.stop();
    });

    it('fails with the thrown error and records it on the step', async () => {
        const { store, engine } = setup({
            run: () => {
                throw new ValidationError('x');
            },
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({ code: 'validation_error', message: 'x' });

        const steps = await store.steps.find(runId);

        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
            kind: 'tool', 
            name: 'code', 
            error: { code: 'validation_error', message: 'x' }, 
        });

        await engine.stop();
    });

    it('pauses on approve() with approval id 0:run:0 and completes once approved', async () => {
        let calls = 0;
        const { store, engine } = setup({
            run: async (_payload, ctx) => {
                calls++;

                const decision = await approve(ctx, { title: 'Go?' });

                return { approved: decision.approved };
            },
        });
        const runId = await runOnce(engine);
        const waiting = await store.runs.findOne(runId);

        expect(waiting?.status).toBe('waiting');
        expect(waiting?.waiting).toMatchObject({
            kind: 'approval', 
            approvalId: '0:run:0', 
            toolName: 'code', 
        });
        expect(await store.steps.find(runId)).toHaveLength(0);

        await engine.approve(runId, { approvalId: '0:run:0', approved: true });
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ approved: true });
        expect(calls).toBe(2);
        expect((await store.steps.find(runId)).map((s) => s.kind)).toEqual(['wait', 'tool']);

        await engine.stop();
    });

    it('hands a denial to run()', async () => {
        const { store, engine } = setup({
            run: async (_payload, ctx) => {
                const decision = await approve(ctx, { title: 'Go?' });

                return { approved: decision.approved };
            },
        });
        const runId = await runOnce(engine);

        await engine.approve(runId, { approvalId: '0:run:0', approved: false });
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ approved: false });

        await engine.stop();
    });

    it('still pauses when run() catches the suspension and returns', async () => {
        const { store, engine } = setup({
            run: async (_payload, ctx) => {
                try {
                    await approve(ctx, { title: 'Go?' });
                } catch {
                    return 'ignored';
                }

                return 'approved';
            },
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('waiting');
        expect(run?.output).toBeUndefined();
        expect(await store.steps.find(runId)).toHaveLength(0);

        await engine.stop();
    });

    it('fails with Timeout after budget.timeoutMs', async () => {
        const entered = Promise.withResolvers<void>();
        const {
            clock, 
            store, 
            engine, 
        } = setup({
            budget: { timeoutMs: 1_000 },
            run: (_payload, ctx) => {
                entered.resolve();

                return hang(ctx.run.signal);
            },
        });

        await engine.start();

        const running = entered.promise;
        const { runId } = await engine.dispatch({
            agent: 'code',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await running;
        clock.advance(1_001);
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error?.code).toBe('Timeout');

        await engine.stop();
    });

    it('is cancelled by engine.cancel() while running', async () => {
        const { store, engine } = setup({ run: (_payload, ctx) => hang(ctx.run.signal) });

        await engine.start();

        const running = waitFor(engine, (run) => run.status === 'running');
        const { runId } = await engine.dispatch({
            agent: 'code',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await running;
        await engine.cancel(runId);
        await engine.idle();

        expect((await store.runs.findOne(runId))?.status).toBe('cancelled');

        await engine.stop();
    });

    it('emits through ctx.channels once across a replay', async () => {
        const sent: string[] = [];
        const out: IChannel = {
            name: 'console',
            defaultAddress: 'console',
            async out(message) {
                sent.push(message.body);
            },
        };
        const { store, engine } = setup({
            run: async (_payload, ctx) => {
                await ctx.channels.findOneOrFail('console').emit({ body: 'hi' });

                const decision = await approve(ctx, { title: 'Go?' });

                return decision.approved;
            },
        }, [out]);
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.status).toBe('waiting');

        await engine.approve(runId, { approvalId: '0:run:0', approved: true });
        await engine.idle();

        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(sent.filter((body) => body === 'hi')).toHaveLength(1);

        await engine.stop();
    });
    it.each([
        ['a function', () => 1],
        ['a symbol', Symbol('x')],
        ['an object holding a function', { a: 1, f() {} }],
        ['a BigInt', { n: 1n }],
    ])('fails with a ValidationError and one step when the output is %s', async (_label, value) => {
        const errors: unknown[] = [];
        const clock = new ControllableClock(START);
        const store: IStore = createMemoryStore({ clock });
        const engine = new Engine({
            store,
            clock,
            agents: [defineAgent({ name: 'code', run: () => value } as CodeAgentDefinition)],
            onError: (error) => {
                errors.push(error);
            },
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({ code: 'validation_error', message: 'The output of code agent "code" is not JSON-serialisable.' });
        expect(await store.steps.find(runId)).toEqual([expect.objectContaining({ kind: 'tool', error: expect.objectContaining({ code: 'validation_error' }) })]);
        expect(errors).toEqual([]);

        await engine.stop();
    });

    it('stores the output as plain JSON', async () => {
        const at = new Date(START);
        const { store, engine } = setup({
            run: () => ({
                at, 
                m: new Map([['a', 1]]), 
                list: [undefined], 
            }), 
        });
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.output).toEqual({
            at: at.toISOString(), 
            m: {}, 
            list: [null], 
        });

        await engine.stop();
    });
});
