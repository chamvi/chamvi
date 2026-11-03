/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { Events } from 'discord.js';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { IApp } from '@chamvi/app';
import { DISCORD_API_URL } from '@chamvi/chat-discord';
import { mockModel, textModel } from '@chamvi/test-kit';
import { createDiscordApp } from '../fixtures/readme-example.ts';
import {
    ALICE,
    BOT,
    CHANNEL,
    GUILD,
    MALLORY,
    SENTINEL_TOKEN,
    bodyOf,
    createFakeClients,
    createFakeFetch,
    createMemoryState,
    discordMessage,
    settle,
} from '../utils/discord.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const TOKENS = JSON.stringify([{
    value: 'a-static-token-of-length',
    id: 'ops',
    permissions: ['*'],
}]);

const apps: IApp[] = [];

afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(apps.map((app) => app.stop().catch(() => undefined)));
    apps.length = 0;
});

function stubEnv() {
    vi.stubEnv('DISCORD_BOT_TOKEN', SENTINEL_TOKEN);
    vi.stubEnv('DISCORD_APPLICATION_ID', BOT);
    vi.stubEnv('DISCORD_GUILD_ID', GUILD);
    vi.stubEnv('DISCORD_USER_IDS', ALICE);
    vi.stubEnv('APP_URL', 'https://chamvi.example');
}

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

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('imports only the public entries and never a test helper', () => {
        const imports = read('../fixtures/readme-example.ts').matchAll(/from '([^']+)'/g).map((m) => m[1]).toArray();

        expect(imports.sort()).toEqual([
            '@chamvi/app',
            '@chamvi/app',
            '@chamvi/chat-discord',
            '@chamvi/chat-discord',
            '@chamvi/chat/module',
            'ai',
            'zod',
        ]);
    });

    it('makes no client and calls nothing before the app starts, not even under start --check', async () => {
        stubEnv();

        const clients = createFakeClients();
        const fetch = createFakeFetch();
        const stateCalls: string[] = [];
        const app = createDiscordApp(textModel(), {
            state: createMemoryState(stateCalls),
            clientFactory: clients.factory,
            fetch: fetch.fetch,
        });

        apps.push(app);

        await expect(app.check({
            env: {
                CHAMVI_TOKENS: TOKENS, 
                PORT: '4997', 
                CHAMVI_LOG_LEVEL: 'error', 
            }, 
        })).resolves.toEqual({ issues: [] });

        expect(clients.clients).toEqual([]);
        expect(fetch.calls).toEqual([]);
        expect(stateCalls).toEqual([]);
    });

    it('answers an allowed user in the same channel without pings, and ignores a stranger', async () => {
        stubEnv();

        const clients = createFakeClients();
        const fetch = createFakeFetch();
        const app = createDiscordApp(mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'reply',
                    input: { text: 'Hello Ada.' },
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]), {
            state: createMemoryState(),
            clientFactory: clients.factory,
            fetch: fetch.fetch,
        });

        apps.push(app);

        const port = await freePort();

        await app.start({
            env: {
                HOST: '127.0.0.1',
                PORT: String(port),
                CHAMVI_TOKENS: TOKENS,
                CHAMVI_LOG_LEVEL: 'error',
            },
        });

        const client = clients.last();

        expect(client.logins).toEqual([SENTINEL_TOKEN]);

        client.resolveLogin();
        client.emit(Events.ClientReady, client);
        client.emit(Events.MessageCreate, discordMessage({ id: '300000000000000009', author: { id: MALLORY } }));
        client.emit(Events.MessageCreate, discordMessage());

        for (let i = 0; i < 200 && fetch.calls.length === 0; i++) {
            await settle();
        }

        expect(fetch.calls).toHaveLength(1);
        expect(fetch.calls[0]?.url).toBe(`${DISCORD_API_URL}/channels/${CHANNEL}/messages`);
        expect(bodyOf(fetch.calls[0])).toEqual(expect.objectContaining({
            content: 'Hello Ada.',
            allowed_mentions: { parse: [] },
            enforce_nonce: true,
        }));

        await app.stop();

        expect(client.destroyed).toBe(1);
        expect(fetch.calls).toHaveLength(1);
    });

    it('needs the bot settings and the app URL', () => {
        stubEnv();
        vi.stubEnv('DISCORD_GUILD_ID', '');

        expect(() => createDiscordApp(textModel(), { state: createMemoryState() })).toThrow('DISCORD_GUILD_ID');
    });
});
