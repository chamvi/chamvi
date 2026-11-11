/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { Events } from 'discord.js';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { createKeyring, defineModelAgent } from '@chamvi/core';
import type { IConnectionHandle } from '@chamvi/core';
import { ControllableClock, textModel } from '@chamvi/test-kit';
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
import { discordModule } from '@chamvi/chat-discord/module';
import type { DiscordModuleOptions } from '@chamvi/chat-discord/module';
import { verifyDiscordToken } from '../../../src/discord/verify.ts';
import {
    ALICE,
    GUILD,
    SENTINEL_TOKEN,
    createFakeClients,
    createMemoryState,
    settle,
} from '../../utils/discord.ts';

const APP_ID = '100000000000000009';
const TOKEN = 'a-static-token-of-length';
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.stop()));
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

type ServeInput = {
    moduleEnv?: Record<string, string>;
    appEnv?: Record<string, string>;
    patch?: Partial<DiscordModuleOptions>;
    /** A second module, named and configured on its own. */
    second?: Partial<DiscordModuleOptions>;
};

async function serve(input: ServeInput = {}) {
    const port = await freePort();
    const clock = new ControllableClock(new Date('2026-11-09T09:00:00Z'));
    const lines: string[] = [];
    const clients = createFakeClients();
    const module = discordModule({
        env: input.moduleEnv ?? {},
        resolveInvoker: (identity) => ({
            id: identity.author,
            kind: 'discord',
            permissions: [],
        }),
        state: createMemoryState(),
        clientFactory: clients.factory,
        ...input.patch,
    });
    const second = input.second && discordModule({
        env: input.moduleEnv ?? {},
        resolveInvoker: (identity) => ({
            id: identity.author,
            kind: 'discord',
            permissions: [],
        }),
        state: createMemoryState(),
        clientFactory: clients.factory,
        ...input.second,
    });
    const harness = await createModuleHarness({
        env: {
            CHAMVI_TOKENS: JSON.stringify([{
                value: TOKEN,
                id: 'ops',
                permissions: ['*'],
            }]),
            HOST: '127.0.0.1',
            PORT: String(port),
            ...input.appEnv,
        },
        keyring,
        agents: [defineModelAgent({
            name: 'assistant',
            model: textModel(),
            instructions: 'Answer.',
            channels: [module.on()],
        })],
        modules: [
            configModule({
                clock,
                logger: createLogger({
                    level: 'debug',
                    clock,
                    write: (line) => {
                        lines.push(line);
                    },
                }),
            }),
            storeModule(),
            staticTokensModule(),
            engineModule(),
            httpModule({ metrics: false, rateLimit: false }),
            module,
            ...(second ? [second] : []),
        ],
    });

    harnesses.push(harness);

    return {
        harness,
        clients,
        lines,
        call: (method: string, path: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        }),
    };
}

type Recorded = { url: string; authorization: string | null };

function discordApi(status = 200): { fetch: typeof fetch; calls: Recorded[] } {
    const calls: Recorded[] = [];

    return {
        calls,
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') });

            return new Response(JSON.stringify({ id: APP_ID, message: `token ${SENTINEL_TOKEN} bad` }), { status });
        }) as typeof fetch,
    };
}

const ENV = {
    CHAMVI_DISCORD_TOKEN: SENTINEL_TOKEN,
    CHAMVI_DISCORD_APPLICATION_ID: APP_ID,
    CHAMVI_DISCORD_GUILDS: GUILD,
    CHAMVI_DISCORD_USERS: ALICE,
};
const PUBLIC = { CHAMVI_PUBLIC_URL: 'https://chamvi.example' };

