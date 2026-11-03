/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Characterization of the external boundary (Task 1 gate), against the real npm
// packages @chat-adapter/discord 4.44.0 and chat 4.44.0. Tests prefixed "native:"
// record upstream behaviour as it is, limitations included
// (.agents/references/chat-sdk.md, Discord section).

import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { createDiscordAdapter } from '@chat-adapter/discord';
import type { DiscordAdapter, DiscordAdapterConfig } from '@chat-adapter/discord';
import type { ChatInstance, Logger } from 'chat';
import { Message } from 'chat';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { chatAddress } from '@chamvi/chat';

const TOKEN = 'explicit-token';
const APPLICATION_ID = '100000000000000001';
const API_URL = 'https://discord.test/api/v10';

const SENTINELS = {
    DISCORD_BOT_TOKEN: 'sentinel-env-token',
    DISCORD_PUBLIC_KEY: 'a'.repeat(64),
    DISCORD_APPLICATION_ID: '999999999999999999',
    DISCORD_API_URL: 'https://sentinel.invalid/api',
    DISCORD_MENTION_ROLE_IDS: '777',
    DISCORD_RESPOND_TO_CHANNEL_IDS: '888',
} as const;

type LogEntry = { level: string; message: string };

function createRecordingLogger(entries: LogEntry[] = []): Logger {
    const log = (level: string) => (message: string) => {
        entries.push({ level, message });
    };

    return {
        child: () => createRecordingLogger(entries),
        debug: log('debug'),
        info: log('info'),
        warn: log('warn'),
        error: log('error'),
    };
}

function explicitConfig(logger: Logger): DiscordAdapterConfig {
    return {
        botToken: TOKEN,
        applicationId: APPLICATION_ID,
        apiUrl: API_URL,
        mentionRoleIds: [],
        respondToChannelIds: [],
        respondToGlobalMentions: false,
        webhookVerifier: () => false,
        logger,
        userName: 'chamvi',
    };
}

function stubSentinels() {
    for (const [key, value] of Object.entries(SENTINELS)) {
        vi.stubEnv(key, value);
    }
}

function fakeChat(received: Message[] = []): ChatInstance {
    return {
        handleIncomingMessage: async (_adapter: unknown, _threadId: string, message: Message) => {
            received.push(message);
        },
    } as unknown as ChatInstance;
}

type RawOverrides = Record<string, unknown>;

