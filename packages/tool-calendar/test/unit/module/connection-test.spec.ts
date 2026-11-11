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
import { createKeyring, defineModelAgent } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import {
    configModule,
    createLogger,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { toolCalendarModule } from '@chamvi/tool-calendar/module';
import { verifyCalendarLogin } from '../../../src/client/login.ts';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';

const PASSWORD = 'app-specific-secret';
const TOKEN = 'a-static-token-of-length';
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

async function serve(dav: FakeCalDav): Promise<(method: string, path: string, body?: unknown) => Promise<Response>> {
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
            name: 'assistant',
            model: mockModel([]),
            instructions: 'Answer.',
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
            storeModule(),
            staticTokensModule(),
            engineModule(),
            httpModule({ metrics: false, rateLimit: false }),
            toolCalendarModule({ env: {}, fetch: dav.fetch }),
        ],
    });

    harnesses.push(harness);

    const call = (method: string, path: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    const created = await call('POST', '/connection-types/calendar/connections', {
        account: 'work',
        settings: { url: FAKE_CALDAV_URL, user: 'bob@icloud.test' },
        secrets: { password: PASSWORD },
    });

    expect(created.status).toBe(201);

    return call;
}

describe('the calendar connection test', () => {
    it('sends an authenticated PROPFIND with the saved values, and only reads', async () => {
        const dav = createFakeCalDav();
        const call = await serve(dav);

        const response = await call('POST', '/connections/calendar-work/test', { settings: { url: 'https://unsaved.test' } });

        expect(await response.json()).toEqual({ ok: true });
        expect(dav.requests.some((request) => request.method === 'PROPFIND' && request.authorization?.startsWith('Basic '))).toBe(true);
        expect(dav.requests.every((request) => ['PROPFIND', 'REPORT', 'GET'].includes(request.method))).toBe(true);
        expect(dav.requests.every((request) => !request.url.includes('unsaved.test'))).toBe(true);
    });

    it('reports refused credentials without a value or the server text', async () => {
        const dav = createFakeCalDav();
        const call = await serve(dav);

        dav.status = 401;

        const text = await (await call('POST', '/connections/calendar-work/test')).text();

        expect(JSON.parse(text)).toEqual({ ok: false, message: 'The CalDAV server refused the user or password.' });
        expect(text).not.toContain(PASSWORD);
        expect(text).not.toContain('denied for this user');
        expect(logLines.join('\n')).not.toContain(PASSWORD);
    });

    it('blames the credentials only for the response that ended the login, not for a refused discovery probe', async () => {
        const account = {
            id: 'test',
            url: FAKE_CALDAV_URL,
            user: 'bob',
            password: PASSWORD,
        };
        const unreachable = 'The CalDAV server cannot be reached, or the URL is no CalDAV server.';
        const isProbe = (input: Parameters<typeof fetch>[0]) => new URL(input instanceof Request ? input.url : input).pathname.startsWith('/.well-known/');

        // a web server that denies dot paths, in front of a URL that is no CalDAV server
        await expect(verifyCalendarLogin(account, {
            signal: new AbortController().signal,
            fetch: async (input) => new Response('', { status: isProbe(input) ? 403 : 404 }),
        })).rejects.toThrow(unreachable);

        // the same probe, then a connection that drops
        await expect(verifyCalendarLogin(account, {
            signal: new AbortController().signal,
            fetch: async (input) => {
                if (isProbe(input)) {
                    return new Response('', { status: 403 });
                }

                throw new TypeError('fetch failed');
            },
        })).rejects.toThrow(unreachable);

        await expect(verifyCalendarLogin(account, {
            signal: new AbortController().signal,
            fetch: async (input) => new Response('', { status: isProbe(input) ? 404 : 403 }),
        })).rejects.toThrow('The CalDAV server refused the user or password.');
    });

    it('is bounded by its signal', async () => {
        const dav = createFakeCalDav();
        const controller = new AbortController();
        const reason = new Error('stop');

        dav.hang = true;

        const pending = verifyCalendarLogin({
            id: 'test',
            url: FAKE_CALDAV_URL,
            user: 'bob',
            password: PASSWORD,
        }, { signal: controller.signal, fetch: dav.fetch });

        await expect.poll(() => dav.requests.length).toBeGreaterThan(0);
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
    });
});