describe('the Discord connection test', () => {
    it('calls GET /users/@me with the bot token', async () => {
        const api = discordApi();
        const { call } = await serve({
            moduleEnv: ENV,
            appEnv: PUBLIC,
            patch: { fetch: api.fetch, apiUrl: 'https://discord.test/api' },
        });

        const response = await call('POST', '/connections/discord/test', { secrets: { token: 'unsaved' } });

        expect(await response.json()).toEqual({ ok: true });
        expect(api.calls).toEqual([{ url: 'https://discord.test/api/users/@me', authorization: `Bot ${SENTINEL_TOKEN}` }]);
    });

    it('tests each module against its own API, not the first module\'s', async () => {
        const first = discordApi();
        const other = discordApi();
        const { call } = await serve({
            moduleEnv: {
                ...ENV,
                CHAMVI_DISCORD_EU_TOKEN: 'eu-token',
                CHAMVI_DISCORD_EU_APPLICATION_ID: APP_ID,
            },
            appEnv: PUBLIC,
            patch: { fetch: first.fetch, apiUrl: 'https://discord.test/api' },
            second: {
                name: 'eu',
                fetch: other.fetch,
                apiUrl: 'https://discord.eu.test/api',
            },
        });

        expect(await (await call('POST', '/connections/eu/test')).json()).toEqual({ ok: true });
        expect(other.calls).toEqual([{ url: 'https://discord.eu.test/api/users/@me', authorization: 'Bot eu-token' }]);
        expect(first.calls).toEqual([]);

        expect(await (await call('POST', '/connections/discord/test')).json()).toEqual({ ok: true });
        expect(first.calls).toEqual([{ url: 'https://discord.test/api/users/@me', authorization: `Bot ${SENTINEL_TOKEN}` }]);
    });

    it('reports a refused token without a value or the server text', async () => {
        const api = discordApi(401);
        const { call, lines } = await serve({
            moduleEnv: ENV,
            appEnv: PUBLIC,
            patch: { fetch: api.fetch },
        });

        const text = await (await call('POST', '/connections/discord/test')).text();

        expect(JSON.parse(text)).toEqual({ ok: false, message: 'Discord refused the bot token.' });
        expect(text).not.toContain(SENTINEL_TOKEN);
        expect(lines.join('\n')).not.toContain(SENTINEL_TOKEN);
    });

    it.each([200, 401, 500])('releases the response body on status %i', async (status) => {
        const responses: Response[] = [];
        const pending = verifyDiscordToken('t', {
            signal: new AbortController().signal,
            fetch: (async () => {
                const response = new Response('{"id":"1"}', { status });

                responses.push(response);

                return response;
            }) as typeof fetch,
        });

        await (status === 200 ? expect(pending).resolves.toBeUndefined() : expect(pending).rejects.toThrow(/Discord/));
        expect(responses.map((response) => response.bodyUsed)).toEqual([true]);
    });

    it('reports the status when the body cancellation never settles', async () => {
        const pending = verifyDiscordToken('t', {
            signal: new AbortController().signal,
            fetch: (async () => {
                const response = new Response('{"id":"1"}', { status: 401 });

                // the unread branch of a clone keeps a cancel of the other one pending
                response.clone();

                return response;
            }) as typeof fetch,
        });

        const settled = await Promise.race([
            pending.then(() => 'resolved', (error: Error) => error.message),
            new Promise((resolve) => {
                setTimeout(resolve, 200, 'pending');
            }),
        ]);

        expect(settled).toBe('Discord refused the bot token.');
    });

    it('is bounded by its signal', async () => {
        const controller = new AbortController();
        const reason = new Error('stop');
        let started = false;
        const pending = verifyDiscordToken('t', {
            signal: controller.signal,
            fetch: ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
                started = true;
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            })) as typeof fetch,
        });

        await expect.poll(() => started).toBe(true);
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
    });
});

describe('the Discord connection handle', () => {
    it('reports a live bot, so the dashboard does not read it as disconnected', async () => {
        const {
            call, 
            clients, 
            harness, 
        } = await serve({ moduleEnv: ENV, appEnv: PUBLIC });
        const [handle] = harness.container.resolveAll(AppToken.CONNECTIONS) as IConnectionHandle[];
        let changes = 0;

        const unsubscribe = handle!.subscribe(() => {
            changes++;
        });

        await settle();
        clients.last().emit(Events.ClientReady);
        await settle();

        const body = await (await call('GET', '/connections')).json() as { data: Record<string, unknown>[] };

        expect(handle!.type).toBe('discord');
        expect(handle!.widgets()).toEqual([]);
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
            name: 'discord',
            status: handle!.status(),
            state: 'configured',
        });
        expect(body.data[0]!.live).toBeUndefined();
        expect(handle!.status()).toBe('connected');
        expect(changes).toBeGreaterThan(0);
        unsubscribe();
    });

    it('tells the handle\'s subscribers even when the app\'s status callback throws', async () => {
        const { clients, harness } = await serve({
            moduleEnv: ENV,
            appEnv: PUBLIC,
            patch: {
                onStatusChange: () => {
                    throw new Error('app callback');
                },
            },
        });
        const [handle] = harness.container.resolveAll(AppToken.CONNECTIONS) as IConnectionHandle[];
        let changes = 0;
        const unsubscribe = handle!.subscribe(() => {
            changes++;
        });

        await settle();
        clients.last().emit(Events.ClientReady);
        await settle();

        expect(handle!.status()).toBe('connected');
        expect(changes).toBeGreaterThan(0);
        unsubscribe();
    });

    it('lists a module with a policy in code alone as not configured, not incomplete', async () => {
        const { call } = await serve({ appEnv: PUBLIC, patch: { policy: { guilds: [GUILD] } } });
        const listed = await (await call('GET', '/connections')).json() as { data: Record<string, unknown>[] };
        const config = await (await call('GET', '/connections/discord/config')).json() as Record<string, unknown>;

        expect(listed.data).toEqual([expect.objectContaining({ name: 'discord', state: 'not_configured' })]);
        expect(listed.data[0]!.missing).toBeUndefined();
        expect(config.state).toBe('not_configured');
    });

    it('contributes no handle while idle', async () => {
        const { harness } = await serve({ appEnv: PUBLIC });

        expect(harness.container.resolveAll(AppToken.CONNECTIONS)).toEqual([]);
    });
});
