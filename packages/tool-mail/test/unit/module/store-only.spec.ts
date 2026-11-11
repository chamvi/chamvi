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
import { mailTools } from '@chamvi/tool-mail';
import { MAIL_CONNECTION_TYPE, toolMailModule } from '@chamvi/tool-mail/module';
import { createFakeImap } from '../../utils/imap.ts';
import type { FakeImap } from '../../utils/imap.ts';
import { fakeOptions } from '../../utils/mail.ts';

const TOKEN = 'a-static-token-of-length';
const LEFTOVER = 'leftover-env-password';
const LEFTOVER_USER = 'leftover-env-user';
const THROWAWAY = 'throwaway-password';
/** What a deployment keeps after its `work` account left `CHAMVI_MAIL_ACCOUNTS`. */
const LEFTOVER_ENV = { CHAMVI_MAIL_WORK_PASSWORD: LEFTOVER, CHAMVI_MAIL_WORK_USER: LEFTOVER_USER };

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

async function fake(): Promise<FakeImap> {
    const server = await createFakeImap(fakeOptions(false));

    servers.push(server);

    return server;
}

type Served = {
    harness: ModuleHarness;
    call(method: string, path: string, body?: unknown): Promise<Response>;
};

/** One start of the app over `store`, the mail module reading `env`. */
async function serve(store: IStore, env: Record<string, string>): Promise<Served> {
    const port = await freePort();
    const harness = await createModuleHarness({
        env: {
            CHAMVI_TOKENS: JSON.stringify([{
                value: TOKEN,
                id: 'ops',
                permissions: ['*'],
            }]),
            HOST: '127.0.0.1',
            PORT: String(port),
        },
        keyring,
        agents: [defineModelAgent({
            name: 'assistant',
            instructions: 'Read the mail.',
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'mail_accounts',
                        input: {},
                        toolCallId: 'c0',
                    }],
                },
                { parts: [{ type: 'text', text: 'Done.' }] },
            ]),
            tools: mailTools(),
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
            httpModule({ metrics: false, rateLimit: false }),
            toolMailModule({ env }),
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

/** Adds the account `work` in the dashboard, with the host of the creator's choosing. */
async function createWork(served: Served, port: number): Promise<void> {
    const response = await served.call('POST', '/connection-types/mail/connections', {
        account: 'work',
        settings: {
            address: 'bob@y.test',
            host: '127.0.0.1',
            port,
            security: 'plain',
        },
        secrets: { password: THROWAWAY },
    });

    expect(response.status).toBe(201);
}

async function runAccounts(served: Served): Promise<void> {
    const engine = served.harness.container.resolve(AppToken.ENGINE);

    await engine.dispatch({
        agent: 'assistant',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });
    await engine.idle();
}

const wireOf = (server: FakeImap) => server.commands.join('\n');

describe('a mail account that exists only in the store (#197)', () => {
    it('never sends a leftover env secret to its host: after a restart the test and the tools log in with the stored values', async () => {
        const host = await fake();
        const store = createMemoryStore();
        const first = await serve(store, LEFTOVER_ENV);

        await createWork(first, host.port);
        await stop(first);

        const second = await serve(store, LEFTOVER_ENV);
        const tested = await second.call('POST', '/connections/mail-work/test');

        expect(await tested.json()).toEqual({ ok: true });
        await runAccounts(second);

        const view = await (await second.call('GET', '/connections/mail-work/config')).json() as { fields: { key: string; source: { kind: string } }[] };

        expect(wireOf(host)).toContain(THROWAWAY);
        expect(wireOf(host)).not.toContain(LEFTOVER);
        expect(wireOf(host)).not.toContain(LEFTOVER_USER);
        expect(view.fields.find((field) => field.key === 'password')?.source).toEqual({ kind: 'store' });
        expect(view.fields.find((field) => field.key === 'user')?.source).toEqual({ kind: 'unset' });
    });

    it('never sends it without a restart either: deleted, added again with another host and tested', async () => {
        const original = await fake();
        const host = await fake();
        const store = createMemoryStore();

        // the row of an account whose password the environment used to provide
        await createConnectionConfigStore({ store, keyring: () => keyring }).create('mail-work', MAIL_CONNECTION_TYPE, {
            settings: {
                address: 'bob@y.test',
                host: '127.0.0.1',
                port: original.port,
                security: 'plain',
            },
        });

        const served = await serve(store, LEFTOVER_ENV);
        const deleted = await served.call('DELETE', '/connections/mail-work');

        expect(deleted.status).toBe(200);
        await createWork(served, host.port);

        const tested = await served.call('POST', '/connections/mail-work/test');

        expect(await tested.json()).toEqual({ ok: true });
        expect(wireOf(host)).toContain(THROWAWAY);
        expect(wireOf(host)).not.toContain(LEFTOVER);
        expect(wireOf(host)).not.toContain(LEFTOVER_USER);
        expect(wireOf(original)).not.toContain(LEFTOVER);
    });

    it('warns at the start naming each ignored variable, never a value', async () => {
        const host = await fake();
        const store = createMemoryStore();
        const first = await serve(store, {});

        await createWork(first, host.port);
        await stop(first);
        logLines.length = 0;

        await serve(store, { CHAMVI_MAIL_WORK_PASSWORD_FILE: '/no/such/file', CHAMVI_MAIL_WORK_USER: LEFTOVER_USER });

        const warnings = logLines.filter((line) => line.includes('"level":"warn"')).join('\n');

        expect(warnings).toContain('CHAMVI_MAIL_WORK_PASSWORD_FILE');
        expect(warnings).toContain('CHAMVI_MAIL_WORK_USER');
        expect(warnings).toContain('CHAMVI_MAIL_ACCOUNTS');
        expect(logLines.join('\n')).not.toContain(LEFTOVER_USER);
        expect(logLines.join('\n')).not.toContain('/no/such/file');
    });
});
