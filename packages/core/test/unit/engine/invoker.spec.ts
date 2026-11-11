/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    Engine,
    ValidationError,
    defineModelAgent,
    requireToolPermission,
} from '@chamvi/core';
import type {
    AgentDefinition,
    IEngine,
    Invoker,
    RunContext,
} from '@chamvi/core';
import { Permission, allPermissions } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
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
    permissions: [{
        permission: { name: Permission.TOOL_USE },
        policies: [{ type: 'attributes', query: { agent: 'release', name: { $in: ['deploy', 'state_notes_list'] } } } as never],
    }],
};

const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });
const callTool = (toolName: string, input: unknown = {}): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName,
        input,
    }],
});

type Setup = {
    model: LanguageModel;
    tools?: AgentDefinition['tools'];
    state?: AgentDefinition['state'];
    toolPolicy?: AgentDefinition['toolPolicy'];
    hooks?: AgentDefinition['hooks'];
    now?: Date;
};

function setup(s: Setup) {
    const clock = new ControllableClock(s.now ?? new Date(1_000_000));
    const store = createMemoryStore({ clock });
    const agent = defineModelAgent({
        name: 'release',
        instructions: 'You release.',
        model: s.model,
        tools: s.tools,
        state: s.state,
        toolPolicy: s.toolPolicy,
        hooks: s.hooks,
    });
    const errors: unknown[] = [];
    const engine = new Engine({
        store,
        agents: [agent],
        clock,
        claimTtlMs: 30,
        onError: (error) => {
            errors.push(error);
        },
    });

    engines.push(engine);

    const notifier = recordApprovals(engine);

    return {
        clock,
        store,
        engine,
        errors,
        notifier,
    };
}

const env = (invoker?: unknown, idempotencyKey?: string) => ({
    agent: 'release',
    trigger: 'http',
    channel: 'http' as const,
    payload: {},
    idempotencyKey,
    invoker: invoker as Invoker,
});

const toolNames = (model: ReturnType<typeof mockModel>, i: number) => (model.doStreamCalls[i]?.tools ?? [])
    .map((t) => t.name)
    .sort();

