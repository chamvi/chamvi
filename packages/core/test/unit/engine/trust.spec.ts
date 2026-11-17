/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
    defineEffectTool,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type { AgentDefinition, Engine, IChannel } from '@chamvi/core';
import { approvalWait } from '../../utils/approvals.ts';
import { mockModel } from '../../utils/mock-model.ts';
import { fakeSkillRuntime } from '../../utils/skill-runtime.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';

const engines: Engine[] = [];

afterEach(() => engines.splice(0).forEach((engine) => engine.stop()));

const call = (toolName: string, input = {}) => ({
    parts: [{
        type: 'tool-call' as const,
        toolName,
        toolCallId: toolName,
        input,
    }],
});
const done = { parts: [{ type: 'text' as const, text: 'done' }] };

it('rejects invalid trust policies rather than silently allowing outbound calls', () => {
    expect(() => defineModelAgent({
        name: 'test',
        instructions: 'test',
        trust: { onTainted: 'allow' as never },
    })).toThrow('trust.onTainted');
    expect(() => defineModelAgent({
        name: 'test',
        instructions: 'test',
        tools: {},
        trust: { tools: { missing: { guardWhenTainted: true } } },
    })).toThrow('missing');
});

it.each([undefined, {}])('rejects unknown trust names without dynamic tools (%j)', (tools) => {
    expect(() => defineModelAgent({
        name: 'test',
        instructions: 'test',
        tools,
        skills: [],
        trust: { tools: { missing: { guardWhenTainted: true } } },
    })).toThrow('missing');
});

it.each(['state', 'skill', 'factory'] as const)('defers %s tool names but always validates trust flags', (source) => {
    const definition: AgentDefinition = {
        name: 'test',
        instructions: 'test',
        tools: {},
        ...(source === 'state' ? { state: { items: z.object({ title: z.string() }) } } : {}),
        ...(source === 'skill' ? { skills: [fakeSkillRuntime().input] } : {}),
        ...(source === 'factory' ? { tools: () => ({}) } : {}),
    };

    expect(() => defineModelAgent({
        ...definition,
        trust: { tools: { deferred: { guardWhenTainted: true, taint: false } } },
    })).not.toThrow();
    expect(() => defineModelAgent({
        ...definition,
        trust: { onTainted: 'allow' as never },
    })).toThrow('trust.onTainted');

    for (const flags of [{ guardWhenTainted: 'true' }, { taint: () => true }, { unknown: true }]) {
        expect(() => defineModelAgent({
            ...definition,
            trust: { tools: { deferred: flags as never } },
        })).toThrow('deferred');
    }
});

it.each(['state', 'skill'] as const)('classifies assembled %s tools and rejects unknown names before model work', async (source) => {
    const toolName = source === 'state' ? 'state_items_list' : 'contributed';
    const skill = fakeSkillRuntime({
        contribution: {
            instructions: '',
            tools: {
                contributed: defineTool({
                    inputSchema: z.object({}),
                    execute: async () => 'skill content',
                }),
            },
            checkTools: () => {},
        },
    });
    const definition: AgentDefinition = {
        name: 'test',
        instructions: 'test',
        tools: {},
        ...(source === 'state' ?
            { state: { items: z.object({ title: z.string() }) } } :
            { skills: [skill.input] }),
    };
    const store = createTestServices();
    const agent = defineModelAgent({
        ...definition,
        model: mockModel([call(toolName), done]),
        trust: { tools: { [toolName]: { taint: true } } },
    });
    const engine = createTestEngine({ services: store, agents: [agent] });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'test',
        channel: 'test',
        trigger: 'test',
        payload: {},
    });

    await engine.idle();

    const run = await store.runService.findOne(runId);

    expect(run?.status).toBe('completed');
    expect(run?.taint).toEqual({ at: expect.any(Date), source: `tool:${toolName}` });

    const invalidModel = mockModel([done]);
    const invalidStore = createTestServices();
    const invalidEngine = createTestEngine({
        services: invalidStore,
        agents: [defineModelAgent({
            ...definition,
            model: invalidModel,
            trust: { tools: { missing: { guardWhenTainted: true } } },
        })],
    });

    engines.push(invalidEngine);
    await invalidEngine.start();

    const { runId: invalidRunId } = await invalidEngine.dispatch({
        agent: 'test',
        channel: 'test',
        trigger: 'test',
        payload: {},
    });

    await invalidEngine.idle();

    const invalidRun = await invalidStore.runService.findOne(invalidRunId);

    expect(invalidRun?.status).toBe('failed');
    expect(invalidRun?.error?.message).toContain('missing');
    expect(invalidModel.doStreamCalls).toHaveLength(0);
});

it('persists untrusted result taint and denies subsequent outbound effects', async () => {
    let writes = 0;
    const store = createTestServices();
    const agent = defineModelAgent({
        name: 'test',
        instructions: 'test',
        trust: { onTainted: 'deny' },
        model: mockModel([call('read'), call('send'), done]),
        tools: {
            read: defineTool({
                inputSchema: z.object({}),
                trust: { taint: true },
                execute: async () => 'external text',
            }),
            send: defineEffectTool({
                inputSchema: z.object({}),
                trust: { guardWhenTainted: true },
                execute: async () => {
                    writes++;

                    return 'sent';
                },
            }),
        },
    });
    const engine = createTestEngine({ services: store, agents: [agent] });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'test',
        channel: 'http',
        trigger: 'test',
        payload: {},
    });

    await engine.idle();

    const run = await store.runService.findOne(runId);

    expect(run?.taint).toEqual({ at: expect.any(Date), source: 'tool:read' });
    expect(writes).toBe(0);
    expect(run?.status).toBe('completed');
});

