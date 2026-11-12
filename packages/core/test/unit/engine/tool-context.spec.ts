/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import { Permission } from '@chamvi/access';
import {
    Engine,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    approve,
    defineEffectTool,
    defineModelAgent,
    defineSimpleAgent,
    defineTool,
    requireToolPermission,
    toolContextSchema,
} from '@chamvi/core';
import type {
    AgentDefinition,
    IEngine,
    Invoker,
    ToolContext,
} from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { gateTool, recordApprovals } from '../../utils/approvals.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockResponse } from '../../utils/mock-model.ts';

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

const alice: Invoker = {
    id: 'u-alice',
    kind: 'user',
    name: 'Alice',
    bindings: [{ permission: { name: Permission.TOOL_USE }, policies: [{ type: 'attributes', query: { name: 'deploy' } } as never] }],
};

const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const callTool = (toolName: string, input: unknown = {}): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName,
        input,
    }],
});

/** Contexts the module-level `lookup` saw, in call order. */
let seen: ToolContext[] = [];

const lookup = defineTool({
    inputSchema: z.object({}),
    execute: async (_input, { context }) => {
        seen.push(context);

        return 'found';
    },
});

/** An identity Standard Schema: the AI SDK hands the validated value on unchanged. */
const identity = <T>(): StandardSchemaV1<T, T> => ({
    '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => ({ value: value as T }),
    },
});

type Setup = {
    model: LanguageModel;
    tools?: AgentDefinition['tools'];
    state?: AgentDefinition['state'];
    toolPolicy?: AgentDefinition['toolPolicy'];
    hooks?: AgentDefinition['hooks'];
    toolsContext?: AgentDefinition['toolsContext'];
    store?: ReturnType<typeof createMemoryStore>;
    owner?: string;
    claimTtlMs?: number;
    budget?: AgentDefinition['budget'];
};

function setup(s: Setup) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = s.store ?? createMemoryStore({ clock });
    const agent = defineModelAgent({
        name: 'release',
        instructions: 'You release.',
        model: s.model,
        tools: s.tools,
        state: s.state,
        toolPolicy: s.toolPolicy,
        hooks: s.hooks,
        toolsContext: s.toolsContext,
        ...(s.budget ? { budget: s.budget } : {}),
    });
    const engine = new Engine({
        store,
        agents: [agent],
        clock: s.store ? undefined : clock,
        claimTtlMs: s.claimTtlMs ?? 30,
        owner: s.owner,
        onError: () => {},
    });

    engines.push(engine);

    const notifier = recordApprovals(engine);

    return {
        clock,
        store,
        engine,
        notifier,
    };
}

const env = (invoker: Invoker | undefined = alice) => ({
    agent: 'release',
    trigger: 'http',
    channel: 'http' as const,
    payload: {},
    invoker,
});

async function runOnce(s: Setup) {
    const ctx = setup(s);

    await ctx.engine.start();

    const { runId } = await ctx.engine.dispatch(env());

    await ctx.engine.idle();

    return {
        ...ctx,
        runId,
        run: await ctx.store.runs.findOne(runId),
    };
}

/** A model shared by several engines; 'hang' only settles by aborting. */
function scripted(script: Array<MockResponse | 'hang'>) {
    const calls: LanguageModelV4CallOptions[] = [];
    const model = new MockLanguageModelV4({
        doStream: async (options) => {
            const turn = script[calls.length];

            calls.push(options);

            if (!turn) {
                throw new Error('mock script exhausted');
            }

            if (turn === 'hang') {
                return new Promise((_resolve, reject) => {
                    options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
                });
            }

            return mockModel([turn]).doStream(options);
        },
    });

    return { model, calls };
}

