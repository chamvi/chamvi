/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
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
} from '@chamvi/core';
import type {
    ChannelSubscription,
    DispatchInput,
    DispatchToInput,
    IEngine,
    IStore,
    Invoker,
    Run,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (input: unknown, toolCallId: string, toolName = 'send'): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const done = () => Array.from({ length: 20 }, () => text('done'));

const keys = {
    role: z.string().optional(),
    payload: z.unknown().optional(),
    idempotencyKey: z.string().optional(),
    concurrencyKey: z.string().optional(),
    address: z.string().optional(),
};

const send = defineTool({
    inputSchema: z.object({ agent: z.string(), ...keys }),
    execute: async (input, { context }) => dispatchTo(context, input as DispatchToInput),
});

const own = defineTool({
    inputSchema: z.object(keys),
    execute: async (input, { context }) => dispatch(context, input as DispatchInput),
});

/** True for a dispatched run (its first message renders channel `agent`). */
function isChild(options: LanguageModelV4CallOptions): boolean {
    const first = options.prompt.find((m) => m.role === 'user');

    if (!first || typeof first.content === 'string') {
        return false;
    }

    return first.content.some((part) => part.type === 'text' && part.text.includes('"channel": "agent"'));
}

/** The parent's script; every dispatched run answers `done`. */
function routedModel(parent: MockResponse[]) {
    const parentModel = mockModel([...parent, ...done()]);
    const childModel = mockModel(done());

    return new MockLanguageModelV4({ doStream: (options) => (isChild(options) ? childModel : parentModel).doStream(options) });
}

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function setup(options: {
    auditor: MockResponse[];
    auditorChannels?: ChannelSubscription<any>[];
    reporterChannels?: ChannelSubscription<any>[];
}) {
    const clock = new ControllableClock(START);
    const store = createMemoryStore({ clock });
    const auditor = defineAgent({
        name: 'auditor',
        instructions: 'You audit.',
        model: routedModel(options.auditor),
        channels: options.auditorChannels ?? [],
        tools: { send, own },
    });
    const reporter = defineAgent({
        name: 'reporter',
        instructions: 'You report.',
        model: mockModel(done()),
        channels: options.reporterChannels ?? [agent.on({ role: 'draft', from: ['auditor'] })],
    });
    const engine = new Engine({
        store,
        clock,
        agents: [auditor, reporter],
        channels: [agentChannel()],
        onError: () => {},
    });

    engines.push(engine);

    return { engine, store };
}

async function runAuditor(engine: IEngine, extra: { invoker?: Invoker } = {}) {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'auditor',
        trigger: 'test',
        channel: 'test',
        payload: {},
        ...extra,
    });

    await engine.idle();

    return runId;
}

async function dispatched(store: IStore): Promise<Run[]> {
    const { data } = await store.runs.find({});

    return data.filter((run) => run.trigger.channel === 'agent');
}

async function toolSteps(store: IStore, runId: string) {
    return (await store.steps.find(runId)).filter((step) => step.kind === 'tool');
}

const draft = {
    agent: 'reporter', 
    role: 'draft', 
    payload: { findings: 2 }, 
};

