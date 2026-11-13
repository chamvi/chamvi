/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    createConnectionConfigStore,
    createKeyring,
    createMemoryStore,
    defineModelAgent,
} from '@chamvi/core';
import type { IStore } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import {
    AppToken,
    configModule,
    createLogger,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { calendarTools } from '@chamvi/tool-calendar';
import { CALENDAR_CONNECTION_TYPE, toolCalendarModule } from '@chamvi/tool-calendar/module';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';

const TOKEN = 'a-static-token-of-length';
const LEFTOVER = 'leftover-env-password';
const LEFTOVER_USER = 'leftover-env-user';
const THROWAWAY = 'throwaway-password';
/** What a deployment keeps after its `work` account left `CHAMVI_CALENDAR_ACCOUNTS`. */
const LEFTOVER_ENV = { CHAMVI_CALENDAR_WORK_PASSWORD: LEFTOVER, CHAMVI_CALENDAR_WORK_USER: LEFTOVER_USER };

const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const harnesses: ModuleHarness[] = [];
const logLines: string[] = [];

afterEach(async () => {
    logLines.length = 0;

    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;

            server.close(() => resolve(port));
        });
    });
}

type Served = {
    harness: ModuleHarness;
    call(method: string, path: string, body?: unknown): Promise<Response>;
};

/** One start of the app over `store`, the calendar module reading `env` and sending through `dav`. */
async function serve(store: IStore, env: Record<string, string>, dav: FakeCalDav): Promise<Served> {
    const port = await freePort();
    const harness = await createModuleHarness({
        env: {
            CHAMVI_TOKENS: JSON.stringify([{
                value: TOKEN,
                id: 'ops',
                permissions: '*',
            }]),
            HOST: '127.0.0.1',
            PORT: String(port),
        },
        keyring,
        agents: [defineModelAgent({
            name: 'planner',
            instructions: 'Plan.',
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'calendar_list',
                        input: {},
                        toolCallId: 'c0',
                    }],
                },
                { parts: [{ type: 'text', text: 'Done.' }] },
            ]),
            tools: calendarTools(),
        })],
        modules: [
            configModule({
                logger: createLogger({
                    level: 'debug',
                    write: (line) => {
                        logLines.push(line);
                    },
                }),
            }),
            storeModule({ store }),
            staticTokensModule(),
            engineModule(),
            httpModule({
                metrics: false,
                rateLimit: false,
                openapi: false,
            }),
            toolCalendarModule({ env, fetch: dav.fetch }),
        ],
    });

    harnesses.push(harness);

    return {
        harness,
        call: (method, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        }),
    };
}

async function stop(served: Served): Promise<void> {
    harnesses.splice(harnesses.indexOf(served.harness), 1);
    await served.harness.stop();
}

/** Adds the account `work` in the dashboard, with the URL of the creator's choosing. */
async function createWork(served: Served): Promise<void> {
    const response = await served.call('POST', '/connection-types/calendar/connections', {
        account: 'work',
        settings: { url: FAKE_CALDAV_URL, user: 'bob@icloud.test' },
        secrets: { password: THROWAWAY },
    });

    expect(response.status).toBe(201);
}

async function runList(served: Served): Promise<void> {
    const engine = served.harness.container.resolve(AppToken.ENGINE);

    await engine.dispatch({
        agent: 'planner',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });
    await engine.idle();
}

/** The credentials of every request, decoded: `<user>:<password>` per line. */
function credentialsOf(dav: FakeCalDav): string {
    return dav.requests
        .map((request) => request.authorization)
        .filter((value): value is string => value !== null && value.startsWith('Basic '))
        .map((value) => atob(value.slice('Basic '.length)))
        .join('\n');
}

describe('a calendar account that exists only in the store (#197)', () => {
    it('never sends a leftover env secret to its URL: after a restart the test and the tools log in with the stored values', async () => {
        const dav = createFakeCalDav([{
            slug: 'home',
            name: 'Home',
            objects: [],
        }]);
        const store = createMemoryStore();
        const first = await serve(store, LEFTOVER_ENV, dav);

        await createWork(first);
        await stop(first);

        const second = await serve(store, LEFTOVER_ENV, dav);
        const tested = await second.call('POST', '/connections/calendar-work/test');

        expect(await tested.json()).toEqual({ ok: true });
        await runList(second);

        const view = await (await second.call('GET', '/connections/calendar-work/config')).json() as { fields: { key: string; source: { kind: string } }[] };

        expect(credentialsOf(dav)).toContain(`bob@icloud.test:${THROWAWAY}`);
        expect(credentialsOf(dav)).not.toContain(LEFTOVER);
        expect(credentialsOf(dav)).not.toContain(LEFTOVER_USER);
        expect(view.fields.find((field) => field.key === 'password')?.source).toEqual({ kind: 'store' });
        expect(view.fields.find((field) => field.key === 'user')?.source).toEqual({ kind: 'store' });
    });

    it('never sends it without a restart either: deleted, added again with another URL and tested', async () => {
        const dav = createFakeCalDav();
        const store = createMemoryStore();

        // the row of an account whose password the environment used to provide
        await createConnectionConfigStore({ store, keyring: () => keyring }).create('calendar-work', CALENDAR_CONNECTION_TYPE, { settings: { url: 'https://original.test', address: 'bob@original.test' } });

        const served = await serve(store, LEFTOVER_ENV, dav);
        const deleted = await served.call('DELETE', '/connections/calendar-work');

        expect(deleted.status).toBe(200);
        await createWork(served);

        const tested = await served.call('POST', '/connections/calendar-work/test');

        expect(await tested.json()).toEqual({ ok: true });
        expect(credentialsOf(dav)).toContain(`bob@icloud.test:${THROWAWAY}`);
        expect(credentialsOf(dav)).not.toContain(LEFTOVER);
        expect(credentialsOf(dav)).not.toContain(LEFTOVER_USER);
    });

    it('warns at the start naming each ignored variable, never a value', async () => {
        const dav = createFakeCalDav();
        const store = createMemoryStore();
        const first = await serve(store, {}, dav);

        await createWork(first);
        await stop(first);
        logLines.length = 0;

        await serve(store, { CHAMVI_CALENDAR_WORK_PASSWORD_FILE: '/no/such/file', CHAMVI_CALENDAR_WORK_USER: LEFTOVER_USER }, dav);

        const warnings = logLines.filter((line) => line.includes('"level":"warn"')).join('\n');

        expect(warnings).toContain('CHAMVI_CALENDAR_WORK_PASSWORD_FILE');
        expect(warnings).toContain('CHAMVI_CALENDAR_WORK_USER');
        expect(warnings).toContain('CHAMVI_CALENDAR_ACCOUNTS');
        expect(logLines.join('\n')).not.toContain(LEFTOVER_USER);
        expect(logLines.join('\n')).not.toContain('/no/such/file');
    });
});
