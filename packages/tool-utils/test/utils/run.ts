/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { Engine, createMemoryStore, defineModelAgent } from '@chamvi/core';
import type { DispatchEnvelope } from '@chamvi/core';
import type { ControllableClock } from '@chamvi/test-kit';
import { mockModel } from '@chamvi/test-kit';

export type RunToolOptions = {
    clock?: ControllableClock;
    trigger?: Partial<DispatchEnvelope>;
};

/**
 * Drives a real Engine on a memory store: the model calls `name` once with
 * `input`. Returns the tool's output, or throws an Error with its error text.
 */
export async function runTool(tools: ToolSet, name: string, input: unknown, options: RunToolOptions = {}): Promise<unknown> {
    const agent = defineModelAgent({
        name: 'utility-test',
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call', 
                    toolName: name, 
                    input, 
                    toolCallId: 'c1', 
                }], 
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]),
        instructions: 'Call the tool.',
        tools,
    });
    const engine = new Engine({
        store: createMemoryStore(),
        agents: [agent],
        ...(options.clock ? { clock: options.clock } : {}),
    });

    await engine.start();

    const { runId } = await engine.dispatch({
        agent: agent.name,
        trigger: 'test',
        channel: 'test',
        payload: {},
        ...options.trigger,
    });

    await engine.idle();

    const steps = await engine.store.steps.find(runId);
    const step = steps.find((s) => s.kind === 'tool' && s.name === name);

    engine.stop();

    if (!step) {
        throw new Error(`The tool ${name} was not called.`);
    }

    if (step.error) {
        throw new Error((step.error as { message?: string }).message ?? String(step.error));
    }

    return step.output;
}
