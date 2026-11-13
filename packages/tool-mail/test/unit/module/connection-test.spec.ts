/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
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
import { toolMailModule } from '@chamvi/tool-mail/module';
import { verifyMailLogin } from '../../../src/client/login.ts';
import type { MailAccountNormalized } from '../../../src/options/types.ts';
import { createFakeImap } from '../../utils/imap.ts';
import type { FakeImap, FakeImapOptions } from '../../utils/imap.ts';
import { PASSWORD, fakeOptions } from '../../utils/mail.ts';

const TOKEN = 'a-static-token-of-length';
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const harnesses: ModuleHarness[] = [];
const servers: FakeImap[] = [];
const logLines: string[] = [];

afterEach(async () => {
    logLines.length = 0;

    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }

    for (const server of servers.splice(0)) {
        await server.close();
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

async function fake(options: Partial<FakeImapOptions> = {}): Promise<FakeImap> {
    const server = await createFakeImap(fakeOptions(false, options));

    servers.push(server);

    return server;
}

async function serve(): Promise<(method: string, path: string, body?: unknown) => Promise<Response>> {
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
            httpModule({
                metrics: false,
                rateLimit: false,
                openapi: false,
            }),
            toolMailModule({ env: {} }),
        ],
    });

    harnesses.push(harness);

    return (method, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
}

function account(port: number, overrides: Partial<MailAccountNormalized> = {}): MailAccountNormalized {
    return {
        id: 'test',
        host: '127.0.0.1',
        port,
        security: 'plain',
        user: 'bob@y.test',
        password: PASSWORD,
        ...overrides,
    } as MailAccountNormalized;
}

async function createAccount(call: Awaited<ReturnType<typeof serve>>, port: number): Promise<void> {
    const response = await call('POST', '/connection-types/mail/connections', {
        account: 'work',
        settings: {
            address: 'bob@y.test',
            host: '127.0.0.1',
            port,
            security: 'plain',
        },
        secrets: { password: PASSWORD },
    });

    expect(response.status).toBe(201);
}

describe('the mail connection test', () => {
    it('offers the test', async () => {
        const call = await serve();
        const body = await (await call('GET', '/connection-types')).json() as { data: { type: string; testable: boolean }[] };

        expect(body.data.find((type) => type.type === 'mail')?.testable).toBe(true);
    });

    it('logs in over IMAP with the saved values and logs out, opening no mailbox', async () => {
        const imap = await fake();
        const call = await serve();

        await createAccount(call, imap.port);

        const response = await call('POST', '/connections/mail-work/test', { settings: { host: 'unsaved.test' } });

        expect(await response.json()).toEqual({ ok: true });
        expect(imap.commands.some((line) => / LOGIN /.test(line))).toBe(true);
        expect(imap.commands.some((line) => / LOGOUT/.test(line))).toBe(true);
        expect(imap.commands.some((line) => / (SELECT|EXAMINE|STORE|APPEND|EXPUNGE|DELETE|CREATE|RENAME|COPY|MOVE) /.test(line))).toBe(false);
        await expect.poll(() => imap.closed()).toBeGreaterThan(0);
    });

    it('reports a refused login without a value', async () => {
        const imap = await fake({ loginFails: true });
        const call = await serve();

        await createAccount(call, imap.port);

        const response = await call('POST', '/connections/mail-work/test');
        const text = await response.text();

        expect(JSON.parse(text)).toEqual({ ok: false, message: 'The IMAP server refused the user or password.' });
        expect(text).not.toContain(PASSWORD);
        expect(logLines.join('\n')).not.toContain(PASSWORD);
    });

    it('reports an unreachable server without its address', async () => {
        const port = await freePort();
        const call = await serve();

        await createAccount(call, port);

        const text = await (await call('POST', '/connections/mail-work/test')).text();

        expect(JSON.parse(text)).toEqual({ ok: false, message: 'The IMAP server cannot be reached.' });
        expect(text).not.toContain(String(port));
    });

    it('is bounded by its signal: an abort during a login that never answers closes the socket', async () => {
        const imap = await fake({ hold: /LOGIN/ });
        const controller = new AbortController();
        const reason = new Error('stop');
        const pending = verifyMailLogin(account(imap.port), controller.signal);

        await expect.poll(() => imap.commands.some((line) => line.includes('LOGIN'))).toBe(true);
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
        await expect.poll(() => imap.closed()).toBeGreaterThan(0);
    });

    it('answers from the login: a logout the server never answers does not hold the result', async () => {
        const imap = await fake({ hold: /LOGOUT/ });
        const controller = new AbortController();
        const settled = verifyMailLogin(account(imap.port), controller.signal).then(() => 'ok', () => 'failed');
        const late = new Promise((resolve) => {
            setTimeout(() => resolve('held'), 2000);
        });

        expect(await Promise.race([settled, late])).toBe('ok');
        controller.abort();
        await expect.poll(() => imap.closed()).toBeGreaterThan(0);
    });

    it('does not start on an aborted signal', async () => {
        const imap = await fake();

        await expect(verifyMailLogin(account(imap.port), AbortSignal.abort())).rejects.toBeDefined();
        expect(imap.commands).toEqual([]);
    });
});