describe('tool context', () => {
    afterEach(() => {
        seen = [];
    });

    it('hands run, state and artifacts to a module-level defineTool', async () => {
        const recorded: Array<{
            runId: string;
            invoker: unknown;
            signal: unknown
        }> = [];
        const release = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                recorded.push({
                    runId: context.run.runId,
                    invoker: context.run.trigger.invoker,
                    signal: context.run.signal,
                });
                await context.state.set('k', 'v');
                await context.artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([1]) });

                return 'ok';
            },
        });
        const {
            store,
            runId,
            run,
        } = await runOnce({ model: mockModel([callTool('release'), text('done')]), tools: { release } });

        expect(run?.status).toBe('completed');
        expect(recorded).toHaveLength(1);
        expect(recorded[0]!.runId).toBe(runId);
        expect(recorded[0]!.invoker).toEqual(alice);
        expect(recorded[0]!.signal).toBeInstanceOf(AbortSignal);
        expect(await store.state.findOne('release', 'k')).toBe('v');
        expect(await store.artifacts.find(runId)).toHaveLength(1);
    });

    it('gives parallel calls of one step the same context object', async () => {
        const model = mockModel([{
            parts: [
                {
                    type: 'tool-call',
                    toolName: 'lookup',
                    input: {},
                    toolCallId: 'a',
                },
                {
                    type: 'tool-call',
                    toolName: 'lookup',
                    input: {},
                    toolCallId: 'b',
                },
            ],
        }, text('done')]);
        const { run } = await runOnce({ model, tools: { lookup } });

        expect(run?.status).toBe('completed');
        expect(seen).toHaveLength(2);
        expect(seen[0]).toBe(seen[1]);
    });

    it('leaves a tool with its own contextSchema alone', async () => {
        const contexts: unknown[] = [];
        const own = tool({
            inputSchema: z.object({}),
            // optional: the AI SDK types a context as an object, so the schema is cast
            contextSchema: z.object({ token: z.string() }).optional() as unknown as StandardSchemaV1<{ token: string }>,
            execute: async (_input, { context }) => {
                contexts.push(context);

                return 'ok';
            },
        });
        const { run } = await runOnce({ model: mockModel([callTool('own'), text('done')]), tools: { own } });

        expect(run?.status).toBe('completed');
        expect(contexts).toEqual([undefined]);
    });

    it('leaves a tool without contextSchema alone', async () => {
        const contexts: unknown[] = [];
        const bare = tool({
            inputSchema: z.object({}),
            execute: async (_input, options) => {
                contexts.push(options.context);

                return 'ok';
            },
        });
        const { run } = await runOnce({ model: mockModel([callTool('bare'), text('done')]), tools: { bare } });

        expect(run?.status).toBe('completed');
        expect(contexts).toEqual([undefined]);
    });

    it('hands a toolsContext entry to a third-party tool', async () => {
        const token = { token: 't' };
        const executeSeen: unknown[] = [];
        const raw = tool({
            inputSchema: z.object({}),
            contextSchema: identity<{ token: string }>(),
            execute: async (_input, { context }) => {
                executeSeen.push(context);

                return 'ok';
            },
        });
        const zoddedSeen: unknown[] = [];
        const zodded = tool({
            inputSchema: z.object({}),
            contextSchema: z.object({ token: z.string() }),
            execute: async (_input, { context }) => {
                zoddedSeen.push(context);

                return 'ok';
            },
        });
        const { run } = await runOnce({
            model: mockModel([callTool('raw'), callTool('zodded'), text('done')]),
            tools: { raw, zodded },
            toolsContext: { raw: token, zodded: token },
        });

        expect(run?.status).toBe('completed');
        expect(executeSeen[0]).toBe(token);
        expect(zoddedSeen[0]).toEqual(token);
    });

    it('hands a toolsContext entry to a tool without contextSchema', async () => {
        const token = { token: 't' };
        const contexts: unknown[] = [];
        const bare = tool({
            inputSchema: z.object({}),
            execute: async (_input, options) => {
                contexts.push(options.context);

                return 'ok';
            },
        });
        const { run } = await runOnce({
            model: mockModel([callTool('bare'), text('done')]),
            tools: { bare },
            toolsContext: { bare: token },
        });

        expect(run?.status).toBe('completed');
        expect(contexts[0]).toBe(token);
    });

    it('passes the same entry object to every run', async () => {
        const token = { token: 't' };
        const contexts: unknown[] = [];
        const raw = tool({
            inputSchema: z.object({}),
            contextSchema: identity<{ token: string }>(),
            execute: async (_input, { context }) => {
                contexts.push(context);

                return 'ok';
            },
        });
        const { engine } = setup({
            model: mockModel([callTool('raw'), text('done'), callTool('raw'), text('done')]),
            tools: { raw },
            toolsContext: { raw: token },
        });

        await engine.start();
        await engine.dispatch(env());
        await engine.idle();
        await engine.dispatch(env());
        await engine.idle();
        expect(contexts).toHaveLength(2);
        expect(contexts[0]).toBe(token);
        expect(contexts[1]).toBe(token);
    });

    it('rejects a toolsContext entry naming a chamvi tool', async () => {
        const model = mockModel([text('never')]);

        expect(() => defineModelAgent({
            name: 'release',
            instructions: 'x',
            model,
            tools: { lookup },
            toolsContext: { lookup: {} },
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => defineModelAgent({
            name: 'release',
            instructions: 'x',
            model,
            tools: { lookup },
            toolsContext: { lookup: {} },
        })).toThrow(/toolsContext entry "lookup" names a chamvi tool/);

        const {
            store,
            runId,
            run,
        } = await runOnce({
            model,
            tools: () => ({ lookup }),
            toolsContext: { lookup: {} },
        });

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({
            code: 'invalid_agent_definition',
            message: 'Agent "release": toolsContext entry "lookup" names a chamvi tool, which gets the run context instead.',
        });
        expect(model.doStreamCalls).toHaveLength(0);
        expect(await store.steps.find(runId)).toEqual([]);
    });

    it('rejects a toolsContext entry naming no tool', async () => {
        const model = mockModel([text('never')]);

        expect(() => defineModelAgent({
            name: 'release',
            instructions: 'x',
            model,
            tools: { lookup },
            toolsContext: { missing: {} },
        })).toThrow(/toolsContext entry "missing" names no tool/);

        const { run } = await runOnce({
            model,
            tools: () => ({ lookup }),
            toolsContext: { missing: {} },
        });

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({
            code: 'invalid_agent_definition',
            message: 'Agent "release": toolsContext entry "missing" names no tool of the agent.',
        });
        expect(model.doStreamCalls).toHaveLength(0);
    });

    it('fails the run when a third-party context schema rejects', async () => {
        let executed = 0;
        const third = tool({
            inputSchema: z.object({}),
            contextSchema: z.object({ token: z.string() }),
            execute: async () => {
                executed++;

                return 'ok';
            },
        });
        const expected = 'Type validation failed for tool context (third): ' +
            'the agent has no toolsContext entry for it, and its contextSchema requires one.';
        const first = await runOnce({ model: mockModel([callTool('third'), text('done')]), tools: { third } });

        expect(first.run?.status).toBe('failed');
        expect(first.run?.error).toEqual({ code: 'validation_error', message: expected });
        expect(executed).toBe(0);
        expect((await first.store.steps.find(first.runId)).map((s) => s.kind)).toEqual(['llm']);
    });

    it('keeps a rejected toolsContext entry out of the run error', async () => {
        const search = tool({
            inputSchema: z.object({}),
            contextSchema: z.object({ apiKey: z.string() }),
            execute: async () => 'ok',
        });
        // a schema whose issue message echoes the value, as some validators do
        const echoing: StandardSchemaV1<{ apiKey: string }, { apiKey: string }> = {
            '~standard': {
                version: 1,
                vendor: 'test',
                validate: (value) => ({ issues: [{ message: `received ${JSON.stringify(value)}`, path: [{ key: 'apiKey' }] }] }),
            },
        };
        const echo = tool({
            inputSchema: z.object({}),
            contextSchema: echoing,
            execute: async () => 'ok',
        });

        for (const [name, t] of [['search', search], ['echo', echo]] as const) {
            const { run } = await runOnce({
                model: mockModel([callTool(name), text('done')]),
                tools: { [name]: t },
                toolsContext: { [name]: { apikey: 'sk-SECRET-123' } },
            });

            expect(run?.status).toBe('failed');
            expect(run?.error?.code).toBe('validation_error');
            expect(run?.error?.message).toBe(`Type validation failed for tool context (${name}): ` +
                'the agent\'s toolsContext entry does not match the tool\'s contextSchema (at apiKey).');
            expect(JSON.stringify(run)).not.toContain('sk-SECRET-123');
        }
    });

    it('injects nothing for a look-alike schema object', async () => {
        let executed = 0;
        const lookalike: StandardSchemaV1<ToolContext, ToolContext> = {
            '~standard': {
                version: 1,
                vendor: 'chamvi',
                validate: toolContextSchema['~standard'].validate,
            },
        };
        const copy = tool({
            inputSchema: z.object({}),
            contextSchema: lookalike,
            execute: async () => {
                executed++;

                return 'ok';
            },
        });
        const { run } = await runOnce({ model: mockModel([callTool('copy'), text('done')]), tools: { copy } });

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({
            code: 'validation_error',
            message: 'Type validation failed for tool context (copy): No chamvi tool context: ' +
                'the tool was built by another copy of @chamvi/core, or runs outside a chamvi agent.',
        });
        expect(executed).toBe(0);
    });

    it('keeps the context on a copied tool', async () => {
        const { runId, run } = await runOnce({
            model: mockModel([callTool('lookup'), text('done')]),
            // a { ...lookup } spread does not typecheck against ToolSet (an AI SDK typing quirk)
            // eslint-disable-next-line prefer-object-spread
            tools: { lookup: Object.assign({}, lookup, { description: 'copy' }) },
        });

        expect(run?.status).toBe('completed');
        expect(seen).toHaveLength(1);
        expect(seen[0]!.run.runId).toBe(runId);
    });

    it('still calls a factory with the same context and mixes both forms', async () => {
        const factoryContexts: ToolContext[] = [];
        const { run } = await runOnce({
            model: mockModel([callTool('lookup'), text('done')]),
            tools: (ctx) => {
                factoryContexts.push(ctx);

                return { lookup };
            },
        });

        expect(run?.status).toBe('completed');
        expect(factoryContexts).toHaveLength(1);
        expect(seen[0]).toBe(factoryContexts[0]);
    });

    it('serves a plain set to every run, each call seeing its own run', async () => {
        const { engine } = setup({
            model: mockModel([callTool('lookup'), text('done'), callTool('lookup'), text('done')]),
            tools: { lookup },
        });

        await engine.start();

        const first = await engine.dispatch(env());

        await engine.idle();

        const second = await engine.dispatch(env());

        await engine.idle();
        expect(seen.map((c) => c.run.runId)).toEqual([first.runId, second.runId]);
    });

    it('injects state tools too', async () => {
        const {
            store,
            run,
        } = await runOnce({
            model: mockModel([
                callTool('state_notes_upsert', { id: 'n1', doc: { title: 'hello' } }),
                callTool('state_notes_list'),
                text('done'),
            ]),
            state: { notes: z.object({ title: z.string() }) },
        });

        expect(run?.status).toBe('completed');
        expect(await store.state.findDocuments('release', 'notes')).toEqual([{ id: 'n1', doc: { title: 'hello' } }]);
    });

    it('rejects a toolsContext entry naming a state tool', async () => {
        const model = mockModel([text('never')]);
        const { run } = await runOnce({
            model,
            tools: () => ({ lookup }),
            state: { notes: z.object({ title: z.string() }) },
            toolsContext: { state_notes_list: {} },
        });

        expect(run?.status).toBe('failed');
        expect(run?.error?.message).toMatch(/toolsContext entry "state_notes_list" names a chamvi tool/);
        expect(model.doStreamCalls).toHaveLength(0);
    });

    it('hands the context to an effect tool run by the engine', async () => {
        let applied = 0;
        const post = defineEffectTool({
            inputSchema: z.object({ body: z.string() }),
            effectKey: (input, c) => `${c.run.trigger.invoker?.id}:post:${input.body}`,
            execute: async (_input, { context }) => {
                applied++;

                return context.run.runId;
            },
        });
        const {
            store,
            runId,
            run,
        } = await runOnce({
            model: mockModel([callTool('post', { body: 'hi' }), text('done')]),
            tools: { post },
        });

        expect(run?.status).toBe('completed');
        expect(applied).toBe(1);
        expect(await store.effects.findOne('u-alice:post:hi')).toEqual({ result: runId });
    });

    it('keeps policy-hidden tools and the execute re-check working', async () => {
        let rolledBack = 0;
        const deploy = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                seen.push(context);

                return 'deployed';
            },
        });
        const rollback = defineTool({
            inputSchema: z.object({}),
            execute: async () => {
                rolledBack++;

                return 'rolled back';
            },
        });
        const {
            store,
            runId,
            run,
        } = await runOnce({
            model: mockModel([callTool('deploy'), callTool('rollback'), text('done')]),
            tools: { deploy, rollback },
            toolPolicy: requireToolPermission(),
        });

        expect(run?.status).toBe('completed');
        expect(seen).toHaveLength(1);
        expect(seen[0]!.run.runId).toBe(runId);
        expect(rolledBack).toBe(0);

        const refused = (await store.steps.find(runId)).find((s) => s.kind === 'tool' && s.name === 'rollback');

        expect((refused?.error as { code: string } | undefined)?.code).toBe('tool_not_allowed');
    });

    it('hands the context to a call approved on resume', async () => {
        const recorded: Array<{
            runId: string;
            invoker: unknown;
            aborted: boolean
        }> = [];
        const deploy = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                recorded.push({
                    runId: context.run.runId,
                    invoker: context.run.trigger.invoker,
                    aborted: context.run.signal.aborted,
                });

                return 'deployed';
            },
        });
        const {
            engine,
            store,
            notifier,
        } = setup({
            model: mockModel([callTool('deploy'), text('done')]),
            tools: { deploy },
            hooks: gateTool('deploy'),
        });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('waiting');
        expect(recorded).toHaveLength(0);

        await engine.approve(notifier.calls[0]!.runId, { approvalId: notifier.calls[0]!.approvalId, approved: true });
        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(recorded).toEqual([{
            runId,
            invoker: alice,
            aborted: false,
        }]);
    });

    it('hands the context to a call after recovery', async () => {
        const { model, calls } = scripted(['hang', callTool('lookup'), text('done')]);
        const store = createMemoryStore();
        // real time: a short lease could expire on a slow runner and let A re-run
        // the run itself; drain releases the claim, so B recovers it at once
        const a = setup({
            model,
            tools: { lookup },
            store,
            owner: 'A',
            claimTtlMs: 60_000,
        });
        const b = setup({
            model,
            tools: { lookup },
            store,
            owner: 'B',
            claimTtlMs: 60_000,
        });

        await a.engine.start();

        const { runId } = await a.engine.dispatch(env());

        await vi.waitFor(() => expect(calls).toHaveLength(1));
        await a.engine.drain({ timeoutMs: 50 });
        expect((await store.runs.findOne(runId))?.status).toBe('interrupted');

        await b.engine.start();
        await b.engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(seen).toHaveLength(1);
        expect(seen[0]!.run.runId).toBe(runId);
    });

    it('stores no tool context in steps or checkpoints', async () => {
        const {
            store,
            runId,
            run,
        } = await runOnce({
            model: mockModel([callTool('lookup'), text('done')]),
            tools: { lookup },
        });

        expect(run?.status).toBe('completed');

        const steps = JSON.stringify(await store.steps.find(runId));
        const checkpoint = JSON.stringify(await store.checkpoints.findOne(runId));

        for (const json of [steps, checkpoint]) {
            expect(json).not.toContain('toolsContext');
            expect(json).not.toContain('"artifacts"');
        }
    });
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

