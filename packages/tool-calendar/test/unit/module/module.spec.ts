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
import { jsonSchema } from 'ai';
import {
    InvalidAgentDefinitionError,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    AppToken,
    ModuleName,
    configModule,
    createLogger,
    engineModule,
    runHooks,
    storeModule,
} from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { buildModuleHarness, createModuleHarness, memoryStoreModule } from '@chamvi/app/testing';
import type { ModuleHarness, ModuleHarnessOptions } from '@chamvi/app/testing';
import {
    calendarTools,
    calendarWriteTools,
    injectCalendarContext,
    injectCalendarWriteContext,
} from '@chamvi/tool-calendar';
import type { CalendarEventsToolResult } from '@chamvi/tool-calendar';
import {
    CALENDAR_ACCOUNTS_VARIABLE,
    TOOL_CALENDAR_MODULE_NAME,
    ToolCalendarModule,
    toolCalendarModule,
} from '@chamvi/tool-calendar/module';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';
import { weeklyStandup } from '../../utils/ics.ts';

const PASSWORD = 'app-specific-secret';

const ENV = {
    [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{ url: FAKE_CALDAV_URL, address: 'me@icloud.com' }]),
    CHAMVI_CALENDAR_ME_ICLOUD_COM_PASSWORD: PASSWORD,
};

const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

function fake(): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [weeklyStandup()], 
    }]);
}

/** An agent reading 2026-11-02 to 2026-11-16 with the module's client (no accounts of its own), in each of `runs` runs. */
function plannerAgent(runs = 1): Agent {
    return defineModelAgent({
        name: 'planner',
        instructions: 'Plan.',
        model: mockModel(Array.from({ length: runs }, (_, index): MockResponse[] => [
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'calendar_events',
                    input: { from: '2026-11-02', to: '2026-11-17' },
                    toolCallId: `c${index}`,
                }],
            },
            { parts: [{ type: 'text', text: 'Done.' }] },
        ]).flat()),
        tools: calendarTools(),
    });
}

async function harnessOf(module: IModule, options: Omit<ModuleHarnessOptions, 'modules'> = {}): Promise<ModuleHarness> {
    const harness = buildModuleHarness({
        ...options,
        modules: [
            configModule({ logger: createLogger({ level: 'error', write: () => {} }) }),
            storeModule(),
            engineModule(),
            module,
        ],
    });

    harnesses.push(harness);
    await harness.setup();

    return harness;
}

