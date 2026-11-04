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
    agent,
    agentChannel,
    defineModelAgent,
    defineTool,
    dispatch,
    waitForDispatch,
} from '@chamvi/core';
import type { DispatchOutcome, IStore } from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { nextRun, treeModel } from '../../utils/dispatch.ts';
import type { ChildTurn, ParentTurn } from '../../utils/dispatch.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const call = (toolName: string, input: unknown, toolCallId: string): MockPart => ({
    type: 'tool-call',
    toolName,
    input,
    toolCallId,
});
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

let bodies = 0;

const fan = defineTool({
    inputSchema: z.object({ payloads: z.array(z.string()) }),
    execute: async ({ payloads }, { context }) => {
        bodies++;

        const started = await Promise.all(payloads.map((payload) => dispatch(context, { payload })));

        return waitForDispatch(context, started);
    },
});

function build(store: IStore, clock: ControllableClock, parent: ParentTurn[], child: ChildTurn) {
    const lead = defineModelAgent({
        name: 'lead',
        instructions: 'You lead.',
        model: treeModel(parent, child),
        channels: [agent.on()],
        tools: { fan },
    });

    return new Engine({
        store,
        clock,
        agents: [lead],
        channels: [agentChannel()],
        onError: () => {},
    });
}

describe('fan-out', () => {
    it('a parent fans out to three children, one fails, and resumes once with all outcomes across an engine restart', async () => {
        bodies = 0;

        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });
        // engine A: c1 answers, c2 and c3 never do (they are interrupted by the drain)
        const a = build(store, clock, [
            { parts: [call('fan', { payloads: ['c1', 'c2', 'c3'] }, 'f1')] },
        ], (payload) => (payload === 'c1' ? text('out-c1') : new Promise<MockResponse>(() => {})));

        await a.start();

        const firstSettled = nextRun(a, (run) => run.parentRunId !== undefined && run.status === 'completed');
        const { runId: parentId } = await a.dispatch({
            agent: 'lead',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await firstSettled;

        const draining = a.drain({ timeoutMs: 1_000 });

        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        clock.advance(1_000);
        await draining;

        const parked = await store.runs.findOne(parentId);

        expect(parked?.status).toBe('waiting');
        expect(parked?.waiting?.kind).toBe('dispatch');

        // engine B: same store and clock; c2's model fails, c3 answers
        const b = build(store, clock, [text('done')], (payload) => {
            if (payload === 'c2') {
                throw new Error('model down');
            }

            return text(`out-${String(payload)}`);
        });

        await b.start();
        await b.idle();

        const { data } = await store.runs.find({ parentRunId: parentId });
        const byPayload = (p: string) => data.find((r) => r.trigger.payload === p)!;

        expect(data).toHaveLength(3);
        expect(byPayload('c2').error).toEqual({ code: 'Error', message: 'model down' });

        const tools = (await store.steps.find(parentId)).filter((s) => s.kind === 'tool');
        const outcomes = tools[0]?.output as DispatchOutcome[];

        expect(outcomes).toEqual([
            {
                runId: byPayload('c1').id,
                agent: 'lead',
                role: 'default',
                status: 'completed',
                output: 'out-c1',
            },
            {
                runId: byPayload('c2').id,
                agent: 'lead',
                role: 'default',
                status: 'failed',
                error: { code: 'Error', message: 'model down' },
            },
            {
                runId: byPayload('c3').id,
                agent: 'lead',
                role: 'default',
                status: 'completed',
                output: 'out-c3',
            },
        ]);

        const waits = (await store.steps.find(parentId)).filter((s) => s.kind === 'wait');

        expect(waits).toHaveLength(1);
        expect(waits[0]?.name).toBe('fan');
        expect((await store.runs.findOne(parentId))?.status).toBe('completed');
        expect(bodies).toBe(2);

        b.stop();
    });
});