describe('writes after the execution ended', () => {
    it('refuses a state write a model tool left after the run settled', async () => {
        const work = detachedWork();
        const leave = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                work.leave(() => context.state.set('k', 1));

                return 'ok';
            },
        });
        const { store, run } = await runOnce({
            model: mockModel([callTool('leave'), text('done')]),
            tools: { leave },
        });

        expect(run?.status).toBe('completed');

        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect((outcome as Error).message).toContain('state.set()');
        expect(await store.state.findOne('release', 'k')).toBeUndefined();
    });

    it('refuses a collection upsert and remove after the run settled', async () => {
        const work = detachedWork();
        const leave = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                const items = context.state.collection('items');

                await items.upsert('i0', { title: 'kept' });
                work.leave(() => items.upsert('i1', { title: 'late' }));
                work.leave(() => items.remove('i0'));

                return 'ok';
            },
        });
        const { store, run } = await runOnce({
            model: mockModel([callTool('leave'), text('done')]),
            tools: { leave },
            state: { items: z.object({ title: z.string() }) },
        });

        expect(run?.status).toBe('completed');

        const outcomes = await work.release();

        expect(outcomes[0]).toBeInstanceOf(InvalidRunStateError);
        expect(outcomes[1]).toBeInstanceOf(InvalidRunStateError);

        const docs = await store.state.findDocuments('release', 'items', {});

        expect(docs.map(({ id }) => id)).toEqual(['i0']);
    });

    it('refuses artifacts.put() after the run settled and still answers reads', async () => {
        const work = detachedWork();
        let artifacts: ToolContext['artifacts'] | undefined;
        let kept: string | undefined;
        const leave = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                artifacts = context.artifacts;
                kept = (await context.artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([1]) })).id;
                work.leave(() => context.artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([2]) }));
                work.leave(() => context.artifacts.put({
                    mediaType: 'text/plain',
                    data: new Uint8Array([3]),
                    key: 'late',
                }));

                return 'ok';
            },
        });
        const {
            store,
            run,
            runId,
        } = await runOnce({
            model: mockModel([callTool('leave'), text('done')]),
            tools: { leave },
        });

        expect(run?.status).toBe('completed');

        const outcomes = await work.release();

        expect(outcomes[0]).toBeInstanceOf(InvalidRunStateError);
        expect((outcomes[0] as Error).message).toContain('artifacts.put()');
        expect(outcomes[1]).toBeInstanceOf(InvalidRunStateError);
        expect((await store.artifacts.find(runId)).map(({ id }) => id)).toEqual([kept]);
        expect((await artifacts!.list()).map(({ id }) => id)).toEqual([kept]);
        expect((await artifacts!.get(kept!))?.data).toEqual(new Uint8Array([1]));
    });

    it('refuses a state write a simple run left after it settled', async () => {
        const work = detachedWork();
        const clock = new ControllableClock(new Date(1_000_000));
        const store = createMemoryStore({ clock });
        const engine = new Engine({
            store,
            clock,
            agents: [defineSimpleAgent({
                name: 'fan',
                run: async (_payload, ctx) => {
                    await ctx.state.set('kept', 1);
                    work.leave(() => ctx.state.set('late', 1));
                    work.leave(() => ctx.artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([1]) }));

                    return 'ok';
                },
            })],
            onError: () => {},
        });

        engines.push(engine);
        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'fan',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');

        const outcomes = await work.release();

        expect(outcomes[0]).toBeInstanceOf(InvalidRunStateError);
        expect(outcomes[1]).toBeInstanceOf(InvalidRunStateError);
        expect(await store.state.findOne('fan', 'kept')).toBe(1);
        expect(await store.state.findOne('fan', 'late')).toBeUndefined();
        expect(await store.artifacts.find(runId)).toHaveLength(0);
    });

    it('refuses a write left by the paused execution and accepts writes after the resume', async () => {
        const work = detachedWork();
        let executions = 0;
        const deploy = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                executions++;

                if (executions === 1) {
                    work.leave(() => context.state.set('late', 1));
                }

                const decision = await approve(context, { title: 'Deploy?' });

                await context.state.set('after', decision.approved);

                return 'deployed';
            },
        });
        const {
            engine,
            store,
            notifier,
        } = setup({
            model: mockModel([callTool('deploy'), text('done')]),
            tools: { deploy },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('waiting');

        const [outcome] = await work.release();

        expect(outcome).toBeInstanceOf(InvalidRunStateError);
        expect(await store.state.findOne('release', 'late')).toBeUndefined();

        await engine.approve(runId, { approvalId: notifier.calls[0]!.approvalId, approved: true });
        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(await store.state.findOne('release', 'after')).toBe(true);
    });

    it('keeps the writes of a tool that completed before a cancel', async () => {
        const { model, calls } = scripted([callTool('write'), 'hang']);
        const write = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
                await context.state.set('k', 1);

                return 'ok';
            },
        });
        const { engine, store } = setup({ model, tools: { write } });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await vi.waitFor(() => expect(calls).toHaveLength(2));
        await engine.cancel(runId);
        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('cancelled');
        expect(await store.state.findOne('release', 'k')).toBe(1);
    });
});