describe('dispatchTo()', () => {
    it('dispatchTo an agent whose role lists the caller', async () => {
        const { engine, store } = setup({ auditor: [turn(call(draft, 'c1')), text('done')] });
        const parentId = await runAuditor(engine);
        const [child] = await dispatched(store);

        expect(child?.agent).toBe('reporter');
        expect(child?.parentRunId).toBe(parentId);
        expect(child?.trigger).toMatchObject({
            agent: 'reporter',
            trigger: 'draft',
            channel: 'agent',
            payload: { findings: 2 },
            parent: {
                kind: 'dispatch',
                runId: parentId,
                agent: 'auditor',
                role: 'draft',
                depth: 1,
            },
        });

        const [step] = await toolSteps(store, parentId);

        expect(step?.output).toEqual({ runId: child!.id, deduplicated: false });
        expect(await store.effects.findOne(`dispatch-count:${parentId}:reporter:draft`)).toMatchObject({ result: { count: 1 } });
    });

    it('dispatchTo refuses a caller not in from', async () => {
        const { engine, store } = setup({
            auditor: [turn(call(draft, 'c1')), text('done')],
            reporterChannels: [agent.on({ role: 'draft', from: ['planner'] })],
        });
        const parentId = await runAuditor(engine);
        const [step] = await toolSteps(store, parentId);

        expect(step?.error).toEqual({
            code: 'validation_error',
            message: 'Agent "reporter" role "draft" accepts no dispatches from agent "auditor".',
        });
        expect(await dispatched(store)).toHaveLength(0);
        expect(await store.effects.findOne(`dispatch-count:${parentId}:reporter:draft`)).toBeUndefined();
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('a role without from refuses another agent', async () => {
        const { engine, store } = setup({
            auditor: [turn(call(draft, 'c1')), text('done')],
            reporterChannels: [agent.on({ role: 'draft' })],
        });
        const parentId = await runAuditor(engine);
        const [step] = await toolSteps(store, parentId);

        expect(step?.error).toEqual({
            code: 'validation_error',
            message: 'Agent "reporter" role "draft" accepts no dispatches from agent "auditor".',
        });
        expect(await dispatched(store)).toHaveLength(0);
    });

    it('own agent always allowed without from', async () => {
        const { engine, store } = setup({
            auditor: [turn(call({ agent: 'auditor', payload: 'self' }, 'c1')), text('done')],
            auditorChannels: [agent.on({ from: ['planner'] })],
        });
        const parentId = await runAuditor(engine);
        const [child] = await dispatched(store);

        expect(child?.agent).toBe('auditor');
        expect(child?.parentRunId).toBe(parentId);
    });

    it('dispatchTo to the own agent behaves as dispatch', async () => {
        const input = { payload: 'same', concurrencyKey: 'k1' };
        const { engine, store } = setup({
            auditor: [
                turn(call(input, 'c1', 'own')),
                turn(call({ agent: 'auditor', ...input }, 'c2')),
                text('done'),
            ],
            auditorChannels: [agent.on()],
        });
        const parentId = await runAuditor(engine);
        const all = await dispatched(store);

        expect(all).toHaveLength(1);

        const steps = await toolSteps(store, parentId);

        expect(steps.map((s) => s.output)).toEqual([
            { runId: all[0]!.id, deduplicated: false },
            { runId: all[0]!.id, deduplicated: false },
        ]);
        expect(all[0]!.trigger.idempotencyKey).toMatch(/^dispatch:/);
        expect(await store.effects.findOne(`dispatch-count:${parentId}:auditor:default`)).toMatchObject({ result: { count: 1 } });
    });

    it('dispatchTo refuses an invoker without agent:<target>:run', async () => {
        const invoker: Invoker = {
            id: 'u1',
            kind: 'user',
            permissions: ['agent:auditor:run'],
        };
        const { engine, store } = setup({ auditor: [turn(call(draft, 'c1')), text('done')] });
        const parentId = await runAuditor(engine, { invoker });
        const [step] = await toolSteps(store, parentId);

        expect(step?.error).toEqual({
            code: 'validation_error',
            message: 'The run\'s invoker may not run agent "reporter" (agent:reporter:run).',
        });
        expect(await dispatched(store)).toHaveLength(0);
        expect(await store.effects.findOne(`dispatch-count:${parentId}:reporter:draft`)).toBeUndefined();
    });

    it('dispatchTo passes an invoker with agent:reporter:* and keeps it unchanged', async () => {
        const invoker: Invoker = {
            id: 'u1',
            kind: 'user',
            permissions: ['agent:reporter:*'],
        };
        const { engine, store } = setup({ auditor: [turn(call(draft, 'c1')), text('done')] });

        await runAuditor(engine, { invoker });

        const [child] = await dispatched(store);

        expect(child?.agent).toBe('reporter');
        expect(child?.trigger.invoker).toEqual(invoker);
    });

    it('dispatchTo the own agent needs no agent permission', async () => {
        const invoker: Invoker = {
            id: 'u1',
            kind: 'user',
            permissions: [],
        };
        const { engine, store } = setup({
            auditor: [turn(call({ agent: 'auditor', payload: 'self' }, 'c1')), text('done')],
            auditorChannels: [agent.on()],
        });

        await runAuditor(engine, { invoker });

        expect(await dispatched(store)).toHaveLength(1);
    });

    it('a run without invoker passes', async () => {
        const { engine, store } = setup({ auditor: [turn(call(draft, 'c1')), text('done')] });
        const parentId = await runAuditor(engine);
        const [child] = await dispatched(store);

        expect(child?.trigger.invoker).toBeUndefined();
        expect(child?.parentRunId).toBe(parentId);
    });

    it('dispatchTo an unregistered agent', async () => {
        const { engine, store } = setup({ auditor: [turn(call({ agent: 'ghost', payload: 1 }, 'c1')), text('done')] });
        const parentId = await runAuditor(engine);
        const [step] = await toolSteps(store, parentId);

        expect(step?.error).toEqual({
            code: 'validation_error',
            message: 'Agent "ghost" is not registered.',
        });
        expect(await dispatched(store)).toHaveLength(0);
    });

    it('dispatchTo needs an agent name', async () => {
        const bare = defineTool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => dispatchTo(context, { payload: 1 } as unknown as DispatchToInput),
        });
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const engine = new Engine({
            store,
            clock,
            agents: [defineAgent({
                name: 'auditor',
                instructions: 'You audit.',
                model: mockModel([turn(call({}, 'c1', 'bare')), text('done')]),
                tools: { bare },
            })],
            channels: [agentChannel()],
            onError: () => {},
        });

        engines.push(engine);

        const parentId = await runAuditor(engine);
        const [step] = await toolSteps(store, parentId);

        expect(step?.error).toEqual({ code: 'validation_error', message: 'dispatchTo() needs an agent name.' });
    });
});
