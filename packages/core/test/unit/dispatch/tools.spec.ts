/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolExecutionOptions } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    agent,
    agentChannel,
    defineAgent,
    defineTool,
    dispatchTools,
} from '@chamvi/core';
import type {
    ChannelSubscription,
    IEngine,
    IStore,
    Run,
    ToolContext,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { treeModel } from '../../utils/dispatch.ts';
import type { ChildTurn, ParentTurn } from '../../utils/dispatch.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (toolName: string, input: unknown, toolCallId = 'c1'): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const done = () => Array.from({ length: 10 }, () => text('done'));
const answer: ChildTurn = () => text('done');

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

const prRole = () => agent.on({
    role: 'pr',
    schema: z.object({ pr: z.string() }),
    address: (p) => p.pr,
});

function lead(options: {
    parent: ParentTurn[];
    child?: ChildTurn;
    channels?: ChannelSubscription<any>[];
    tools?: ReturnType<typeof dispatchTools>;
}) {
    return defineAgent({
        name: 'lead',
        instructions: 'You lead.',
        model: treeModel([...options.parent, ...done()], options.child ?? answer),
        channels: options.channels ?? [prRole()],
        tools: options.tools ?? { ...dispatchTools({ roles: ['pr'] }) },
    });
}

function setup(agents: ReturnType<typeof defineAgent>[], store?: IStore) {
    const clock = new ControllableClock(START);
    const engine = new Engine({
        store: store ?? createMemoryStore({ clock }),
        clock,
        agents,
        channels: [agentChannel()],
        onError: () => {},
    });

    engines.push(engine);

    return engine;
}

async function startParent(engine: IEngine, agentName = 'lead'): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: agentName,
        trigger: 'test',
        channel: 'test',
        payload: {},
    });

    await engine.idle();

    return runId;
}

async function children(store: IStore, parentId: string): Promise<Run[]> {
    const { data } = await store.runs.find({ parentRunId: parentId });

    return data;
}

async function toolSteps(store: IStore, runId: string) {
    return (await store.steps.find(runId)).filter((step) => step.kind === 'tool');
}

function errorOf(step: { error?: unknown } | undefined) {
    return step?.error as { code?: string; message?: string } | undefined;
}

