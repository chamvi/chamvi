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
    agent,
    agentChannel,
    defineAgent,
    defineTool,
    dispatch,
    waitForDispatch,
} from '@chamvi/core';
import type { DispatchOutcome, IEngine } from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { nextRun, treeModel } from '../../utils/dispatch.ts';
import type { ChildTurn } from '../../utils/dispatch.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (toolName: string, input: unknown, toolCallId: string): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

const fan = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()), timeoutMs: z.number() }),
    execute: async ({ payloads, timeoutMs }, { context }) => {
        const started = await Promise.all(payloads.map((payload) => dispatch(context, { payload })));

        return waitForDispatch(context, started, { timeoutMs });
    },
});

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

describe('dispatch wait timeout', () => {
    it('timeout cancels owned unsettled children and outcomes carry Timeout', async () => {
        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        // a answers, b settles only by aborting
        const child: ChildTurn = (payload, options) => (payload === 'a' ?
            text('out-a') :
            new Promise<MockResponse>((_resolve, reject) => {
                options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
            }));
        const lead = defineAgent({
            name: 'lead',
            instructions: 'You lead.',
            model: treeModel([
                { parts: [call('fan', { payloads: ['a', 'b'], timeoutMs: 60_000 }, 'c1')] },
                text('done'),
            ], child),
            channels: [agent.on()],
            tools: { fan },
        });
        const engine = new Engine({
            store,
            clock,
            agents: [lead],
            channels: [agentChannel()],
            onError: () => {},
        });

        engines.push(engine);
        await engine.start();

        const aDone = nextRun(engine, (run) => run.parentRunId !== undefined && run.status === 'completed');
        const paused = nextRun(engine, (run) => run.status === 'waiting');
        const { runId: parentId } = await engine.dispatch({
            agent: 'lead',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await Promise.all([aDone, paused]);

        const completed = nextRun(engine, (run) => run.id === parentId && run.status === 'completed');

        clock.advance(60_000);
        await engine.tick();
        await completed;
        await engine.idle();

        const { data } = await store.runs.find({ parentRunId: parentId });
        const a = data.find((r) => r.trigger.payload === 'a')!;
        const b = data.find((r) => r.trigger.payload === 'b')!;

        expect(a.status).toBe('completed');
        expect(b.status).toBe('cancelled');
        expect(b.error?.code).toBe('Timeout');

        const [step] = (await store.steps.find(parentId)).filter((s) => s.kind === 'tool');
        const outcomes = step?.output as DispatchOutcome[];

        expect(outcomes[0]).toEqual({
            runId: a.id,
            agent: 'lead',
            role: 'default',
            status: 'completed',
            output: 'out-a',
        });
        expect(outcomes[1]).toMatchObject({
            runId: b.id,
            agent: 'lead',
            role: 'default',
            status: 'cancelled',
            error: { code: 'Timeout' },
        });
        expect(outcomes[1]?.error?.message).toBe(b.error?.message);
        expect((await store.steps.find(parentId)).filter((s) => s.kind === 'wait')).toHaveLength(1);
    });
});