it('binds automatic approval to final input and keeps arguments out of channel notifications', async () => {
    let writes = 0;
    const notifications: unknown[] = [];
    const source: IChannel = {
        name: 'source',
        untrusted: true,
        out: async (message) => {
            notifications.push(message);
        },
    };
    const store = createTestServices();
    const engine = createTestEngine({
        services: store,
        channels: [source],
        agents: [defineModelAgent({
            name: 'test',
            instructions: 'test',
            model: mockModel([call('send', { text: 'secret' }), done]),
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
        })],
    });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'test',
        channel: 'source',
        address: 'public',
        trigger: 'test',
        payload: {},
    });

    await engine.idle();

    const waiting = await store.runService.findOne(runId);

    expect(waiting?.status).toBe('waiting');
    expect(approvalWait(waiting)?.body).toContain('secret');
    expect(JSON.stringify(notifications)).not.toContain('secret');
    expect(writes).toBe(0);
    await engine.approve(runId, { approvalId: approvalWait(waiting)!.approvalId, approved: true });
    await engine.idle();
    expect(writes).toBe(1);
    expect((await store.runService.findOne(runId))?.taint?.source).toBe('channel:source');
});

it.each(['plain', 'effect', 'reconciliation', 'stream'] as const)('taints externally controlled %s reader errors before the model can act on them', async (kind) => {
    let writes = 0;
    const store = createTestServices();
    const fail = async (): Promise<string> => {
        throw new Error('external error instructions');
    };
    const definition = {
        inputSchema: z.object({}),
        trust: { taint: true },
        execute: fail,
    };
    let reader;

    if (kind === 'plain') {
        reader = defineTool(definition);
    } else if (kind === 'stream') {
        reader = defineTool<Record<string, never>, string>({
            ...definition,
            async *execute () {
                yield* [];

                throw new Error('external error instructions');
            },
        });
    } else {
        reader = defineEffectTool({
            ...definition,
            ...(kind === 'reconciliation' ? { alreadyApplied: fail } : {}),
        });
    }

    const engine = createTestEngine({
        services: store,
        agents: [defineModelAgent({
            name: 'test',
            instructions: 'test',
            trust: { onTainted: 'deny' },
            model: mockModel([call('read'), call('send'), done]),
            tools: {
                read: reader,
                send: defineEffectTool({
                    inputSchema: z.object({}),
                    trust: { guardWhenTainted: true },
                    execute: async () => {
                        writes++;

                        return 'sent';
                    },
                }),
            },
        })],
    });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'test',
        channel: 'http',
        trigger: 'test',
        payload: {},
    });

    await engine.idle();
    expect((await store.runService.findOne(runId))?.taint?.source).toBe('tool:read');
    expect(writes).toBe(0);
});

it('does not expose content or checkpoint it when persisting taint fails', async () => {
    const store = createTestServices();
    const update = store.runService.update.bind(store.runService);

    store.runService.update = async (id, patch, options) => {
        if (patch.taint) {
            throw new Error('taint storage unavailable');
        }

        return update(id, patch, options);
    };

    const model = mockModel([call('read'), done]);
    const engine = createTestEngine({
        services: store,
        agents: [defineModelAgent({
            name: 'test',
            instructions: 'test',
            model,
            tools: {
                read: defineTool({
                    inputSchema: z.object({}),
                    trust: { taint: true },
                    execute: async () => 'sensitive external content',
                }),
            },
        })],
    });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'test',
        channel: 'http',
        trigger: 'test',
        payload: {},
    });

    await engine.idle();
    expect((await store.runService.findOne(runId))?.status).toBe('failed');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(await store.checkpointService.findOne(runId)).toBeUndefined();
});

it('rechecks approval after a hook changes the final input on resume', async () => {
    let argument = 'first';
    let writes = 0;
    const store = createTestServices();
    const engine = createTestEngine({
        services: store,
        channels: [{ name: 'source', untrusted: true }],
        agents: [defineModelAgent({
            name: 'test',
            instructions: 'test',
            model: mockModel([call('send', { text: 'original' }), done]),
            hooks: { beforeToolExecution: () => ({ text: argument }) },
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
        })],
    });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'test',
        channel: 'source',
        trigger: 'test',
        payload: {},
    });

    await engine.idle();

    const first = approvalWait(await store.runService.findOne(runId))!;

    argument = 'changed';
    await engine.approve(runId, { approvalId: first.approvalId, approved: true });
    await engine.idle();

    const next = approvalWait(await store.runService.findOne(runId))!;

    expect(next.approvalId).not.toBe(first.approvalId);
    expect(next.body).toContain('changed');
    expect(writes).toBe(0);
});

it('gates direct channel emits to model-selected destinations but permits source replies', async () => {
    const sent: string[] = [];
    const source: IChannel = {
        name: 'source',
        untrusted: true,
        out: async (_message, address) => {
            sent.push(address);
        },
    };
    const store = createTestServices();
    const engine = createTestEngine({
        services: store,
        channels: [source],
        agents: [defineModelAgent({
            name: 'test',
            instructions: 'test',
            trust: { onTainted: 'deny' },
            model: mockModel([call('reply'), call('forward'), done]),
            tools: {
                reply: defineTool({ inputSchema: z.object({}), execute: async (_, { context }) => context.channels.findOneOrFail().emit({ body: 'reply' }) }),
                forward: defineTool({ inputSchema: z.object({}), execute: async (_, { context }) => context.channels.findOneOrFail().emit({ body: 'secret' }, 'elsewhere') }),
            },
        })],
    });

    engines.push(engine);
    await engine.start();
    await engine.dispatch({
        agent: 'test',
        channel: 'source',
        address: 'origin',
        trigger: 'test',
        payload: {},
    });
    await engine.idle();
    expect(sent).toEqual(['origin']);
});
