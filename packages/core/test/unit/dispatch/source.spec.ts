/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { ToolSet } from 'ai';
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
    defineModelAgent,
    defineTool,
    dispatch,
    dispatchTools,
} from '@chamvi/core';
import type {
    ChannelMessage,
    ChannelSubscription,
    DispatchInput,
    IChannel,
    IEngine,
    IStore,
    Run,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { approvalWait } from '../../utils/approvals.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 4, 6));
const GATE = 'Approve outbound execution from an untrusted run?';

const call = (toolName: string, input: unknown): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

function isChild(options: LanguageModelV4CallOptions): boolean {
    const first = options.prompt.find((m) => m.role === 'user');

    if (!first || typeof first.content === 'string') {
        return false;
    }

    return first.content.some((part) => part.type === 'text' && part.text.includes('"channel": "agent"'));
}

function routedModel(parent: MockResponse[], child: MockResponse[]) {
    const parentModel = mockModel(parent);
    const childModel = mockModel(child);

    return new MockLanguageModelV4({ doStream: (options) => (isChild(options) ? childModel : parentModel).doStream(options) });
}

/** An untrusted channel with out, standing in for GitHub: runs it starts are tainted. */
function recorder() {
    const sent: Array<{ message: ChannelMessage; address: string }> = [];
    const channel: IChannel = {
        name: 'gh',
        untrusted: true,
        async out(message, address) {
            sent.push({ message, address });
        },
    };

    return { channel, sent };
}

/** The child's tool: comments on, then asks on, the pull request `number` of o/r. */
const ask = defineTool({
    inputSchema: z.object({ number: z.number() }),
    execute: async ({ number }, { context }) => {
        const channel = context.channels.findOneOrFail('gh');
        const address = `o/r#${number}`;

        await channel.emit({ body: 'CI failed.' }, address);

        const decision = await channel.approve({ title: 'Retry?', address });

        return decision.approved ? 'retry' : 'keep';
    },
});

/** The parent's tool: the code picks the child's source (as a sweep would from the GitHub API), never the model. */
function handoff(source: DispatchInput['source']) {
    return defineTool({
        inputSchema: z.object({ number: z.number() }),
        execute: async ({ number }, { context }) => dispatch(context, {
            role: 'pr',
            payload: { number },
            ...(source !== undefined ? { source } : {}),
        }),
    });
}

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

type Setup = {
    parent: MockResponse[];
    child?: MockResponse[];
    tools: ToolSet;
    role?: ChannelSubscription<any>;
    store?: IStore;
};

function setup(options: Setup) {
    const clock = new ControllableClock(START);
    const store = options.store ?? createMemoryStore({ clock });
    const gh = recorder();
    const errors: unknown[] = [];
    const engine = new Engine({
        store,
        clock,
        agents: [defineModelAgent({
            name: 'maintainer',
            instructions: 'You maintain.',
            model: routedModel(options.parent, options.child ?? []),
            channels: [options.role ?? agent.on({ role: 'pr' })],
            tools: { ...options.tools, ask },
        })],
        channels: [agentChannel(), gh.channel],
        onError: (error) => {
            errors.push(error);
        },
    });

    engines.push(engine);

    return {
        engine,
        store,
        gh,
        errors,
    };
}

async function startParent(engine: IEngine): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'maintainer',
        trigger: 'sweep',
        channel: 'gh',
        address: 'o/r#1',
        payload: {},
    });

    await engine.idle();

    return runId;
}

async function childOf(store: IStore, parentId: string): Promise<Run | undefined> {
    const { data } = await store.runs.find({ parentRunId: parentId });

    return data[0];
}

const SOURCE = { channel: 'gh', address: 'o/r#12' };

