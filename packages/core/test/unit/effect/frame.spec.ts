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
    vi,
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    InvalidRunStateError,
    agent,
    agentChannel,
    approve,
    defineEffectTool,
    defineModelAgent,
    defineTool,
    dispatch,
    extract,
    wrapToolsForRun,
} from '@chamvi/core';
import type {
    AgentHooks,
    ChannelMessage,
    IChannel,
    IEngine,
    ToolContext,
} from '@chamvi/core';
import { currentToolCall } from '../../../src/effect/frame.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const ctx = { run: { runId: 'r1' } } as unknown as ToolContext;
const schema = z.object({});

async function call(tools: ToolSet, name: string, toolCallId: string): Promise<unknown> {
    const result: unknown = await (tools[name]!.execute as (input: unknown, options: unknown) => unknown)({}, { toolCallId, messages: [] });

    if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
        const seen: unknown[] = await Array.fromAsync(result as AsyncIterable<unknown>);

        return seen;
    }

    return result;
}

describe('tool-call frame', () => {
    it('is undefined outside a tool call', () => {
        expect(currentToolCall()).toBeUndefined();
    });

    it('holds the call in plain and effect tools, across awaits', async () => {
        const plain = tool({
            inputSchema: schema,
            execute: async () => {
                await Promise.resolve();

                return currentToolCall();
            },
        });
        const effect = defineEffectTool({ inputSchema: schema, execute: async () => currentToolCall() });
        const tools = wrapToolsForRun({ plain, effect }, ctx, createMemoryStore().effects);

        expect(await call(tools, 'plain', 'c1')).toMatchObject({
            runId: 'r1',
            toolCallId: 'c1',
            toolName: 'plain',
            approvals: 0,
        });
        expect(await call(tools, 'effect', 'c2')).toMatchObject({
            runId: 'r1',
            toolCallId: 'c2',
            toolName: 'effect',
            approvals: 0,
        });
        expect(currentToolCall()).toBeUndefined();
    });

    it('holds the call while a streaming tool is iterated', async () => {
        const stream = tool({
            inputSchema: schema,
            async* execute() {
                yield currentToolCall()?.toolCallId;
                await Promise.resolve();
                yield currentToolCall()?.toolCallId;
            },
        });
        const tools = wrapToolsForRun({ stream }, ctx, createMemoryStore().effects);

        expect(await call(tools, 'stream', 'c3')).toEqual(['c3', 'c3']);
    });
});

const callOf = (toolName: string, input: unknown = {}, toolCallId?: string): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

/** Work a tool leaves behind: it runs once the test releases it, after the call returned. */
function detachedWork() {
    const gate = Promise.withResolvers<void>();
    const outcomes: Promise<unknown>[] = [];

    return {
        leave(work: () => Promise<unknown>) {
            outcomes.push(gate.promise.then(work).then(() => 'done', (error: unknown) => error));
        },
        async release(): Promise<unknown[]> {
            gate.resolve();

            return Promise.all(outcomes);
        },
    };
}

function setupEngine(tools: ToolSet, responses: MockResponse[], hooks?: AgentHooks, budget?: { timeoutMs?: number }) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = createMemoryStore({ clock });
    const sent: ChannelMessage[] = [];
    const slack: IChannel = {
        name: 'slack',
        async out(message) {
            sent.push(message);
        },
    };
    const engine = new Engine({
        store,
        clock,
        agents: [defineModelAgent({
            name: 'ops',
            instructions: 'You operate.',
            model: mockModel([...responses, ...Array.from({ length: 10 }, () => text('child done'))]),
            channels: [agent.on()],
            tools,
            hooks,
            budget,
        })],
        channels: [slack, agentChannel()],
        onError: () => {},
    });

    engines.push(engine);

    return {
        engine,
        store,
        sent,
        clock,
    };
}

