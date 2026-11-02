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
import { z } from 'zod';
import {
    Engine,
    approve,
    defineAgent,
    defineTool,
    keyedArtifactId,
} from '@chamvi/core';
import type {
    ApprovalDecision,
    ChannelMessage,
    IChannel,
    IEngine,
} from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockResponse } from '../../utils/mock-model.ts';

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

const ask = (request: unknown): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'shots',
        input: { request },
        toolCallId: 'c1',
    }],
});
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

/** Enough keyed artifacts for the cap cases: `$k0` ... `$k20` name real artifacts of the run. */
const KEYS = ['expected', 'actual', 'diff', ...Array.from({ length: 21 }, (_, i) => `k${i}`)];

/** `$<key>` names the keyed artifact the tool put; any other value goes to approve() as is. */
function resolve(runId: string, value: unknown): unknown {
    if (!Array.isArray(value)) {
        return value;
    }

    return value.map((item) => (typeof item === 'string' && item.startsWith('$') ? keyedArtifactId(runId, item.slice(1)) : item));
}

function setup(request: Record<string, unknown>, opts: { channels?: IChannel[] } = {}) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = createMemoryStore({ clock });
    const decisions: ApprovalDecision[] = [];
    let executions = 0;
    const shots = defineTool({
        inputSchema: z.object({ request: z.any() }),
        execute: async (_, { context }) => {
            executions++;

            for (const key of KEYS) {
                await context.artifacts.put({
                    key,
                    mediaType: 'image/png',
                    filename: `${key}.png`,
                    data: new Uint8Array([executions, key.length]),
                });
            }

            const { runId } = context.run;
            const decision = await approve(context, {
                ...request,
                ...(request.artifacts !== undefined ? { artifacts: resolve(runId, request.artifacts) } : {}),
                ...(Array.isArray(request.options) ?
                    {
                        options: (request.options as Record<string, unknown>[]).map((option) => ({
                            ...option,
                            ...(option.artifacts !== undefined ? { artifacts: resolve(runId, option.artifacts) } : {}),
                        })),
                    } :
                    {}),
            } as never);

            decisions.push(decision);

            return decision.approved ? 'accepted' : 'declined';
        },
    });
    const engine = new Engine({
        store,
        agents: [defineAgent({
            name: 'visual',
            instructions: 'You compare.',
            model: mockModel([ask(request), text('done')]),
            tools: { shots },
        })],
        channels: opts.channels ?? [],
        clock,
        onError: () => {},
    });

    engines.push(engine);

    return {
        clock,
        store,
        engine,
        decisions,
        executions: () => executions,
    };
}

