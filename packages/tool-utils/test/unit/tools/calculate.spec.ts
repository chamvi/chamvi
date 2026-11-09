/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Engine, createMemoryStore, defineModelAgent } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import { utilityTools } from '@chamvi/tool-utils';
import { runTool } from '../../utils/run.ts';

describe('calculate', () => {
    const tools = utilityTools({ include: ['calculate'] });

    it('returns the exact result', async () => {
        await expect(runTool(tools, 'calculate', { expression: '0.1 + 0.2' })).resolves.toEqual({ result: '0.3' });
    });

    it('returns a tool error for a refused expression', async () => {
        await expect(runTool(tools, 'calculate', { expression: 'constructor' })).rejects.toThrow(/Unknown name/);
    });

    it('returns a tool error for a missing expression', async () => {
        await expect(runTool(tools, 'calculate', {})).rejects.toThrow(/expression/);
    });

    it('leaves the run untainted', async () => {
        const agent = defineModelAgent({
            name: 'calc-test',
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'calculate',
                        input: { expression: '1 + 1' },
                        toolCallId: 'c1',
                    }],
                },
                { parts: [{ type: 'text', text: 'done' }] },
            ]),
            instructions: 'Calculate.',
            tools,
        });
        const engine = new Engine({ store: createMemoryStore(), agents: [agent] });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: agent.name,
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await engine.idle();

        const run = await engine.store.runs.findOneOrFail(runId);

        engine.stop();

        expect(run.status).toBe('completed');
        expect(run.taint).toBeUndefined();
    });
});
