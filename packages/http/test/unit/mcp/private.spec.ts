/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    agent,
    agentChannel,
    defineModelAgent,
    defineTool,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { http } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    createTestApp,
    deployTool,
    tokenFor,
} from '../../utils/app.ts';
import { approvalModel, textModel } from '../../utils/model.ts';
import { callTool, connectMcp, textOf } from '../../utils/mcp.ts';

/** A private `alfred` and a public `bob`, both on http. */
function plainAgents(): Agent[] {
    return [
        defineModelAgent({
            name: 'alfred',
            model: textModel(),
            instructions: 'Alfred.',
            channels: [http.on()],
            private: true,
        }),
        defineModelAgent({
            name: 'bob',
            model: textModel(),
            instructions: 'Bob.',
            channels: [http.on()],
        }),
    ];
}

async function completedRuns() {
    const setup = createTestApp({ agents: plainAgents() });
    const alfred = await setup.engine.dispatch({
        agent: 'alfred',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });
    const bob = await setup.engine.dispatch({
        agent: 'bob',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await setup.engine.start();
    await setup.engine.idle();

    return {
        ...setup, 
        alfred: alfred.runId, 
        bob: bob.runId, 
    };
}

describe('mcp: private agents', () => {
    it('get_run answers as for an unknown run without agent:<name>:read', async () => {
        const setup = await completedRuns();
        const reader = await connectMcp(setup.app, READER_TOKEN);
        const denied = await callTool(reader, 'get_run', { runId: setup.alfred });

        expect(denied.isError).toBe(true);
        expect(textOf(denied)).toBe(`Run "${setup.alfred}" was not found.`);
        expect((await callTool(reader, 'get_run', { runId: setup.bob })).isError).toBeFalsy();

        const owner = await connectMcp(setup.app, tokenFor('agent:alfred:read'));

        expect((await callTool(owner, 'get_run', { runId: setup.alfred })).isError).toBeFalsy();
        await reader.close();
        await owner.close();
        await setup.engine.drain();
    });

    it('list_runs leaves out a private agent\'s runs without its read grant', async () => {
        const setup = await completedRuns();
        const reader = await connectMcp(setup.app, READER_TOKEN);
        const listed = await callTool(reader, 'list_runs', {});
        const content = listed.structuredContent as { data: Array<{ agent: string }>; total: number };

        expect(content.data.map((run) => run.agent)).toEqual(['bob']);
        expect(content.total).toBe(1);

        const filtered = await callTool(reader, 'list_runs', { agent: 'alfred' });

        expect(filtered.isError).toBe(true);
        expect(textOf(filtered)).toBe('Reading runs of agent "alfred" needs agent:alfred:read.');

        const admin = await connectMcp(setup.app, ADMIN_TOKEN);

        expect((await callTool(admin, 'list_runs', {})).structuredContent).toMatchObject({ total: 2 });
        await reader.close();
        await admin.close();
        await setup.engine.drain();
    });

    it('run_<agent> with a wait answers only the run id and status without the read grant', async () => {
        const call = async (token: string) => {
            const setup = createTestApp({ agents: plainAgents() });

            await setup.engine.start();

            const client = await connectMcp(setup.app, token);
            const result = await callTool(client, 'run_alfred', { waitSeconds: 5 });

            await client.close();
            await setup.engine.drain();

            return result;
        };

        const result = await call(tokenFor('agent:alfred:run'));

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toEqual({
            runId: expect.any(String),
            status: 'completed',
            deduplicated: false,
        });

        const readable = await call(tokenFor('agent:alfred:run', 'agent:alfred:read'));

        expect(readable.structuredContent).toMatchObject({ status: 'completed', output: 'done' });
    });

    it('run_<agent> of a public agent hides a private descendant\'s approval', async () => {
        const call = async (token: string) => {
            const lead = defineModelAgent({
                name: 'lead',
                model: approvalModel('delegate'),
                instructions: 'Lead.',
                channels: [http.on()],
                tools: () => ({
                    delegate: defineTool({
                        inputSchema: z.object({}),
                        execute: async (_input, { context }) => {
                            const child = await dispatchTo(context, { agent: 'alfred', payload: {} });
                            const outcome = await waitForDispatch(context, child);

                            return outcome.status;
                        },
                    }),
                }),
            });
            const alfred = defineModelAgent({
                name: 'alfred',
                model: approvalModel('deploy'),
                instructions: 'Work.',
                channels: [agent.on({ from: ['lead'] })],
                tools: () => ({ deploy: deployTool() }),
                private: true,
            });
            const setup = createTestApp({ agents: [lead, alfred], engineChannels: [agentChannel()] });

            await setup.engine.start();

            const client = await connectMcp(setup.app, token);
            const result = await callTool(client, 'run_lead', { waitSeconds: 30 });

            await client.close();
            await setup.engine.drain();

            return result;
        };

        // the invoker's grants also gate the dispatch to alfred
        const hidden = await call(tokenFor('run:read', 'agent:lead:run', 'agent:alfred:run'));

        expect(hidden.structuredContent).toEqual({
            runId: expect.any(String),
            status: 'waiting',
            deduplicated: false,
        });

        const shown = await call(tokenFor('run:read', 'agent:lead:run', 'agent:alfred:run', 'agent:alfred:read'));

        expect(shown.structuredContent).toMatchObject({
            status: 'waiting',
            waiting: {
                kind: 'approval',
                agent: 'alfred',
                title: 'Deploy?',
            },
        });
    });
});
