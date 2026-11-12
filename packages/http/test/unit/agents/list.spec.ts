/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { defineSimpleAgent } from '@chamvi/core';
import {
    READER_TOKEN,
    call,
    createTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { inventoryAgents } from '../../utils/agents.ts';

describe('GET /agents', () => {
    it('summarizes every agent in definition order', async () => {
        const { app } = createTestApp({ agents: inventoryAgents() });
        const response = await call(app, 'GET', '/agents', { token: READER_TOKEN });

        expect(response.status).toBe(200);

        const { data } = await response.json();

        expect(data).toEqual([
            {
                name: 'echo',
                kind: 'model',
                channels: [{ channel: 'http', id: 'http' }],
                budget: { maxSteps: 20, timeoutMs: 900_000 },
                state: [],
                private: false,
            },
            {
                name: 'intake',
                kind: 'model',
                channels: [{
                    channel: 'webhook',
                    id: 'webhook:/issues',
                    hook: '/channels/webhook/intake/issues',
                }],
                budget: { maxSteps: 20, timeoutMs: 900_000 },
                state: ['issues'],
                private: false,
            },
        ]);
    });

    it('marks a simple agent', async () => {
        const fan = defineSimpleAgent({ name: 'fan', run: () => 'ok' });
        const { app } = createTestApp({ agents: [fan] });
        const response = await call(app, 'GET', '/agents', { token: READER_TOKEN });
        const { data } = await response.json();

        expect(data).toEqual([expect.objectContaining({ name: 'fan', kind: 'simple' })]);
    });

    it('marks a private agent', async () => {
        const hidden = defineSimpleAgent({
            name: 'hidden', 
            run: () => 'ok', 
            private: true, 
        });
        const { app } = createTestApp({ agents: [hidden] });
        const { data } = await (await call(app, 'GET', '/agents', { token: READER_TOKEN })).json();

        expect(data).toEqual([expect.objectContaining({ name: 'hidden', private: true })]);
    });

    it('prefixes the hook path with basePath', async () => {
        const { app } = createTestApp({ agents: inventoryAgents(), basePath: '/api' });
        const { data } = await (await call(app, 'GET', '/api/agents', { token: READER_TOKEN })).json();

        expect(data[1].channels[0].hook).toBe('/api/channels/webhook/intake/issues');
    });

    it('builds the hook path from a basePath given with a trailing slash', async () => {
        const { app } = createTestApp({ agents: inventoryAgents(), basePath: '/api/' });
        const { data } = await (await call(app, 'GET', '/api/agents', { token: READER_TOKEN })).json();

        expect(data[1].channels[0].hook).toBe('/api/channels/webhook/intake/issues');
    });

    it('lists no hook for a webhook channel the http app does not mount', async () => {
        const { app } = createTestApp({ agents: inventoryAgents(), channels: [] });
        const { data } = await (await call(app, 'GET', '/agents', { token: READER_TOKEN })).json();

        expect(data[1].channels).toEqual([{ channel: 'webhook', id: 'webhook:/issues' }]);
    });

    it('lists only the agents a restricted read grant reaches', async () => {
        const { app } = createTestApp({ agents: inventoryAgents() });
        const token = tokenFor(restricted(Permission.RUN_READ, { agent: 'intake' }));
        const { data } = await (await call(app, 'GET', '/agents', { token })).json();

        expect(data.map((agent: { name: string }) => agent.name)).toEqual(['intake']);
    });

    it('needs chamvi_run_read', async () => {
        const { app } = createTestApp({ agents: inventoryAgents() });

        expect((await call(app, 'GET', '/agents', { token: tokenFor() })).status).toBe(403);
        expect((await call(app, 'GET', '/agents', { token: tokenFor(restricted(Permission.AGENT_RUN, { name: 'echo' })) })).status).toBe(403);
        expect((await call(app, 'GET', '/agents')).status).toBe(401);
    });

    it('lists no issues without agentIssues', async () => {
        const { app } = createTestApp({ agents: inventoryAgents() });
        const body = await (await call(app, 'GET', '/agents', { token: READER_TOKEN })).json();

        expect(body.issues).toEqual([]);
    });

    it('lists agentIssues', async () => {
        const at = new Date(1_000_000);
        const { app } = createTestApp({
            agents: inventoryAgents(),
            agentIssues: () => [{
                agent: 'broken',
                message: 'agent.yaml: model is missing',
                at,
            }],
        });
        const body = await (await call(app, 'GET', '/agents', { token: READER_TOKEN })).json();

        expect(body.issues).toEqual([{
            agent: 'broken',
            message: 'agent.yaml: model is missing',
            at: at.toISOString(),
        }]);
        expect(body.data.map((agent: { name: string }) => agent.name)).toEqual(['echo', 'intake']);
    });

    it('lists only the issues of agents a restricted read grant reaches', async () => {
        const at = new Date(1_000_000);
        const { app } = createTestApp({
            agents: inventoryAgents(),
            agentIssues: () => [
                {
                    agent: 'secret-payroll',
                    message: 'agent.yaml: model is missing',
                    at,
                },
                {
                    agent: 'intake',
                    message: 'agent.yaml: tool is missing',
                    at,
                },
            ],
        });
        const token = tokenFor(restricted(Permission.RUN_READ, { agent: 'intake' }));
        const body = await (await call(app, 'GET', '/agents', { token })).json();

        expect(body.issues).toEqual([{
            agent: 'intake',
            message: 'agent.yaml: tool is missing',
            at: at.toISOString(),
        }]);
    });
});
