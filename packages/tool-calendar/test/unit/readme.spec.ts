/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Engine, createMemoryStore } from '@chamvi/core';
import { httpChannel } from '@chamvi/http';
import { mockModel } from '@chamvi/test-kit';
import type { CalendarEventsToolResult } from '@chamvi/tool-calendar';
import { createPlannerAgent } from '../fixtures/readme-example.ts';
import { createFakeCalDav } from '../utils/caldav.ts';
import { weeklyStandup } from '../utils/ics.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('gives the agent both calendar tools and the http channel', () => {
        const agent = createPlannerAgent(mockModel([]), 'secret');

        expect(Object.keys(agent.definition.tools as object)).toEqual(['calendar_list', 'calendar_events']);
        expect(agent.definition.channels?.map((subscription) => subscription.channel)).toEqual(['http']);
    });

    it('reads the day\'s events from the CalDAV server', async () => {
        const server = createFakeCalDav([{
            slug: 'home', 
            name: 'Home', 
            objects: [weeklyStandup()], 
        }]);
        const agent = createPlannerAgent(mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'calendar_events',
                    input: { from: '2026-11-09', to: '2026-11-10' },
                    toolCallId: 'c1',
                }],
            },
            { parts: [{ type: 'text', text: 'The standup moved to 14:00.' }] },
        ]), 'secret', server.fetch);
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
            payload: { day: '2026-11-09' },
        });

        await engine.idle();

        const run = await engine.getRun(runId);
        const steps = await engine.store.steps.find(runId);
        const events = steps.find((step) => step.kind === 'tool' && step.name === 'calendar_events');

        engine.stop();

        expect(run?.status).toBe('completed');
        expect(run?.taint?.source).toBe('tool:calendar_events');
        expect((events?.output as CalendarEventsToolResult).events).toMatchObject([{
            title: 'Standup moved',
            start: '2026-11-09T14:00:00+01:00',
        }]);
        expect(server.requests.every((request) => ['PROPFIND', 'REPORT', 'GET'].includes(request.method))).toBe(true);
    });
});