describe('invoker', () => {
    it('stores a copy of the invoker on the run', async () => {
        const { engine, store } = setup({ model: mockModel([]) });
        const invoker = structuredClone(alice) as Invoker & { permissions: PermissionBinding[] };
        const { runId } = await engine.dispatch(env(invoker));

        invoker.permissions.push({ permission: { name: Permission.AGENT_RUN } });
        invoker.permissions[0]!.policies!.length = 0;
        invoker.name = 'Mallory';

        const run = await store.runs.findOne(runId);

        expect(run?.trigger.invoker).toEqual(alice);
    });

    it('keeps the identity of an invoker', async () => {
        const { engine, store } = setup({ model: mockModel([]) });
        const identity = {
            type: 'user' as const,
            id: '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d',
            realmId: null,
        };
        const { runId } = await engine.dispatch(env({ ...alice, identity }));

        expect((await store.runs.findOne(runId))?.trigger.invoker).toEqual({ ...alice, identity });
    });

    it('keeps only the invoker fields', async () => {
        const { engine, store } = setup({ model: mockModel([]) });
        const { runId } = await engine.dispatch(env({ ...alice, token: 'secret-bearer' }));

        expect((await store.runs.findOne(runId))?.trigger.invoker).toEqual(alice);
    });

    it.each([
        ['not an object', 'alice'],
        ['an array', []],
        ['an empty id', { ...alice, id: '' }],
        ['a missing kind', { id: 'x', permissions: [] }],
        ['an empty kind', { ...alice, kind: '' }],
        ['permissions not an array', { ...alice, permissions: 'tool:release:deploy' }],
        ['an old string permission', { ...alice, permissions: ['tool:release:deploy'] }],
        ['the old all grant', { ...alice, permissions: ['*'] }],
        ['a binding without a name', { ...alice, permissions: [{ permission: {} }] }],
        ['a policy without a type', { ...alice, permissions: [{ permission: { name: 'x' }, policies: [{}] }] }],
        ['an identity of an unknown type', { ...alice, identity: { type: 'robot', id: 'x' } }],
        ['an identity without an id', { ...alice, identity: { type: 'user', id: '' } }],
        ['a non-string name', { ...alice, name: 42 }],
    ])('rejects %s before any write', async (_label, invoker) => {
        const { engine, store } = setup({ model: mockModel([]) });

        await expect(engine.dispatch(env(invoker, 'key-1'))).rejects.toBeInstanceOf(ValidationError);
        expect((await store.runs.find({})).data).toHaveLength(0);

        // the idempotency key was not claimed either
        const { runId, deduplicated } = await engine.dispatch(env(alice, 'key-1'));

        expect(deduplicated).toBe(false);
        expect((await store.runs.findOne(runId))?.trigger.invoker).toEqual(alice);
    });

    it('dedupes a key per invoker: the same invoker gets the first run', async () => {
        const { engine, store } = setup({ model: mockModel([]) });
        const first = await engine.dispatch(env(alice, 'same'));
        const second = await engine.dispatch(env({ ...alice, permissions: [] }, 'same'));

        expect(second).toEqual({ runId: first.runId, deduplicated: true });
        expect((await store.runs.findOne(first.runId))?.trigger.invoker).toEqual(alice);
    });

    it('gives two invokers with the same key a run each', async () => {
        const { engine, store } = setup({ model: mockModel([]) });
        const first = await engine.dispatch(env(alice, 'same'));
        const bob: Invoker = {
            id: 'u-bob',
            kind: 'user',
            permissions: allPermissions(),
        };
        const second = await engine.dispatch(env(bob, 'same'));

        expect(second.deduplicated).toBe(false);
        expect(second.runId).not.toBe(first.runId);
        expect((await store.runs.findOne(first.runId))?.trigger.invoker).toEqual(alice);
        expect((await store.runs.findOne(second.runId))?.trigger.invoker).toEqual(bob);
    });

    it('keeps an invoker id apart from another kind and from a run without an invoker', async () => {
        const { engine } = setup({ model: mockModel([]) });
        const ids = [
            await engine.dispatch(env({
                id: 'a:b',
                kind: 'user',
                permissions: [],
            }, 'same')),
            await engine.dispatch(env({
                id: 'b',
                kind: 'user:a',
                permissions: [],
            }, 'same')),
            await engine.dispatch(env({
                id: 'a:b',
                kind: 'client',
                permissions: [],
            }, 'same')),
            await engine.dispatch(env(undefined, 'same')),
        ];

        expect(ids.map((r) => r.deduplicated)).toEqual([false, false, false, false]);
        expect(new Set(ids.map((r) => r.runId)).size).toBe(4);
        // without an invoker the key dedupes as before
        expect(await engine.dispatch(env(undefined, 'same'))).toEqual({ runId: ids[3]!.runId, deduplicated: true });
    });

    it('claims the key under <agent>:<source>:<kind>:<id>, each part URI-encoded', async () => {
        const { engine, store } = setup({ model: mockModel([]) });
        const scopes: string[] = [];
        const claimKey = store.idempotency.claim.bind(store.idempotency);

        store.idempotency.claim = (scope, ...rest) => {
            scopes.push(scope);

            return claimKey(scope, ...rest);
        };
        await engine.dispatch(env({
            id: 'a:b c',
            kind: 'user',
            permissions: [],
        }, 'k'));
        await engine.dispatch(env(undefined, 'k'));
        expect(scopes).toEqual(['release:http:user:a%3Ab%20c', 'release:http']);
    });

    it('hands the invoker to the tool factory and the agent hooks', async () => {
        const seen: Array<Invoker | undefined> = [];
        const model = mockModel([callTool('deploy'), text('done')]);
        const { engine, store } = setup({
            model,
            tools: ({ run }) => {
                seen.push(run.trigger.invoker);

                return {
                    deploy: tool({
                        inputSchema: z.object({}),
                        execute: async () => 'ok',
                    }),
                };
            },
            hooks: {
                beforeToolExecution(info, ctx) {
                    seen.push(ctx.run.trigger.invoker);

                    return info.input;
                },
            },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(seen).toEqual([alice, alice]);
    });
});

describe('tool policy', () => {
    const deploy = tool({ inputSchema: z.object({}), execute: async () => 'deployed' });
    const rollback = tool({ inputSchema: z.object({}), execute: async () => 'rolled back' });

    it('hides refused tools, state tools included, from the model', async () => {
        const model = mockModel([text('done')]);
        const { engine } = setup({
            model,
            tools: () => ({ deploy, rollback }),
            state: { notes: z.object({ text: z.string() }) },
            toolPolicy: (name) => name === 'deploy' || name === 'state_notes_list',
        });

        await engine.start();
        await engine.dispatch(env(alice));
        await engine.idle();
        expect(toolNames(model, 0)).toEqual(['deploy', 'state_notes_list']);
    });

    it('applies requireToolPermission to the invoker', async () => {
        const model = mockModel([text('done'), text('done')]);
        const { engine } = setup({
            model,
            tools: () => ({ deploy, rollback }),
            state: { notes: z.object({ text: z.string() }) },
            toolPolicy: requireToolPermission(),
        });

        await engine.start();
        await engine.dispatch(env(alice));
        await engine.idle();
        // state tools need their own grant: the upsert and remove tools stay hidden
        expect(toolNames(model, 0)).toEqual(['deploy', 'state_notes_list']);

        // a run without an invoker (cron, webhook) gets no tools by default
        await engine.dispatch(env());
        await engine.idle();
        expect(toolNames(model, 1)).toEqual([]);
    });

    it('denies a run stored with old string permissions without throwing', async () => {
        let executed = 0;
        const model = mockModel([callTool('deploy'), text('done')]);
        const {
            engine,
            errors,
            store,
        } = setup({
            model,
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        executed++;

                        return 'deployed';
                    },
                }),
            }),
            toolPolicy: requireToolPermission(),
        });

        // a run queued before the upgrade: intake refuses this shape, the store still holds it
        const { runId } = await engine.dispatch(env(alice));
        const stored = await store.runs.findOne(runId);

        await store.runs.update(runId, {
            trigger: {
                ...stored!.trigger,
                invoker: { ...alice, permissions: ['tool:release:deploy', '*', 'agent:release:run'] as never },
            },
        });

        await engine.start();
        await engine.idle();

        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(toolNames(model, 0)).toEqual([]);
        expect(executed).toBe(0);

        const step = (await store.steps.find(runId)).find((s) => s.kind === 'tool');

        expect(step).toMatchObject({ name: 'deploy', error: { code: 'tool_not_allowed' } });
        expect(errors).toEqual([]);
    });

    it('filters the offered tools with an async policy', async () => {
        const model = mockModel([text('done')]);
        const { engine } = setup({
            model,
            tools: () => ({ deploy, rollback }),
            toolPolicy: async (name) => name === 'deploy',
        });

        await engine.start();
        await engine.dispatch(env(alice));
        await engine.idle();
        expect(toolNames(model, 0)).toEqual(['deploy']);
    });

    it('records tool_not_allowed for a call to a tool an async policy refuses', async () => {
        let executed = 0;
        const model = mockModel([callTool('deploy'), text('done')]);
        const { engine, store } = setup({
            model,
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        executed++;

                        return 'deployed';
                    },
                }),
                rollback,
            }),
            toolPolicy: async (name) => name === 'rollback',
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(executed).toBe(0);

        const step = (await store.steps.find(runId)).find((s) => s.kind === 'tool');

        expect(step).toMatchObject({ name: 'deploy', error: { code: 'tool_not_allowed' } });
    });

    it('fails the run when the policy rejects', async () => {
        const model = mockModel([text('done')]);
        const { engine, store } = setup({
            model,
            tools: () => ({ deploy }),
            toolPolicy: async () => {
                throw new Error('policy store down');
            },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('failed');
        expect(model.doStreamCalls).toHaveLength(0);
    });

    it('fails the run when the policy rejects at the per-call re-check', async () => {
        let checks = 0;
        let executed = 0;
        const model = mockModel([callTool('deploy'), text('done')]);
        const { engine, store } = setup({
            model,
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        executed++;

                        return 'deployed';
                    },
                }),
            }),
            toolPolicy: async () => {
                if (checks++ > 0) {
                    throw new Error('policy store down');
                }

                return true;
            },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect(executed).toBe(0);
        expect(await store.runs.findOne(runId)).toMatchObject({ status: 'failed', error: { code: 'FatalToolError' } });
    });

    it('passes the engine clock time to the policy', async () => {
        const seen: Date[] = [];
        const model = mockModel([text('done')]);
        const now = new Date(2026, 10, 11, 10, 0);
        const { engine } = setup({
            model,
            now,
            tools: () => ({ deploy }),
            toolPolicy: (_name, ctx) => {
                seen.push(ctx.now);

                return true;
            },
        });

        await engine.start();
        await engine.dispatch(env(alice));
        await engine.idle();
        expect(seen[0]).toEqual(now);
    });

    it('re-evaluates a time policy with the engine clock when a call resumes after its approval', async () => {
        let deployed = 0;
        const model = mockModel([callTool('deploy'), text('could not deploy')]);
        const office: Invoker = {
            id: 'u-carol',
            kind: 'user',
            permissions: [{
                permission: { name: Permission.TOOL_USE },
                policies: [{
                    type: 'time', 
                    start: '09:00', 
                    end: '11:00', 
                } as never],
            }],
        };
        const {
            engine,
            store,
            clock,
            notifier,
        } = setup({
            model,
            now: new Date(2026, 10, 11, 10, 0),
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        deployed++;

                        return 'deployed';
                    },
                }),
            }),
            toolPolicy: requireToolPermission(),
            hooks: gateTool('deploy'),
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(office));

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('waiting');
        expect(toolNames(model, 0)).toEqual(['deploy']);

        // the window closes while the run waits
        clock.advance(2 * 60 * 60 * 1000);
        await engine.approve(notifier.calls[0]!.runId, { approvalId: notifier.calls[0]!.approvalId, approved: true });
        await engine.idle();

        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(deployed).toBe(0);

        const step = (await store.steps.find(runId)).find((s) => s.kind === 'tool');

        expect(step).toMatchObject({ name: 'deploy', error: { code: 'tool_not_allowed' } });
    });

    it('passes the run context to the policy', async () => {
        const contexts: RunContext[] = [];
        const model = mockModel([text('done')]);
        const { engine } = setup({
            model,
            tools: () => ({ deploy }),
            toolPolicy: (_name, { run }) => {
                contexts.push(run);

                return true;
            },
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect(contexts[0]).toMatchObject({
            runId,
            agent: 'release',
            trigger: { invoker: alice },
        });
    });

    it('re-checks at execute: a refused call is a tool error, not a failed run', async () => {
        let executed = 0;
        let checks = 0;
        const model = mockModel([callTool('deploy'), text('could not deploy')]);
        const { engine, store } = setup({
            model,
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        executed++;

                        return 'deployed';
                    },
                }),
            }),
            // offered when the tool set is assembled, refused when the call executes
            toolPolicy: () => checks++ === 0,
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toBe('could not deploy');
        expect(executed).toBe(0);

        const prompt = JSON.stringify(model.doStreamCalls[1]?.prompt);

        expect(prompt).toContain('error-text');
        expect(prompt).toContain('not allowed');
    });

    it.each([
        ['a refused tool', 'deploy', 'tool_not_allowed'],
        ['an unknown tool', 'nope', 'Error'],
    ])('records a model call to %s (%s) with code %s', async (_, toolName, code) => {
        let executed = 0;
        const model = mockModel([callTool(toolName), text('done')]);
        const { engine, store } = setup({
            model,
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        executed++;

                        return 'deployed';
                    },
                }),
                rollback: tool({
                    inputSchema: z.object({}),
                    execute: async () => 'rolled back',
                }),
            }),
            toolPolicy: (name) => name === 'rollback',
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(executed).toBe(0);

        const step = (await store.steps.find(runId)).find((s) => s.kind === 'tool');

        expect(step?.name).toBe(toolName);

        const error = step?.error as { code: string; message: string } | undefined;

        expect(error?.code).toBe(code);

        if (code === 'Error') {
            expect(error?.message).toMatch(/unavailable tool/);
        }
    });

    it('keeps the tool set stable across an approval resume and records the approver', async () => {
        let deployed = 0;
        const model = mockModel([callTool('deploy'), text('done')]);
        const {
            engine,
            store,
            notifier,
        } = setup({
            model,
            tools: () => ({
                deploy: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        deployed++;

                        return 'deployed';
                    },
                }),
                rollback,
            }),
            toolPolicy: requireToolPermission(),
            hooks: gateTool('deploy'),
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('waiting');

        const approver: Invoker = {
            id: 'u-bob',
            kind: 'user',
            permissions: [{ permission: { name: Permission.AGENT_APPROVE } }],
        };

        await engine.approve(notifier.calls[0]!.runId, {
            approvalId: notifier.calls[0]!.approvalId,
            approved: true,
            approver,
        });
        await engine.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.trigger.invoker).toEqual(alice);
        expect(deployed).toBe(1);
        expect(toolNames(model, 0)).toEqual(['deploy']);
        expect(toolNames(model, 1)).toEqual(toolNames(model, 0));

        const wait = (await store.steps.find(runId)).find((s) => s.kind === 'wait');

        expect(wait?.output).toEqual({
            approvalId: expect.any(String),
            approved: true,
            approver,
        });
    });

    it('answers a pending call the policy now refuses with a tool error', async () => {
        let deployed = 0;
        const model = mockModel([callTool('deploy'), text('could not deploy')]);
        const tools: AgentDefinition['tools'] = () => ({
            deploy: tool({
                inputSchema: z.object({}),
                execute: async () => {
                    deployed++;

                    return 'deployed';
                },
            }),
            rollback,
        });
        const {
            engine,
            store,
            clock,
            notifier,
        } = setup({
            model,
            tools,
            toolPolicy: () => true,
            hooks: gateTool('deploy'),
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('waiting');
        engine.stop();

        // redeployed with a tighter policy: deploy is refused now
        const tightened = new Engine({
            store,
            agents: [defineModelAgent({
                name: 'release',
                instructions: 'You release.',
                model,
                tools,
                toolPolicy: (name) => name !== 'deploy',
                hooks: gateTool('deploy'),
            })],
            clock,
            claimTtlMs: 30,
            onError: () => {},
        });

        engines.push(tightened);
        await tightened.start();
        await tightened.approve(notifier.calls[0]!.runId, { approvalId: notifier.calls[0]!.approvalId, approved: true });
        await tightened.idle();

        const run = await store.runs.findOne(runId);

        expect(run?.status).toBe('completed');
        expect(run?.output).toBe('could not deploy');
        expect(deployed).toBe(0);

        const prompt = JSON.stringify(model.doStreamCalls[1]?.prompt);

        expect(prompt).toContain('error-text');
        expect(prompt).toContain('not allowed');
        expect(toolNames(model, 1)).toEqual(['rollback']);
    });

    it('rejects an invalid approver before answering', async () => {
        const model = mockModel([callTool('deploy'), text('done')]);
        const {
            engine,
            store,
            notifier,
        } = setup({
            model,
            tools: () => ({ deploy }),
            hooks: gateTool('deploy'),
        });

        await engine.start();

        const { runId } = await engine.dispatch(env(alice));

        await engine.idle();

        const { approvalId } = notifier.calls[0]!;

        await expect(engine.approve(runId, {
            approvalId,
            approved: true,
            approver: {
                id: '',
                kind: 'user',
                permissions: [],
            },
        })).rejects.toBeInstanceOf(ValidationError);
        expect((await store.runs.findOne(runId))?.status).toBe('waiting');
        expect((await store.steps.find(runId)).some((s) => s.kind === 'wait')).toBe(false);

        // without an approver the wait step has none
        await engine.approve(runId, { approvalId, approved: true });
        await engine.idle();

        const wait = (await store.steps.find(runId)).find((s) => s.kind === 'wait');

        expect(wait?.output).not.toHaveProperty('approver');
    });
});