/**
 * A tool that honours the abort: it waits for the run signal, then cleans
 * up in its finally (released by the test, after the run settled) with a
 * state and an artifact write, and leaves one more write behind.
 */
function cleanupTool() {
    const entered = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    const settled = Promise.withResolvers<unknown[]>();
    const work = detachedWork();
    const honour = defineTool({
        inputSchema: z.object({}),
        execute: async (_input, { context }) => {
            const outcomes: unknown[] = [];

            try {
                entered.resolve();
                await new Promise((_resolve, reject) => {
                    context.run.signal.addEventListener('abort', () => reject(context.run.signal.reason));
                });
            } finally {
                await cleanup.promise;

                for (const write of [
                    () => context.state.set('cleanup', 1),
                    () => context.artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([1]) }),
                ]) {
                    outcomes.push(await write().then(() => 'done', (error: unknown) => error));
                }

                work.leave(() => context.state.set('late', 1));
                settled.resolve(outcomes);
            }

            return 'unreachable';
        },
    });

    return {
        honour,
        entered: entered.promise,
        /** Runs the finally's writes; resolves their outcomes once the call settled. */
        async clean(): Promise<unknown[]> {
            cleanup.resolve();

            const outcomes = await settled.promise;

            // the wrapper ends the frame when the call's promise settles
            await new Promise((resolve) => {
                setImmediate(resolve);
            });

            return outcomes;
        },
        release: () => work.release(),
    };
}

