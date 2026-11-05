/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Engine, createMemoryStore, defineModelAgent } from '@chamvi/core';
import { httpChannel } from '@chamvi/http';
import { mockModel } from '@chamvi/test-kit';
import { calendarTools } from '@chamvi/tool-calendar';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import { weeklyStandup } from '../../utils/ics.ts';

describe('calendar trust', () => {
    it('taints the run with a calendar result', async () => {
        const server = createFakeCalDav([{
            slug: 'home',
            name: 'Home',
            objects: [weeklyStandup()],
        }]);
        const agent = defineModelAgent({
            name: 'planner',
            instructions: 'Plan.',
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'calendar_events',
                        input: { from: '2026-11-01', to: '2026-11-30' },
                        toolCallId: 'c1',
                    }],
                },
                { parts: [{ type: 'text', text: 'Done.' }] },
            ]),
            tools: calendarTools({
                accounts: [{
                    id: 'me',
                    url: FAKE_CALDAV_URL,
                    user: 'me@example.com',
                    password: 'secret',
                }],
                fetch: server.fetch,
            }),
        });
        const engine = new Engine({
            store: createMemoryStore(),
            agents: [agent],
            channels: [httpChannel()],
        });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: agent.name,
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        await engine.idle();

        const run = await engine.getRun(runId);

        engine.stop();

        expect(run?.status).toBe('completed');
        expect(run?.taint?.source).toBe('tool:calendar_events');
        expect(server.requests.every((request) => ['PROPFIND', 'REPORT', 'GET'].includes(request.method))).toBe(true);
    });
});