async function runOnce(engine: IEngine): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'ops',
        trigger: 'test',
        channel: 'test',
        payload: {},
    });

    await engine.idle();

    return runId;
}

describe('detached work after a model tool call returned', () => {
    it('refuses emit() from work a tool left after returning', async () => {
        const work = detachedWork();
        const leave = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                work.leave(() => context.channels.findOneOrFail('slack').emit({ body: 'late' }, 'C1'));

                return 'ok';
            },
        });
        const {
            engine, 
            store, 
            sent, 
        } = setupEngine({ leave }, [turn(callOf('leave')), text('done')]);
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.status).toBe('completed');

        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect(sent).toHaveLength(0);
    });

    it('refuses dispatch() from work a tool left after returning', async () => {
        const work = detachedWork();
        const leave = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                work.leave(() => dispatch(context, { payload: 1, idempotencyKey: 'late' }));

                return 'ok';
            },
        });
        const { engine, store } = setupEngine({ leave }, [turn(callOf('leave')), text('done')]);
        const runId = await runOnce(engine);
        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect((await store.runs.find({ parentRunId: runId })).data).toHaveLength(0);

        const claim = await store.idempotency.claim('ops:agent', 'dispatch:default:late', 'probe', 1000);

        expect(claim.created).toBe(true);
    });

    it('refuses approve() from work a tool left after returning', async () => {
        const work = detachedWork();
        const leave = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                work.leave(() => approve(context, { title: 'late' }));

                return 'ok';
            },
        });
        const { engine, store } = setupEngine({ leave }, [turn(callOf('leave')), text('done')]);
        const runId = await runOnce(engine);
        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
    });

    it('refuses extract() from work a tool left after returning', async () => {
        const work = detachedWork();
        const leave = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                work.leave(() => extract(context, { schema: z.object({ title: z.string() }), content: 'late' }));

                return 'ok';
            },
        });
        const { engine, store } = setupEngine({ leave }, [turn(callOf('leave')), text('done')]);
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.status).toBe('completed');

        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect((outcome as Error).message).toContain('extract()');
    });

    it('refuses detached work while the run is still executing', async () => {
        const work = detachedWork();
        const seen: { outcome?: unknown; status?: string } = {};
        let stored: ReturnType<typeof createMemoryStore> | undefined;
        const leave = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                work.leave(() => context.channels.findOneOrFail('slack').emit({ body: 'late' }, 'C1'));

                return 'ok';
            },
        });
        const later = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                [seen.outcome] = await work.release();
                seen.status = (await stored!.runs.findOne(context.run.runId))?.status;

                return 'ok';
            },
        });
        const {
            engine, 
            store, 
            sent, 
        } = setupEngine({ leave, later }, [turn(callOf('leave')), turn(callOf('later')), text('done')]);

        stored = store;

        const runId = await runOnce(engine);

        expect(seen.status).toBe('running');
        expect(seen.outcome).toBeInstanceOf(InvalidRunStateError);
        expect(sent).toHaveLength(0);
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
    });

    it("keeps a streaming tool's frame active until iteration ends", async () => {
        const work = detachedWork();
        const stream = defineTool({
            inputSchema: schema,
            async* execute(_input, { context }) {
                const slack = (context as ToolContext).channels.findOneOrFail('slack');

                await slack.emit({ body: 'first' }, 'C1');
                yield 'one';
                await slack.emit({ body: 'second' }, 'C1');
                work.leave(() => slack.emit({ body: 'late' }, 'C1'));
                yield 'two';
            },
        });
        const {
            engine, 
            store, 
            sent, 
        } = setupEngine({ stream }, [turn(callOf('stream')), text('done')]);
        const runId = await runOnce(engine);

        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(sent.map((m) => (m as { body?: string }).body)).toEqual(['first', 'second']);

        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect(sent).toHaveLength(2);
    });

    it('keeps the shared application of parallel identical effect calls active', async () => {
        let applied = 0;
        const notify = defineEffectTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                applied += 1;
                await Promise.resolve();
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                await context.channels.findOneOrFail('slack').emit({ body: 'once' }, 'C1');

                return 'sent';
            },
        });
        const {
            engine, 
            store, 
            sent, 
        } = setupEngine({ notify }, [
            turn(callOf('notify', {}, 'a'), callOf('notify', {}, 'b')),
            text('done'),
        ]);
        const runId = await runOnce(engine);
        const steps = (await store.steps.find(runId)).filter((step) => step.kind === 'tool');

        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(applied).toBe(1);
        expect(sent).toHaveLength(1);
        expect(steps.map((step) => step.output)).toEqual(['sent', 'sent']);
        expect(steps.map((step) => step.error)).toEqual([undefined, undefined]);
    });

    it('runs alreadyApplied, the effect record and afterToolExecution before the frame ends', async () => {
        const notify = defineEffectTool({
            inputSchema: schema,
            alreadyApplied: async (_key, _input, ctx) => {
                await ctx.channels.findOneOrFail('slack').emit({ body: 'reconcile' }, 'C1');

                return undefined;
            },
            execute: async () => 'sent',
        });
        const {
            engine, 
            store, 
            sent, 
        } = setupEngine({ notify }, [turn(callOf('notify')), text('done')], {
            afterToolExecution: async (_call, ctx) => {
                await ctx.channels.findOneOrFail('slack').emit({ body: 'after' }, 'C1');
            },
        });
        const runId = await runOnce(engine);
        const [step] = (await store.steps.find(runId)).filter((s) => s.kind === 'tool');

        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(step?.output).toBe('sent');
        expect(sent.map((m) => (m as { body?: string }).body)).toEqual(['reconcile', 'after']);
    });

    /** A tool that hangs, ignoring its signal, and emits once released. */
    function hungEmitter() {
        const release = Promise.withResolvers<void>();
        const started = Promise.withResolvers<void>();
        let outcome: unknown;
        const hang = defineTool({
            inputSchema: schema,
            execute: async (_input, { context }) => {
                started.resolve();
                await release.promise;

                try {
                    await context.channels.findOneOrFail('slack').emit({ body: 'late' }, 'C1');
                    outcome = 'sent';
                } catch (error) {
                    outcome = error;
                }

                return 'ok';
            },
        });

        return {
            hang,
            started: started.promise,
            async release(): Promise<unknown> {
                release.resolve();
                await vi.waitFor(() => expect(outcome).toBeDefined());

                return outcome;
            },
        };
    }

    async function startRun(engine: IEngine): Promise<string> {
        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'ops',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        return runId;
    }

    it('refuses emit() from a call still running after its execution timed out', async () => {
        const hung = hungEmitter();
        const {
            engine,
            store,
            sent,
            clock,
        } = setupEngine({ hang: hung.hang }, [turn(callOf('hang')), text('done')], undefined, { timeoutMs: 1000 });
        const runId = await startRun(engine);

        await hung.started;
        clock.advance(2000);
        await vi.waitFor(async () => expect((await store.runs.findOne(runId))?.status).toBe('failed'));
        expect((await store.runs.findOne(runId))?.error?.code).toBe('Timeout');

        expect(await hung.release()).toBeInstanceOf(InvalidRunStateError);
        expect(sent).toHaveLength(0);
    });

    it('refuses emit() from a call still running after its run was cancelled', async () => {
        const hung = hungEmitter();
        const {
            engine, 
            store, 
            sent, 
        } = setupEngine({ hang: hung.hang }, [turn(callOf('hang')), text('done')]);
        const runId = await startRun(engine);

        await hung.started;
        await engine.cancel(runId);
        await vi.waitFor(async () => expect((await store.runs.findOne(runId))?.status).toBe('cancelled'));

        expect(await hung.release()).toBeInstanceOf(InvalidRunStateError);
        expect(sent).toHaveLength(0);
    });
});