describe('dispatch({ source })', () => {
    it('lets a tainted child emit and ask on its source without the gate', async () => {
        const {
            engine, 
            store, 
            gh, 
        } = setup({
            parent: [turn(call('handoff', { number: 12 })), text('done')],
            child: [turn(call('ask', { number: 12 })), text('asked')],
            tools: { handoff: handoff(SOURCE) },
        });
        const parentId = await startParent(engine);
        const child = await childOf(store, parentId);

        expect(child?.trigger.parent?.source).toEqual(SOURCE);
        expect(child?.trigger.channel).toBe('agent');
        expect(child?.taint?.source).toBe('channel:gh');
        expect(child?.status).toBe('waiting');
        expect(approvalWait(child)).toMatchObject({
            title: 'Retry?',
            channel: 'gh',
            address: 'o/r#12',
        });
        expect(gh.sent.map((s) => [s.address, s.message.kind])).toEqual([
            ['o/r#12', 'message'],
            ['o/r#12', 'approval'],
        ]);
    });

    it('still gates any other address of that channel', async () => {
        const {
            engine, 
            store, 
            gh, 
        } = setup({
            parent: [turn(call('handoff', { number: 13 })), text('done')],
            child: [turn(call('ask', { number: 13 })), text('asked')],
            tools: { handoff: handoff(SOURCE) },
        });
        const child = await childOf(store, await startParent(engine));

        expect(child?.status).toBe('waiting');
        expect(approvalWait(child)?.title).toBe(GATE);
        expect(JSON.parse(approvalWait(child)!.body!)).toMatchObject({ tool: 'channel.emit', input: { channel: 'gh', address: 'o/r#13' } });
        expect(gh.sent.filter((s) => s.address === 'o/r#13')).toHaveLength(0);
    });

    it('still gates the address on another channel', async () => {
        const { engine, store } = setup({
            parent: [turn(call('handoff', { number: 12 })), text('done')],
            child: [turn(call('ask', { number: 12 })), text('asked')],
            tools: { handoff: handoff({ channel: 'agent', address: 'o/r#12' }) },
        });
        const child = await childOf(store, await startParent(engine));

        expect(child?.trigger.parent?.source).toEqual({ channel: 'agent', address: 'o/r#12' });
        expect(approvalWait(child)?.title).toBe(GATE);
    });

    it('leaves a child without source as it was: gated', async () => {
        const {
            engine, 
            store, 
            gh, 
        } = setup({
            parent: [turn(call('handoff', { number: 12 })), text('done')],
            child: [turn(call('ask', { number: 12 })), text('asked')],
            tools: { handoff: handoff(undefined) },
        });
        const child = await childOf(store, await startParent(engine));

        expect(child?.trigger.parent).toBeDefined();
        expect(child?.trigger.parent).not.toHaveProperty('source');
        expect(approvalWait(child)?.title).toBe(GATE);
        expect(gh.sent).toHaveLength(0);
    });

    it('keeps the rule when the child resumes on a new engine', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        const first = setup({
            parent: [turn(call('handoff', { number: 12 })), text('done')],
            child: [turn(call('ask', { number: 12 })), text('asked')],
            tools: { handoff: handoff(SOURCE) },
            store,
        });
        const parentId = await startParent(first.engine);
        const waiting = await childOf(store, parentId);

        expect(approvalWait(waiting)?.title).toBe('Retry?');
        first.engine.stop();

        // the replayed tool call runs emit and approve again: the emit's gate check happens before its recorded effect
        const second = setup({
            parent: [],
            child: [text('asked')],
            tools: { handoff: handoff(SOURCE) },
            store,
        });

        await second.engine.start();
        await second.engine.approve(waiting!.id, { approvalId: approvalWait(waiting)!.id, approved: true });
        await second.engine.idle();

        const done = await store.runs.findOne(waiting!.id);

        expect(done?.status).toBe('completed');
        expect(done?.trigger.parent?.source).toEqual(SOURCE);
        expect(second.gh.sent).toHaveLength(0);
        expect(second.errors).toEqual([]);
    });

    it.each([
        ['not an object', 'gh:o/r#12'],
        ['an unknown channel', { channel: 'slack', address: 'o/r#12' }],
        ['no channel', { address: 'o/r#12' }],
        ['an empty address', { channel: 'gh', address: '' }],
        ['an address with NUL', { channel: 'gh', address: 'o/r#12\0' }],
        ['an address over 255 characters', { channel: 'gh', address: 'x'.repeat(256) }],
        ['another key', { ...SOURCE, extra: true }],
    ])('refuses a source that is %s', async (_, source) => {
        const { engine, store } = setup({
            parent: [turn(call('handoff', { number: 12 })), text('done')],
            tools: { handoff: handoff(source as DispatchInput['source']) },
        });
        const parentId = await startParent(engine);
        const [step] = (await store.steps.find(parentId)).filter((s) => s.kind === 'tool');

        expect(await childOf(store, parentId)).toBeUndefined();
        expect(JSON.stringify(step?.error ?? step?.output)).toMatch(/dispatch source/);
    });

    it('is no input a generated dispatch tool passes on', async () => {
        const { engine, store } = setup({
            parent: [turn(call('dispatch_pr', { payload: { number: 12 }, source: SOURCE })), text('done')],
            child: [turn(call('ask', { number: 12 })), text('asked')],
            tools: dispatchTools({ roles: ['pr'] }),
        });
        const child = await childOf(store, await startParent(engine));

        expect(child?.trigger.payload).toEqual({ number: 12 });
        expect(child?.trigger.parent).not.toHaveProperty('source');
        expect(approvalWait(child)?.title).toBe(GATE);
    });

    it('is no input a generated dispatch tool takes from a role schema either', async () => {
        const { engine, store } = setup({
            parent: [turn(call('dispatch_pr', { number: 12, source: SOURCE })), text('done')],
            child: [turn(call('ask', { number: 12 })), text('asked')],
            role: agent.on({ role: 'pr', schema: z.looseObject({ number: z.number() }) }),
            tools: dispatchTools({ roles: ['pr'] }),
        });
        const child = await childOf(store, await startParent(engine));

        // the model's `source` is payload data, never the child's source
        expect(child?.trigger.payload).toEqual({ number: 12, source: SOURCE });
        expect(child?.trigger.parent).not.toHaveProperty('source');
        expect(approvalWait(child)?.title).toBe(GATE);
    });

    it('cannot be forged through engine.dispatch()', async () => {
        const { engine, store } = setup({ parent: [text('done')], tools: {} });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'maintainer',
            trigger: 'pr',
            channel: 'agent',
            payload: {},
            parent: {
                kind: 'dispatch',
                runId: 'x',
                agent: 'maintainer',
                role: 'pr',
                depth: 1,
                source: SOURCE,
            },
        } as Parameters<IEngine['dispatch']>[0]);

        expect((await store.runs.findOne(runId))?.trigger.parent).toBeUndefined();
    });
});