describe('writes from a live call after the execution ended', () => {
    it('keeps the cleanup writes of a tool that honours a cancel', async () => {
        const tool = cleanupTool();
        const { engine, store } = setup({
            model: mockModel([callTool('honour'), text('done')]),
            tools: { honour: tool.honour },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await tool.entered;
        await engine.cancel(runId);
        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('cancelled');

        expect(await tool.clean()).toEqual(['done', 'done']);
        expect(await store.state.findOne('release', 'cleanup')).toBe(1);
        expect(await store.artifacts.find(runId)).toHaveLength(1);

        // work that call left behind after it settled stays refused
        const [late] = await tool.release();

        expect(late).toBeInstanceOf(InvalidRunStateError);
        expect(await store.state.findOne('release', 'late')).toBeUndefined();
    });

    it('keeps the cleanup writes of a tool that honours the timeout', async () => {
        const tool = cleanupTool();
        const {
            engine,
            store,
            clock,
        } = setup({
            model: mockModel([callTool('honour'), text('done')]),
            tools: { honour: tool.honour },
            budget: { timeoutMs: 1000 },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env());

        await tool.entered;
        clock.advance(1000);
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('failed');
        expect(run?.error?.code).toBe('Timeout');

        expect(await tool.clean()).toEqual(['done', 'done']);
        expect(await store.state.findOne('release', 'cleanup')).toBe(1);
        expect(await store.artifacts.find(runId)).toHaveLength(1);

        const [late] = await tool.release();

        expect(late).toBeInstanceOf(InvalidRunStateError);
        expect(await store.state.findOne('release', 'late')).toBeUndefined();
    });
});
