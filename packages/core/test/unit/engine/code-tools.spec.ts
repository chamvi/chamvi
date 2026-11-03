/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    Engine,
    FatalToolError,
    ValidationError,
    agent,
    agentChannel,
    approve,
    defineAgent,
    defineEffectTool,
    defineTool,
    dispatchTo,
} from '@chamvi/core';
import type {
    AgentDefinition,
    CodeAgentDefinition,
    IChannel,
    IStore,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { approvalWait } from '../../utils/approvals.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

function setup(def: Omit<CodeAgentDefinition, 'name'>, options: { channels?: IChannel[]; agents?: AgentDefinition[] } = {}) {
    const clock = new ControllableClock(START);
    const store: IStore = createMemoryStore({ clock });
    const engine = new Engine({
        store,
        clock,
        agents: [defineAgent({ name: 'code', ...def } as CodeAgentDefinition), ...(options.agents ?? []).map((a) => defineAgent(a))],
        channels: options.channels ?? [],
        onError: () => {},
    });

    return { store, engine };
}

async function runOnce(engine: Engine, payload: unknown = {}, channel = 'test'): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'code',
        trigger: 'test',
        channel,
        payload,
    });

    await engine.idle();

    return runId;
}

describe('ctx.tools in code runs', () => {
    it('runs a tool with validated input and records a tool step per call', async () => {
        const { store, engine } = setup({
            tools: {
                double: defineTool({
                    inputSchema: z.object({ n: z.string().transform(Number) }),
                    execute: async ({ n }) => n * 2,
                }),
            },
            run: async (_payload, ctx) => ({ result: await ctx.tools.double!({ n: '21' }) }),
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ result: 42 });

        const steps = await store.steps.find(runId);

        expect(steps.map((s) => [s.index, s.kind, s.name])).toEqual([[0, 'tool', 'double'], [1, 'tool', 'code']]);
        expect(steps[0]).toMatchObject({ input: { n: '21' }, output: 42 });

        await engine.stop();
    });

    it('resolves a streaming tool to its last value', async () => {
        const { store, engine } = setup({
            tools: {
                count: defineTool({
                    inputSchema: z.object({}),
                    async* execute() {
                        yield 1;
                        yield 2;
                    },
                }),
            },
            run: async (_payload, ctx) => ctx.tools.count!({}),
        });
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.output).toBe(2);

        await engine.stop();
    });

    it('executes an effect tool once across a replay', async () => {
        let writes = 0;
        let calls = 0;
        const { store, engine } = setup({
            tools: {
                write: defineEffectTool({
                    inputSchema: z.object({ text: z.string() }),
                    execute: async () => {
                        writes++;

                        return `written ${writes}`;
                    },
                }),
            },
            run: async (_payload, ctx) => {
                calls++;

                const written = await ctx.tools.write!({ text: 'x' });
                const decision = await approve(ctx, { title: 'Go?' });

                return { written, approved: decision.approved };
            },
        });
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.status).toBe('waiting');

        await engine.approve(runId, { approvalId: '0:run:0', approved: true });
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ written: 'written 1', approved: true });
        expect(writes).toBe(1);
        expect(calls).toBe(2);

        await engine.stop();
    });

    it('pauses on a tool\'s approve() with approval id 0:run:0:0 and hands the tool\'s result to run()', async () => {
        const { store, engine } = setup({
            tools: {
                ask: defineTool({
                    inputSchema: z.object({}),
                    execute: async (_input, { context }) => {
                        const decision = await approve(context, { title: 'May I?' });

                        return decision.approved ? 'yes' : 'no';
                    },
                }),
            },
            run: async (_payload, ctx) => ({ answer: await ctx.tools.ask!({}) }),
        });
        const runId = await runOnce(engine);
        const waiting = await store.runs.findOne(runId);

        expect(waiting?.status).toBe('waiting');
        expect(waiting?.waiting).toMatchObject({
            kind: 'approval',
            approvalId: '0:run:0:0',
            toolName: 'ask',
        });
        expect(await store.steps.find(runId)).toHaveLength(0);

        await engine.approve(runId, { approvalId: '0:run:0:0', approved: true });
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ answer: 'yes' });

        await engine.stop();
    });

    it('still pauses when run() catches a tool\'s suspension', async () => {
        const { store, engine } = setup({
            tools: {
                ask: defineTool({
                    inputSchema: z.object({}),
                    execute: async (_input, { context }) => (await approve(context, { title: 'May I?' })).approved,
                }),
            },
            run: async (_payload, ctx) => {
                try {
                    await ctx.tools.ask!({});
                } catch {
                    return 'ignored';
                }

                return 'asked';
            },
        });
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.status).toBe('waiting');

        await engine.stop();
    });

    it('taints the run through a taint tool and its dispatched child inherits the taint', async () => {
        const { store, engine } = setup({
            tools: {
                read: defineTool({
                    inputSchema: z.object({}),
                    trust: { taint: true },
                    execute: async () => 'outside text',
                }),
            },
            run: async (_payload, ctx) => {
                await ctx.tools.read!({});

                const { runId } = await dispatchTo(ctx, {
                    agent: 'worker',
                    role: 'item',
                    payload: { n: 1 },
                });

                return { child: runId };
            },
        }, {
            channels: [agentChannel()],
            agents: [{
                name: 'worker',
                instructions: 'You work.',
                model: mockModel([{ parts: [{ type: 'text', text: 'done' }] }]),
                channels: [agent.on({ role: 'item', from: ['code'] })],
            }],
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.taint).toEqual({ at: expect.any(Date), source: 'tool:read' });

        const child = await store.runs.findOne((run?.output as { child: string }).child);

        expect(child?.parentRunId).toBe(runId);
        expect(child?.taint?.source).toBe('tool:read');

        await engine.stop();
    });

    it('asks for the trust approval before a guarded tool on a tainted run', async () => {
        let writes = 0;
        const source: IChannel = {
            name: 'source',
            untrusted: true,
            out: async () => {},
        };
        const { store, engine } = setup({
            tools: {
                send: defineEffectTool({
                    inputSchema: z.object({ text: z.string() }),
                    trust: { guardWhenTainted: true },
                    execute: async () => {
                        writes++;

                        return 'sent';
                    },
                }),
            },
            run: async (_payload, ctx) => ctx.tools.send!({ text: 'secret' }),
        }, { channels: [source] });
        const runId = await runOnce(engine, {}, 'source');
        const waiting = await store.runs.findOne(runId);

        expect(waiting?.status).toBe('waiting');
        expect(approvalWait(waiting)?.body).toContain('secret');
        expect(writes).toBe(0);

        await engine.approve(runId, { approvalId: approvalWait(waiting)!.approvalId, approved: true });
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toBe('sent');
        expect(writes).toBe(1);

        await engine.stop();
    });

    it('fails the run on input that does not match the tool\'s schema', async () => {
        const { store, engine } = setup({
            tools: {
                double: defineTool({
                    inputSchema: z.object({ n: z.number() }),
                    execute: async ({ n }) => n * 2,
                }),
            },
            run: async (_payload, ctx) => ctx.tools.double!({ n: 'x' }),
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error?.code).toBe('validation_error');

        await engine.stop();
    });

    it('fails the run on an unknown or policy-hidden tool, and run() may catch it', async () => {
        const hidden = defineTool({
            inputSchema: z.object({}),
            execute: async () => 'hidden',
        });
        const unknown = setup({ run: async (_payload, ctx) => ctx.tools.missing!({}) });
        const unknownId = await runOnce(unknown.engine);

        expect((await unknown.store.runs.findOne(unknownId))?.error).toEqual({
            code: 'validation_error',
            message: 'Tool "missing" is not available to agent "code".',
        });
        await unknown.engine.stop();

        const policy = setup({
            tools: { hidden },
            toolPolicy: (name) => name !== 'hidden',
            run: async (_payload, ctx) => ctx.tools.hidden!({}),
        });
        const policyId = await runOnce(policy.engine);

        expect((await policy.store.runs.findOne(policyId))?.error).toEqual({
            code: 'validation_error',
            message: 'Tool "hidden" is not available to agent "code".',
        });
        await policy.engine.stop();

        const caught = setup({
            run: async (_payload, ctx) => {
                try {
                    await ctx.tools.missing!({});
                } catch (error) {
                    return { caught: error instanceof ValidationError };
                }

                return { caught: false };
            },
        });
        const caughtId = await runOnce(caught.engine);

        expect((await caught.store.runs.findOne(caughtId))?.output).toEqual({ caught: true });
        await caught.engine.stop();
    });

    it('fails the run with a FatalToolError\'s code and records the error on the call\'s step', async () => {
        const { store, engine } = setup({
            tools: {
                boom: defineTool({
                    inputSchema: z.object({}),
                    execute: async (): Promise<string> => {
                        throw new FatalToolError('stop', 'boom_code');
                    },
                }),
            },
            run: async (_payload, ctx) => ctx.tools.boom!({}),
        });
        const runId = await runOnce(engine);
        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({ code: 'boom_code', message: 'stop' });

        const steps = await store.steps.find(runId);

        expect(steps[0]).toMatchObject({
            kind: 'tool',
            name: 'boom',
            error: { code: 'boom_code', message: 'stop' },
        });

        await engine.stop();
    });
    it('refuses dispatches and tool calls that run() makes after its execution ended', async () => {
        const applied: string[] = [];
        const gate = Promise.withResolvers<void>();
        const late = Promise.withResolvers<unknown[]>();
        const { store, engine } = setup({
            tools: {
                send: defineEffectTool({
                    inputSchema: z.object({ body: z.string() }),
                    execute: async ({ body }) => {
                        applied.push(body);

                        return 'sent';
                    },
                }),
            },
            // ignores ctx.run.signal: keeps going after the cancel
            run: async (_payload, ctx) => {
                await gate.promise;

                const errors = await Promise.all([
                    dispatchTo(ctx, {
                        agent: 'worker',
                        role: 'item',
                        payload: { n: 1 },
                    }).then(() => undefined, (error: unknown) => error),
                    ctx.tools.send!({ body: 'late' }).then(() => undefined, (error: unknown) => error),
                ]);

                late.resolve(errors);

                return 'late';
            },
        }, {
            channels: [agentChannel()],
            agents: [{
                name: 'worker',
                instructions: 'You work.',
                model: mockModel([{ parts: [{ type: 'text', text: 'done' }] }]),
                channels: [agent.on({ role: 'item', from: ['code'] })],
            }],
        });

        await engine.start();

        const running = Promise.withResolvers<void>();
        const off = engine.on('run.updated', ({ run }) => {
            if (run.agent === 'code' && run.status === 'running') {
                running.resolve();
            }
        });
        const { runId } = await engine.dispatch({
            agent: 'code',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await running.promise;
        off();
        await engine.cancel(runId);
        await engine.idle();

        expect((await store.runs.findOne(runId))?.status).toBe('cancelled');

        gate.resolve();

        const errors = await late.promise;

        await engine.idle();

        expect(errors).toEqual([expect.objectContaining({ code: 'invalid_run_state' }), expect.objectContaining({ code: 'invalid_run_state' })]);
        expect(applied).toEqual([]);
        expect((await store.runs.find({ parentRunId: runId })).data).toEqual([]);
        expect(await store.steps.find(runId)).toEqual([]);

        await engine.stop();
    });
});