describe('dispatchTools()', () => {
    it('gives an agent a working dispatch_<role> tool', async () => {
        const engine = setup([lead({ parent: [turn(call('dispatch_pr', { pr: 'o/r#1' })), text('done')] })]);
        const parentId = await startParent(engine);
        const [child, ...rest] = await children(engine.store, parentId);

        expect(rest).toHaveLength(0);
        expect(child?.parentRunId).toBe(parentId);
        expect(child?.address).toBe('o/r#1');
        expect(child?.trigger.trigger).toBe('pr');
        expect(child?.trigger.payload).toEqual({ pr: 'o/r#1' });

        const [step] = await toolSteps(engine.store, parentId);

        expect(step?.output).toEqual({ runId: child!.id, deduplicated: false });
        expect((await engine.store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('with wait returns how the child ended', async () => {
        const engine = setup([lead({
            parent: [turn(call('dispatch_pr', { pr: 'o/r#1' })), text('done')],
            tools: { ...dispatchTools({ roles: ['pr'], wait: true }) },
        })]);
        const parentId = await startParent(engine);

        await engine.idle();

        const kids = await children(engine.store, parentId);

        expect(kids).toHaveLength(1);

        const [step] = await toolSteps(engine.store, parentId);

        expect(step?.output).toEqual({
            runId: kids[0]!.id,
            agent: 'lead',
            role: 'pr',
            status: 'completed',
            output: 'done',
        });
        expect((await engine.store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('describes the role, and the wait', async () => {
        const described = [
            agent.on({ role: 'pr', description: 'Reviews one pull request.' }),
            agent.on({ role: 'issue' }),
        ];
        const seen: Record<string, string | undefined>[] = [];
        const engine = setup([lead({
            parent: [(options) => {
                seen.push(Object.fromEntries((options.tools ?? []).map((t) => [t.name, 'description' in t ? t.description : undefined])));

                return text('done');
            }],
            channels: described,
            tools: { ...dispatchTools({ roles: ['pr', 'issue'], wait: true }) },
        })]);

        await startParent(engine);

        expect(seen[0]).toEqual({
            dispatch_pr: 'Reviews one pull request.',
            dispatch_issue: 'Starts a run of agent "lead" role "issue", then waits for it and returns how it ended.',
        });
    });

    it('dispatches to another agent listing the caller in from', async () => {
        const reporter = defineAgent({
            name: 'reporter',
            instructions: 'You report.',
            model: treeModel(done(), () => text('drafted')),
            channels: [agent.on({ role: 'draft', from: ['lead'] })],
        });
        const engine = setup([lead({
            parent: [turn(call('dispatch_reporter_draft', { payload: 'x' })), text('done')],
            tools: { ...dispatchTools({ agents: [{ agent: 'reporter', roles: ['draft'] }] }) },
        }), reporter]);
        const parentId = await startParent(engine);
        const [child] = await children(engine.store, parentId);

        expect(child?.agent).toBe('reporter');
        expect(child?.trigger.payload).toBe('x');
    });

    it('a target role without from is a tool error', async () => {
        const reporter = defineAgent({
            name: 'reporter',
            instructions: 'You report.',
            model: treeModel(done(), () => text('drafted')),
            channels: [agent.on({ role: 'draft' })],
        });
        const engine = setup([lead({
            parent: [turn(call('dispatch_reporter_draft', { payload: 'x' })), text('done')],
            tools: { ...dispatchTools({ agents: [{ agent: 'reporter', roles: ['draft'] }] }) },
        }), reporter]);
        const parentId = await startParent(engine);
        const [step] = await toolSteps(engine.store, parentId);

        expect(await children(engine.store, parentId)).toHaveLength(0);
        expect(errorOf(step)?.message).toContain('accepts no dispatches');
    });

    it('an unregistered target is a tool error', async () => {
        const engine = setup([lead({
            parent: [turn(call('dispatch_ghost_draft', { payload: 'x' })), text('done')],
            tools: { ...dispatchTools({ agents: [{ agent: 'ghost', roles: ['draft'] }] }) },
        })]);
        const parentId = await startParent(engine);
        const [step] = await toolSteps(engine.store, parentId);

        expect(errorOf(step)?.code).toBe('validation_error');
        expect((await engine.store.runs.findOne(parentId))?.status).toBe('completed');
    });

    it('parses a transforming role schema exactly once', async () => {
        const engine = setup([lead({
            parent: [turn(call('dispatch_pr', { n: '7' })), text('done')],
            channels: [agent.on({ role: 'pr', schema: z.object({ n: z.string().transform(Number) }) })],
        })]);
        const parentId = await startParent(engine);
        const [child] = await children(engine.store, parentId);

        expect(child?.trigger.payload).toEqual({ n: 7 });
    });

    it('wraps a non-object role schema as payload', async () => {
        const engine = setup([lead({
            parent: [turn(call('dispatch_pr', { payload: 'o/r#2' })), text('done')],
            channels: [agent.on({ role: 'pr', schema: z.string() })],
        })]);
        const parentId = await startParent(engine);
        const [child] = await children(engine.store, parentId);

        expect(child?.trigger.payload).toBe('o/r#2');
    });

    it('binds the role schema of a replaced agent', async () => {
        const engine = setup([lead({ parent: [] })]);

        await engine.start();
        await engine.putAgent(lead({
            parent: [
                turn(call('dispatch_pr', { pr: 'x' })),
                turn(call('dispatch_pr', { pr: 3 }, 'c2')),
                text('done'),
            ],
            channels: [agent.on({ role: 'pr', schema: z.object({ pr: z.number() }) })],
        }));

        const parentId = await startParent(engine);
        const steps = await toolSteps(engine.store, parentId);
        const kids = await children(engine.store, parentId);

        expect(steps).toHaveLength(2);
        expect(errorOf(steps[0])?.message).toContain('Invalid input for tool dispatch_pr');
        expect(kids).toHaveLength(1);
        expect(kids[0]?.trigger.payload).toEqual({ pr: 3 });
    });

    it('binds the placeholders a tools factory returns', async () => {
        const engine = setup([defineAgent({
            name: 'lead',
            instructions: 'You lead.',
            model: treeModel([turn(call('dispatch_pr', { pr: 'o/r#3' })), ...done()], answer),
            channels: [prRole()],
            tools: () => ({ ...dispatchTools({ roles: ['pr'] }) }),
        })]);
        const parentId = await startParent(engine);
        const [child] = await children(engine.store, parentId);

        expect(child?.address).toBe('o/r#3');
    });

    it('refuses misconfiguration', () => {
        expect(() => dispatchTools({})).toThrow(InvalidAgentDefinitionError);
        expect(() => dispatchTools({ roles: [] })).toThrow(InvalidAgentDefinitionError);
        expect(() => dispatchTools({ roles: ['a'.repeat(60)] })).toThrow(InvalidAgentDefinitionError);
        expect(() => dispatchTools({ roles: ['Bad_Role'] })).toThrow(InvalidAgentDefinitionError);
        expect(() => dispatchTools({ agents: [{ agent: 'Nope!', roles: ['x'] }] })).toThrow(InvalidAgentDefinitionError);
        expect(() => dispatchTools({ roles: ['pr', 'pr'] })).toThrow(InvalidAgentDefinitionError);
        expect(() => dispatchTools({ roles: ['pr'], wait: 'yes' as never })).toThrow(InvalidAgentDefinitionError);
        expect(() => defineAgent({
            name: 'lead',
            instructions: 'You lead.',
            channels: [prRole()],
            tools: { ...dispatchTools({ roles: ['nope'] }) },
        })).toThrow('Agent "lead" has no dispatch role "nope" for tool "dispatch_nope".');
    });

    it('an unbound placeholder throws InvalidRunStateError', async () => {
        const tool = dispatchTools({ roles: ['pr'] }).dispatch_pr!;

        await expect(tool.execute!({ pr: 'x' }, {
            toolCallId: 't', 
            messages: [], 
            context: {} as ToolContext, 
        } as ToolExecutionOptions<any>))
            .rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('a placeholder colliding with a state tool is refused at binding', async () => {
        const placeholder = dispatchTools({ roles: ['pr'] }).dispatch_pr!;
        const engine = setup([defineAgent({
            name: 'lead',
            instructions: 'You lead.',
            model: treeModel(done(), answer),
            channels: [prRole()],
            state: { notes: z.object({ text: z.string() }) },
            tools: () => ({ state_notes_list: placeholder, other: defineTool({ inputSchema: z.object({}), execute: async () => 'x' }) }),
        })]);
        const parentId = await startParent(engine);
        const run = await engine.store.runs.findOne(parentId);

        expect(run?.status).toBe('failed');
        expect(run?.error).toEqual({
            code: 'invalid_agent_definition',
            message: 'Agent "lead": dispatch tool "state_notes_list" collides with another tool of that name.',
        });
    });
});