function rawMessage(overrides: RawOverrides = {}): Record<string, unknown> {
    return {
        id: '300000000000000001',
        type: 0,
        channel_id: '200000000000000001',
        guild_id: '400000000000000001',
        author: {
            id: '500000000000000001',
            username: 'ada',
            global_name: 'Ada',
        },
        content: 'hello **world**',
        timestamp: '2026-11-03T10:00:00.000Z',
        edited_timestamp: null,
        attachments: [],
        embeds: [],
        mentions: [],
        mention_roles: [],
        mention_everyone: false,
        pinned: false,
        tts: false,
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('@chat-adapter/discord 4.44.0 packaging', () => {
    it('native: the installed adapter is exactly 4.44.0', () => {
        const path = findPackageJSON('@chat-adapter/discord', import.meta.url);

        expect(path).toBeTypeOf('string');
        expect(JSON.parse(readFileSync(path!, 'utf8')).version).toBe('4.44.0');
    });

    it('native: the adapter resolves the same chat copy as the workspace', () => {
        const adapterPackage = findPackageJSON('@chat-adapter/discord', import.meta.url);
        const fromAdapter = findPackageJSON('chat', adapterPackage!);
        const fromWorkspace = findPackageJSON('chat', import.meta.url);

        expect(fromAdapter).toBe(fromWorkspace);
        expect(JSON.parse(readFileSync(fromWorkspace!, 'utf8')).version).toBe('4.44.0');

        const adapter = createDiscordAdapter(explicitConfig(createRecordingLogger()));

        expect(adapter.parseMessage(rawMessage())).toBeInstanceOf(Message);
    });
});

describe('@chat-adapter/discord 4.44.0 explicit options', () => {
    it('native: the constructor reads env vars for options left undefined', () => {
        stubSentinels();

        const adapter = createDiscordAdapter({ logger: createRecordingLogger() });

        expect(adapter.botUserId).toBe(SENTINELS.DISCORD_APPLICATION_ID);
    });

    it('native: an adapter with every option explicit uses none of the env vars', async () => {
        stubSentinels();

        const requests: Request[] = [];

        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push(new Request(input, init));

            return new Response(JSON.stringify({ id: '1', username: 'u' }), { status: 200 });
        });

        const entries: LogEntry[] = [];
        const adapter = createDiscordAdapter(explicitConfig(createRecordingLogger(entries)));

        expect(adapter.botUserId).toBe(APPLICATION_ID);
        expect(adapter.userName).toBe('chamvi');
        expect(adapter.decodeThreadId('discord:1:2:3')).toEqual({
            guildId: '1',
            channelId: '2',
            threadId: '3',
        });
        expect(adapter.isDM('discord:@me:2')).toBe(true);
        expect(adapter.isDM('discord:1:2')).toBe(false);
        expect(adapter.parseMessage(rawMessage({ author: { id: APPLICATION_ID, username: 'bot' } })).author.isMe).toBe(true);

        // apiUrl and botToken: the one REST call goes to the explicit base with the explicit token
        await adapter.getUser('1');

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe(`${API_URL}/users/1`);
        expect(requests[0]!.headers.get('authorization')).toBe(`Bot ${TOKEN}`);

        // mentionRoleIds, respondToChannelIds, respondToGlobalMentions: a forwarded Gateway
        // message naming the sentinel role and channel, and @everyone, is no mention
        const received: Message[] = [];

        await adapter.initialize(fakeChat(received));

        const response = await adapter.handleWebhook(new Request('https://chamvi.test/webhook', {
            method: 'POST',
            headers: { 'x-discord-gateway-token': TOKEN },
            body: JSON.stringify({
                type: 'GATEWAY_MESSAGE_CREATE',
                timestamp: 0,
                data: {
                    ...rawMessage({ channel_id: '600000000000000001' }),
                    thread: { id: '600000000000000001', parent_id: SENTINELS.DISCORD_RESPOND_TO_CHANNEL_IDS },
                    mention_roles: [SENTINELS.DISCORD_MENTION_ROLE_IDS],
                    mention_everyone: true,
                },
            }),
        }));

        expect(response.status).toBe(200);
        expect(received).toHaveLength(1);
        expect(received[0]!.isMention).toBeUndefined();
        expect(requests).toHaveLength(1);

        // the explicit logger, not the console default
        expect(entries.some((entry) => entry.message === 'Discord adapter initialized')).toBe(true);
    });

    it('native: initialize with a string applicationId makes no network call', async () => {
        const fetch = vi.fn(async () => {
            throw new Error('no network in this test');
        });

        vi.stubGlobal('fetch', fetch);

        const adapter = createDiscordAdapter(explicitConfig(createRecordingLogger()));

        await expect(adapter.initialize(fakeChat())).resolves.toBeUndefined();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('native: a refusing webhookVerifier answers an interaction request 401 without a call', async () => {
        const fetch = vi.fn(async () => new Response('{}'));

        vi.stubGlobal('fetch', fetch);

        const received: Message[] = [];
        const adapter = createDiscordAdapter(explicitConfig(createRecordingLogger()));

        await adapter.initialize(fakeChat(received));

        const response = await adapter.handleWebhook(new Request('https://chamvi.test/webhook', {
            method: 'POST',
            body: JSON.stringify({ type: 1 }),
        }));

        expect(response.status).toBe(401);
        expect(received).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('native: a forwarded Gateway event with the bot token skips the webhookVerifier', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));

        const verifier = vi.fn(() => false);
        const received: Message[] = [];
        const adapter = createDiscordAdapter({
            ...explicitConfig(createRecordingLogger()),
            webhookVerifier: verifier,
        });

        await adapter.initialize(fakeChat(received));

        const forwarded = (token: string) => adapter.handleWebhook(new Request('https://chamvi.test/webhook', {
            method: 'POST',
            headers: { 'x-discord-gateway-token': token },
            body: JSON.stringify({
                type: 'GATEWAY_MESSAGE_CREATE',
                timestamp: 0,
                data: { ...rawMessage(), thread: { id: '600000000000000001', parent_id: '200000000000000001' } },
            }),
        }));

        expect((await forwarded('wrong')).status).toBe(401);
        expect(received).toHaveLength(0);
        expect((await forwarded(TOKEN)).status).toBe(200);
        expect(received).toHaveLength(1);
        expect(verifier).not.toHaveBeenCalled();
    });
});

describe('@chat-adapter/discord 4.44.0 parseMessage', () => {
    let adapter: DiscordAdapter;

    function build() {
        adapter = createDiscordAdapter(explicitConfig(createRecordingLogger()));

        return adapter;
    }

    it('native: a guild top-level message gets the 3-part id of its channel', () => {
        const message = build().parseMessage(rawMessage({
            attachments: [{
                id: '1',
                filename: 'a.png',
                content_type: 'image/png',
                size: 3,
                url: 'https://cdn.discordapp.com/a.png',
                proxy_url: 'https://media.discordapp.net/a.png',
            }],
        }));

        expect(message.threadId).toBe('discord:400000000000000001:200000000000000001');
        expect(message.isMention).toBeUndefined();
        expect(message.text).toBe('hello world');
        expect(message.author.userId).toBe('500000000000000001');
        expect(message.author.userName).toBe('ada');
        expect(message.author.fullName).toBe('Ada');
        expect(message.author.isBot).toBe(false);
        expect(message.author.isMe).toBe(false);
        expect(message.attachments).toHaveLength(1);
        expect(message.metadata.dateSent).toEqual(new Date('2026-11-03T10:00:00.000Z'));
        expect(message.metadata.edited).toBe(false);
    });

    it('native: a thread message gets the thread\'s own id as channel, no parent and no thread segment', () => {
        const message = build().parseMessage(rawMessage({ channel_id: '600000000000000001' }));

        expect(message.threadId).toBe('discord:400000000000000001:600000000000000001');
        expect(message.threadId.split(':')).toHaveLength(3);
        expect(message.isMention).toBeUndefined();
        expect(message.attachments).toHaveLength(0);
    });

    it('native: a DM gets the @me id of its DM channel', () => {
        const raw = rawMessage({ channel_id: '700000000000000001' });

        delete raw.guild_id;

        const message = build().parseMessage(raw);

        expect(message.threadId).toBe('discord:@me:700000000000000001');
        expect(adapter.isDM(message.threadId)).toBe(true);
        expect(message.isMention).toBeUndefined();
        expect(message.text).toBe('hello world');
        expect(message.author.userId).toBe('500000000000000001');
    });

    it('native: parseMessage keeps a direct user mention undetermined', () => {
        const message = build().parseMessage(rawMessage({
            content: `<@${APPLICATION_ID}> hi`,
            mentions: [{ id: APPLICATION_ID, username: 'chamvi' }],
        }));

        expect(message.isMention).toBeUndefined();
    });
});

describe('@chat-adapter/discord 4.44.0 thread ids', () => {
    it('native: encodeThreadId with a parent and a thread gives 4 parts and decodeThreadId round-trips', () => {
        const adapter = createDiscordAdapter(explicitConfig(createRecordingLogger()));
        const parts = {
            guildId: '400000000000000001',
            channelId: '200000000000000001',
            threadId: '600000000000000001',
        };
        const threadId = adapter.encodeThreadId(parts);

        expect(threadId).toBe('discord:400000000000000001:200000000000000001:600000000000000001');
        expect(adapter.decodeThreadId(threadId)).toEqual(parts);
        expect(adapter.decodeThreadId('discord:@me:7')).toEqual({
            guildId: '@me',
            channelId: '7',
            threadId: undefined,
        });
        expect(() => adapter.decodeThreadId('whatsapp:abc')).toThrow();
    });

    it('the longest realistic thread id stays within the 255 address bound', () => {
        const adapter = createDiscordAdapter(explicitConfig(createRecordingLogger()));
        const snowflake = '9'.repeat(20);
        const threadId = adapter.encodeThreadId({
            guildId: snowflake,
            channelId: snowflake,
            threadId: snowflake,
        });

        expect(threadId).toHaveLength('discord:'.length + (3 * 20) + 2);

        const address = chatAddress({ adapter: 'discord', threadId });

        expect(address.length).toBeLessThanOrEqual(255);
    });
});
