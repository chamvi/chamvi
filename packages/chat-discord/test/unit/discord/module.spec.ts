/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConsoleLogger } from 'chat';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError, defineAgent } from '@chamvi/core';
import {
    configModule,
    createApp,
    createLogger,
} from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import * as pkg from '@chamvi/chat';
import { chatModule } from '@chamvi/chat/module';
import { createDiscordChat } from '@chamvi/chat-discord';
import type { DiscordChatOptions } from '@chamvi/chat-discord';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import {
    ACCOUNT,
    ALICE,
    APPROVAL_URL,
    BOT,
    GUILD,
    SENTINEL_TOKEN,
    createFakeClients,
    createFakeFetch,
    createMemoryState,
} from '../../utils/discord.ts';

function baseOptions(): DiscordChatOptions {
    return {
        account: ACCOUNT,
        token: SENTINEL_TOKEN,
        applicationId: BOT,
        policy: { guilds: [GUILD], users: [ALICE] },
        resolveInvoker: () => ({
            id: 'a',
            kind: 'discord',
            permissions: [],
        }),
        state: createMemoryState(),
        approvalUrl: APPROVAL_URL,
        logger: new ConsoleLogger('error'),
        clientFactory: createFakeClients().factory,
        fetch: createFakeFetch().fetch,
    };
}

describe('createDiscordChat options', () => {
    it.each([
        ['options', undefined],
        ['account', { account: '' }],
        ['account', { account: 'a\0b' }],
        ['token', { token: '' }],
        ['token', { token: 42 }],
        ['token', { token: undefined }],
        ['applicationId', { applicationId: '' }],
        ['applicationId', { applicationId: undefined }],
        ['policy', { policy: undefined }],
        ['policy.guilds', { policy: { guilds: ['general'] } }],
        ['policy.users', { policy: { guilds: [GUILD], users: 'everyone' } }],
        ['policy.dms', { policy: { guilds: [GUILD], dms: true } }],
        ['state', { state: undefined }],
        ['resolveInvoker', { resolveInvoker: undefined }],
        ['approvalUrl', { approvalUrl: undefined }],
        ['onError', { onError: 'log' }],
        ['clientFactory', { clientFactory: {} }],
        ['fetch', { fetch: 'https://discord.com' }],
        ['apiUrl', { apiUrl: 'discord.com/api' }],
        ['apiUrl', { apiUrl: 'ftp://discord.com/api' }],
        ['apiUrl', { apiUrl: 'https://proxy.example/api/v10?tenant=one' }],
        ['apiUrl', { apiUrl: 'https://proxy.example/api/v10#x' }],
        ['userName', { userName: '' }],
    ])('refuses an invalid %s', (name, patch) => {
        const options = patch === undefined ? undefined : { ...baseOptions(), ...patch };
        const build = () => createDiscordChat(options as DiscordChatOptions);

        expect(build).toThrow(InvalidAgentDefinitionError);
        expect(build).toThrow(/^createDiscordChat: /);
        expect(build).toThrow(name);
    });

    it('never echoes the token or a refused policy entry', () => {
        let error: unknown;

        try {
            createDiscordChat({ ...baseOptions(), policy: { guilds: ['secret-guild'] } });
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).not.toContain('secret');
        expect((error as Error).message).not.toContain(SENTINEL_TOKEN);
    });

    it('takes a token provider and reads it neither in the factory nor before start', () => {
        let reads = 0;
        const clients = createFakeClients();
        const setup = createDiscordChat({
            ...baseOptions(),
            token: async () => {
                reads += 1;

                return SENTINEL_TOKEN;
            },
            clientFactory: clients.factory,
        });

        expect(reads).toBe(0);
        expect(clients.clients).toEqual([]);
        expect(setup.status()).toBe('stopped');
    });
});

describe('@chamvi/chat-discord', () => {
    it('keeps @chamvi/chat\'s main entry free of Discord', () => {
        expect(Object.keys(pkg).filter((key) => /discord/i.test(key))).toEqual([]);
    });

    it('wires the Chat, the ingress and the channel without a client or a token read', () => {
        const clients = createFakeClients();
        const fetch = createFakeFetch();
        const setup = createDiscordChat({
            ...baseOptions(),
            clientFactory: clients.factory,
            fetch: fetch.fetch,
        });

        expect(setup.chat.getAdapter('discord')).toBe(setup.ingress);
        expect(setup.channel.name).toBe('chat');
        expect(setup.channel.untrusted).toBe(true);
        expect(setup.channel.in).toBeUndefined();
        expect(clients.clients).toEqual([]);
        expect(fetch.calls).toEqual([]);
        expect(setup.status()).toBe('stopped');
    });

    it('takes the name and the trust option', () => {
        const setup = createDiscordChat({
            ...baseOptions(),
            name: 'discord-ops',
            untrusted: false,
        });

        expect(setup.channel.name).toBe('discord-ops');
        expect(setup.channel.untrusted).toBe(false);
    });
});

const TOKENS = JSON.stringify([{
    value: 'a-static-token-of-length',
    id: 'ops',
    permissions: ['*'],
}]);

const apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop()));
    apps.length = 0;
});

describe('chatModule under start --check', () => {
    it('check_no_client_or_token_read for a Discord setup', async () => {
        const stateCalls: string[] = [];
        const clients = createFakeClients();
        const fetch = createFakeFetch();
        let reads = 0;
        const setup = createDiscordChat({
            ...baseOptions(),
            token: async () => {
                reads += 1;

                return SENTINEL_TOKEN;
            },
            state: createMemoryState(stateCalls),
            clientFactory: clients.factory,
            fetch: fetch.fetch,
        });
        const app = createApp({
            agents: [defineAgent({
                name: 'assistant',
                model: textModel(),
                instructions: 'Answer.',
                channels: [setup.channel.on()],
            })],
            modules: [
                configModule({
                    clock: new ControllableClock(new Date('2026-11-03T09:00:00Z')),
                    logger: createLogger({ level: 'error', write: () => undefined }),
                }),
                chatModule({ channel: setup.channel }),
            ],
        });

        apps.push(app);

        await expect(app.check({ env: { CHAMVI_TOKENS: TOKENS, PORT: '4998' } })).resolves.toEqual({ issues: [] });

        expect(reads).toBe(0);
        expect(clients.clients).toEqual([]);
        expect(fetch.calls).toEqual([]);
        expect(stateCalls).toEqual([]);
        expect(setup.status()).toBe('stopped');
    });
});