async function runPlanner(harness: ModuleHarness) {
    const engine = harness.container.resolve(AppToken.ENGINE);
    const { runId } = await engine.dispatch({
        agent: 'planner',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    const run = await engine.runService.findOne(runId);
    const step = (await engine.stepService.find(runId))
        .find((entry) => entry.kind === 'tool' && entry.name === 'calendar_events');

    return { run, step };
}

/** An agent calling `tool` with `input` once per run (`runs` runs), with `tools`. */
function callingAgent(tool: string, input: unknown, tools: Record<string, unknown>, runs = 1): Agent {
    return defineModelAgent({
        name: 'caller',
        instructions: 'Call.',
        model: mockModel(Array.from({ length: runs }, (_, index): MockResponse[] => [
            {
                parts: [{
                    type: 'tool-call',
                    toolName: tool,
                    input,
                    toolCallId: `t${index}`,
                }],
            },
            { parts: [{ type: 'text', text: 'Done.' }] },
        ]).flat()),
        tools: tools as never,
    });
}

/** Runs `caller` once and gives its first step of `tool`. */
async function toolStepOf(harness: ModuleHarness, tool: string) {
    const engine = harness.container.resolve(AppToken.ENGINE);
    const { runId } = await engine.dispatch({
        agent: 'caller',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    return (await engine.stepService.find(runId)).find((entry) => entry.kind === 'tool' && entry.name === tool);
}

describe('toolCalendarModule()', () => {
    it('is named chamvi:tool-calendar and needs the config, store and engine modules', () => {
        const module = toolCalendarModule({ env: {} });

        expect(module).toBeInstanceOf(ToolCalendarModule);
        expect(module.name).toBe(TOOL_CALENDAR_MODULE_NAME);
        expect(module.dependencies).toEqual([ModuleName.CONFIG, ModuleName.STORE, ModuleName.ENGINE]);
    });

    it('provides the env accounts\' client to tools without accounts', async () => {
        const server = fake();
        const harness = await harnessOf(toolCalendarModule({ env: ENV, fetch: server.fetch }), { agents: [plannerAgent()] });
        const { run, step } = await runPlanner(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toBeUndefined();
        expect((step?.output as CalendarEventsToolResult).events.map((event) => event.title)).toContain('Standup moved');
        expect(server.requests.length).toBeGreaterThan(0);
        expect(server.requests.every((request) => ['PROPFIND', 'REPORT', 'GET'].includes(request.method))).toBe(true);
        expect(server.requests[0]?.authorization).toBe(`Basic ${btoa(`me@icloud.com:${PASSWORD}`)}`);
        expect(harness.reported).toEqual([]);
    });

    it('gives event times in CHAMVI_CALENDAR_TIMEZONE', async () => {
        const server = fake();
        const harness = await harnessOf(toolCalendarModule({
            env: { ...ENV, CHAMVI_CALENDAR_TIMEZONE: 'UTC' },
            fetch: server.fetch,
            timezone: 'America/New_York',
        }), { agents: [plannerAgent()] });
        const { step } = await runPlanner(harness);
        const [first] = (step?.output as CalendarEventsToolResult).events;

        // the moved standup: 14:00 Berlin (CET) is 13:00 UTC
        expect(first?.start).toBe('2026-11-09T13:00:00+00:00');
    });

    it('takes the accounts option over the env', async () => {
        const server = fake();
        const harness = await harnessOf(toolCalendarModule({
            env: { [CALENDAR_ACCOUNTS_VARIABLE]: '[' },
            accounts: [{
                id: 'code',
                url: FAKE_CALDAV_URL,
                user: 'code@icloud.com',
                password: PASSWORD,
            }],
            fetch: server.fetch,
        }), { agents: [plannerAgent()] });
        const { run } = await runPlanner(harness);

        expect(run?.status).toBe('completed');
        expect(server.requests[0]?.authorization).toBe(`Basic ${btoa(`code@icloud.com:${PASSWORD}`)}`);
    });

    it('keeps the context provided without accounts: the tool fails with connection_not_configured', async () => {
        const harness = await harnessOf(toolCalendarModule({ env: {} }), { agents: [plannerAgent()] });
        const { run, step } = await runPlanner(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('closes the client once the engine drained: the next call logs in again', async () => {
        const server = fake();
        const harness = await harnessOf(toolCalendarModule({ env: ENV, fetch: server.fetch }), { agents: [plannerAgent(3)] });
        const logins = () => server.requests.filter((request) => new URL(request.url).pathname === '/123/principal/').length;

        await runPlanner(harness);
        expect(logins()).toBe(1);

        // a second call reuses the session
        await runPlanner(harness);
        expect(logins()).toBe(1);

        await runHooks(harness.container, 'drained');

        const { step } = await runPlanner(harness);

        expect(step?.error).toBeUndefined();
        expect(logins()).toBe(2);
    });

    it('provides the read and the write client of the same accounts', async () => {
        const server = fake();
        const probe = defineTool({
            inputSchema: jsonSchema<Record<string, never>>({ type: 'object' }),
            execute: async (_input, { context }) => ({
                read: (await injectCalendarContext(context).calendars()).map((view) => view.calendar),
                write: await injectCalendarWriteContext(context).calendar('me-icloud-com:home'),
            }),
        });
        const harness = await harnessOf(toolCalendarModule({ env: ENV, fetch: server.fetch }), { agents: [callingAgent('probe', {}, { probe })] });
        const step = await toolStepOf(harness, 'probe');

        expect(step?.error).toBeUndefined();
        expect(step?.output).toEqual({
            read: ['me-icloud-com:home'],
            write: {
                calendar: 'me-icloud-com:home',
                account: 'me-icloud-com',
                name: 'Home',
                url: 'https://p42-caldav.icloud.com/123/calendars/home/',
            },
        });
    });

    it('makes calendar_create fail with connection_not_configured without accounts', async () => {
        const harness = await harnessOf(toolCalendarModule({ env: {} }), {
            agents: [callingAgent('calendar_create', {
                calendar: 'me:home',
                title: 'Planning',
                start: '2026-11-05T09:00',
                end: '2026-11-05T10:00',
            }, calendarWriteTools())],
        });
        const step = await toolStepOf(harness, 'calendar_create');

        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('closes both clients once the engine drained: the next calls log in again', async () => {
        const server = fake();
        const probe = defineTool({
            inputSchema: jsonSchema<Record<string, never>>({ type: 'object' }),
            execute: async (_input, { context }) => {
                await injectCalendarContext(context).calendars();
                await injectCalendarWriteContext(context).calendar('me-icloud-com:home');

                return null;
            },
        });
        const harness = await harnessOf(toolCalendarModule({ env: ENV, fetch: server.fetch }), { agents: [callingAgent('probe', {}, { probe }, 2)] });
        const logins = () => server.requests.filter((request) => new URL(request.url).pathname === '/123/principal/' &&
            !request.body.includes('calendar-user-address-set')).length;

        await toolStepOf(harness, 'probe');
        // one login per client
        expect(logins()).toBe(2);

        await runHooks(harness.container, 'drained');
        await toolStepOf(harness, 'probe');

        expect(logins()).toBe(4);
    });

    it('checks the env when the factory is called, never echoing a password', () => {
        expect(() => toolCalendarModule({ env: { [CALENDAR_ACCOUNTS_VARIABLE]: '{' } })).toThrow(InvalidAgentDefinitionError);
        expect(() => toolCalendarModule({ env: { [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{ url: 'ftp://x.test', address: 'me@icloud.com' }]) } })).toThrow(/CHAMVI_CALENDAR_ACCOUNTS/);
        expect(() => toolCalendarModule({ env: { CHAMVI_CALENDAR_TIMEZONE: 'Mars/Olympus' } })).toThrow(/CHAMVI_CALENDAR_TIMEZONE/);
        expect(() => toolCalendarModule({ timezone: 'Mars/Olympus' })).toThrow(InvalidAgentDefinitionError);
        expect(() => toolCalendarModule({ fetch: 'nope' as unknown as typeof fetch })).toThrow(InvalidAgentDefinitionError);
        expect(() => toolCalendarModule('nope' as never)).toThrow(InvalidAgentDefinitionError);
    });

    it('does nothing in migrate mode', async () => {
        const harness = await createModuleHarness({
            mode: 'migrate',
            env: { DATABASE_URL: 'postgres://chamvi@127.0.0.1:1/chamvi' },
            modules: [
                configModule({ logger: createLogger({ level: 'error', write: () => {} }) }),
                memoryStoreModule(),
                engineModule(),
                toolCalendarModule({ env: ENV, fetch: fake().fetch }),
            ],
        });

        harnesses.push(harness);
        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS).filter((hook) => hook.name === TOOL_CALENDAR_MODULE_NAME)).toEqual([]);
    });
});