async function dispatch(ctx: ReturnType<typeof setup>) {
    await ctx.engine.start();

    const { runId } = await ctx.engine.dispatch({
        agent: 'visual',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await ctx.engine.idle();

    return { runId, run: (await ctx.store.runs.findOne(runId))! };
}

const OPTIONS = [
    {
        id: 'bootstrap',
        label: 'Bootstrap theme',
        artifacts: ['$actual', '$diff'],
    },
    { id: 'bulma', label: 'Bulma theme' },
];

describe('approve() with artifacts', () => {
    it('puts the artifact ids on the wait point in input order', async () => {
        const ctx = setup({
            title: 'Accept baselines?',
            artifacts: ['$diff', '$expected'],
            options: OPTIONS,
            multiple: true,
        });
        const { runId, run } = await dispatch(ctx);

        expect(run.status).toBe('waiting');
        expect(run.waiting?.artifacts).toEqual([keyedArtifactId(runId, 'diff'), keyedArtifactId(runId, 'expected')]);
        expect(run.waiting?.options?.[0]?.artifacts).toEqual([keyedArtifactId(runId, 'actual'), keyedArtifactId(runId, 'diff')]);
        expect(run.waiting?.options?.[1]).toEqual({ id: 'bulma', label: 'Bulma theme' });
    });

    it('records them on the wait step and resumes without duplicate artifacts', async () => {
        const ctx = setup({
            title: 'Accept baselines?',
            artifacts: ['$expected'],
            options: OPTIONS,
            multiple: true,
        });
        const { runId, run } = await dispatch(ctx);

        await ctx.engine.approve(runId, {
            approvalId: run.waiting!.approvalId,
            approved: true,
            selected: ['bootstrap'],
        });
        await ctx.engine.idle();

        const done = (await ctx.store.runs.findOne(runId))!;

        expect(done.status).toBe('completed');
        expect(ctx.executions()).toBe(2);
        expect(ctx.decisions).toEqual([{ approved: true, selected: ['bootstrap'] }]);

        const wait = (await ctx.store.steps.find(runId)).find((s) => s.kind === 'wait');

        expect(wait?.input).toMatchObject({
            artifacts: [keyedArtifactId(runId, 'expected')],
            options: [
                { id: 'bootstrap', artifacts: [keyedArtifactId(runId, 'actual'), keyedArtifactId(runId, 'diff')] },
                { id: 'bulma' },
            ],
        });

        const stored = await ctx.store.artifacts.find(runId);

        expect(stored.map((a) => a.id).sort()).toEqual(KEYS.map((key) => keyedArtifactId(runId, key)).sort());

        // the replayed call re-put the same keys: the wait point's ids still resolve to the latest bytes
        expect(Array.from((await ctx.store.artifacts.read(keyedArtifactId(runId, 'actual')))!)).toEqual([2, 6]);
    });

    it('keeps the artifacts out of the channel message', async () => {
        const sent: ChannelMessage[] = [];
        const channel: IChannel = {
            name: 'ops',
            out: async (message) => {
                sent.push(message);
            },
        };
        const clock = new ControllableClock(new Date(1_000_000));
        const store = createMemoryStore({ clock });
        const tool = defineTool({
            inputSchema: z.object({}),
            execute: async (_, { context }) => {
                const artifact = await context.artifacts.put({
                    key: 'k', 
                    mediaType: 'image/png', 
                    data: new Uint8Array([1]), 
                });

                await context.channels.findOneOrFail('ops').approve({
                    title: 'Look?',
                    address: 'room',
                    artifacts: [artifact.id],
                    options: [{
                        id: 'a',
                        label: 'A',
                        artifacts: [artifact.id],
                    }],
                });

                return 'ok';
            },
        });
        const engine = new Engine({
            store,
            clock,
            channels: [channel],
            agents: [defineAgent({
                name: 'visual',
                instructions: 'x',
                model: mockModel([{
                    parts: [{
                        type: 'tool-call', 
                        toolName: 'tool', 
                        input: {}, 
                        toolCallId: 'c1',
                    }],
                }, text('done')]),
                tools: { tool },
            })],
            onError: () => {},
        });

        engines.push(engine);
        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'visual', 
            trigger: 'http', 
            channel: 'http', 
            payload: {},
        });

        await engine.idle();

        const run = (await store.runs.findOne(runId))!;

        expect(run.waiting?.artifacts).toEqual([keyedArtifactId(runId, 'k')]);
        expect(sent).toHaveLength(1);
        expect(sent[0]).not.toHaveProperty('artifacts');
        expect(sent[0]).toMatchObject({ options: [{ id: 'a', label: 'A' }] });
        expect((sent[0] as { options: object[] }).options[0]).not.toHaveProperty('artifacts');
    });

    it('keeps a plain request free of an artifacts key', async () => {
        const ctx = setup({ title: 'Accept?', options: [{ id: 'a', label: 'A' }] });
        const { run } = await dispatch(ctx);

        expect(run.status).toBe('waiting');
        expect(Object.keys(run.waiting!)).not.toContain('artifacts');
        expect(Object.keys(run.waiting!.options![0]!)).not.toContain('artifacts');
    });

    it('drops empty artifact lists', async () => {
        const ctx = setup({
            title: 'Accept?',
            artifacts: [],
            options: [{
                id: 'a', 
                label: 'A', 
                artifacts: [], 
            }],
        });
        const { run } = await dispatch(ctx);

        expect(run.status).toBe('waiting');
        expect(Object.keys(run.waiting!)).not.toContain('artifacts');
        expect(Object.keys(run.waiting!.options![0]!)).not.toContain('artifacts');
    });

    /** n distinct existing artifacts of the run, so a refusal can only come from the cap. */
    const many = (n: number) => Array.from({ length: n }, (_, i) => `$k${i}`);

    it.each([
        ['an unknown id', { artifacts: ['missing'] }],
        ['another run\'s id', { artifacts: ['foreign'] }],
        ['an unknown id on an option', {
            options: [{
                id: 'a', 
                label: 'A', 
                artifacts: ['$actual', 'missing'], 
            }], 
        }],
        ['a duplicate id', { artifacts: ['$actual', '$actual'] }],
        ['a duplicate id on an option', {
            options: [{
                id: 'a', 
                label: 'A', 
                artifacts: ['$diff', '$diff'], 
            }], 
        }],
        ['21 ids on one option', {
            options: [{
                id: 'a', 
                label: 'A', 
                artifacts: many(21), 
            }], 
        }],
        ['101 ids in total', {
            artifacts: many(1),
            options: Array.from({ length: 5 }, (_, i) => ({
                id: `o${i}`, 
                label: `O${i}`, 
                artifacts: many(20), 
            })),
        }],
        ['a non-string id', { artifacts: [1] }],
        ['an empty id', { artifacts: [''] }],
        ['artifacts that are no array', { artifacts: '$actual' }],
    ])('refuses %s as a tool error without pausing', async (_, extra) => {
        const ctx = setup({ title: 'Accept?', ...extra });

        await ctx.store.artifacts.insert({
            id: 'foreign',
            runId: 'other-run',
            agent: 'visual',
            mediaType: 'image/png',
            size: 1,
            createdAt: new Date(0),
        }, new Uint8Array([1]));

        const { runId, run } = await dispatch(ctx);

        expect(run.status).toBe('completed');
        expect(run.waiting).toBeUndefined();

        const tools = (await ctx.store.steps.find(runId)).filter((s) => s.kind === 'tool');

        expect(tools[0]).toMatchObject({ name: 'shots', error: { code: 'validation_error' } });
    });

    it('accepts exactly 20 ids on each option and 100 in total', async () => {
        const ctx = setup({
            title: 'Accept?',
            options: Array.from({ length: 5 }, (_, i) => ({
                id: `o${i}`,
                label: `O${i}`,
                artifacts: many(20),
            })),
        });
        const { run } = await dispatch(ctx);

        expect(run.status).toBe('waiting');
        expect(run.waiting!.options!.map((option) => option.artifacts!.length)).toEqual([20, 20, 20, 20, 20]);
    });

    it('accepts one id on several options', async () => {
        const ctx = setup({
            title: 'Accept?',
            options: Array.from({ length: 5 }, (_, i) => ({
                id: `o${i}`,
                label: `O${i}`,
                artifacts: ['$actual', ...(i === 0 ? ['$diff'] : [])],
            })),
        });
        const { run } = await dispatch(ctx);

        expect(run.status).toBe('waiting');
    });
});
