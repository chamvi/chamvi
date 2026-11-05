/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Fake discord.js messages, channels and clients: plain objects of the
// structural subset chamvi reads (DiscordInboundMessage, DiscordClient), so no
// discord.js runtime runs, plus a fake fetch and createDiscordFixture().

import { ChannelType, Events } from 'discord.js';
import type { ClientOptions } from 'discord.js';
import { ConsoleLogger } from 'chat';
import type {
    Lock,
    QueueEntry,
    StateAdapter,
} from 'chat';
import { Engine, createMemoryStore, defineModelAgent } from '@chamvi/core';
import type {
    Agent,
    ConversationAccess,
    IChannel,
    IStore,
    Run,
} from '@chamvi/core';
import type { ChatApprovalRef, ChatChannel } from '@chamvi/chat';
import { createDiscordChat } from '@chamvi/chat-discord';
import type { DiscordChatOptions, DiscordChatSetup } from '@chamvi/chat-discord';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import type { DiscordClient, DiscordClientFactory, DiscordInboundMessage } from '../../src/discord/types.ts';

export const ACCOUNT = 'support';
export const BOT = '100000000000000001';
export const GUILD = '400000000000000001';
export const OTHER_GUILD = '400000000000000002';
export const CHANNEL = '200000000000000001';
export const OTHER_CHANNEL = '200000000000000002';
export const THREAD = '600000000000000001';
export const DM_CHANNEL = '700000000000000001';
export const ALICE = '500000000000000001';
export const MALLORY = '500000000000000002';
export const ROLE = '800000000000000001';
export const OTHER_ROLE = '800000000000000002';

export type FakeChannel = DiscordInboundMessage['channel'] & { id: string };

function channel(id: string, type: number, thread: boolean, parentId?: string | null): FakeChannel {
    return {
        id,
        type,
        isThread: () => thread,
        ...(parentId === undefined ? {} : { parentId }),
    };
}

export function guildText(id: string = CHANNEL): FakeChannel {
    return channel(id, ChannelType.GuildText, false, null);
}

export function publicThread(id: string = THREAD, parent: string | null = CHANNEL): FakeChannel {
    return channel(id, ChannelType.PublicThread, true, parent);
}

export function privateThread(id: string = THREAD, parent: string | null = CHANNEL): FakeChannel {
    return channel(id, ChannelType.PrivateThread, true, parent);
}

export function announcementThread(id: string = THREAD, parent: string | null = CHANNEL): FakeChannel {
    return channel(id, ChannelType.AnnouncementThread, true, parent);
}

/** A thread of a type this code does not know (a future Discord type). */
export function unknownThread(id: string = THREAD, parent: string | null = CHANNEL): FakeChannel {
    return channel(id, 99, true, parent);
}

export function dmChannel(id: string = DM_CHANNEL): FakeChannel {
    return channel(id, ChannelType.DM, false);
}

export function groupDmChannel(id: string = DM_CHANNEL): FakeChannel {
    return channel(id, ChannelType.GroupDM, false);
}

export type FakeAttachment = {
    id: string;
    name: string;
    contentType: string | null;
    size: number;
    url: string;
    proxyURL: string;
    width: number | null;
    height: number | null;
};

export function attachment(overrides: Partial<FakeAttachment> = {}): FakeAttachment {
    return {
        id: '900000000000000001',
        name: 'a.png',
        contentType: 'image/png',
        size: 3,
        url: 'https://cdn.discordapp.com/a.png',
        proxyURL: 'https://media.discordapp.net/a.png',
        width: 1,
        height: 1,
        ...overrides,
    };
}

export type DiscordMessageInput = {
    id?: string;
    content?: string;
    /** null: a DM (no guild) */
    guildId?: string | null;
    channel?: FakeChannel;
    author?: Partial<DiscordInboundMessage['author']>;
    /** the author's member role ids (guild only) */
    roles?: readonly string[];
    mentions?: {
        users?: readonly string[];
        repliedUser?: string;
        everyone?: boolean;
        roles?: readonly string[];
    };
    attachments?: readonly FakeAttachment[];
    webhookId?: string | null;
    createdAt?: Date;
    editedAt?: Date | null;
    type?: number;
};

/** A fake message; a guild text message of ALICE that mentions the bot by default. */
export function discordMessage(input: DiscordMessageInput = {}): DiscordInboundMessage {
    const guildId = input.guildId === undefined ? GUILD : input.guildId;
    const messageChannel = input.channel ?? (guildId === null ? dmChannel() : guildText());
    const mentions = input.mentions ?? { users: [BOT] };

    return {
        id: input.id ?? '300000000000000001',
        type: input.type ?? 0,
        content: input.content ?? `<@${BOT}> hello **world**`,
        createdAt: input.createdAt ?? new Date('2026-11-03T10:00:00.000Z'),
        editedAt: input.editedAt ?? null,
        webhookId: input.webhookId ?? null,
        guildId,
        channelId: messageChannel.id,
        channel: messageChannel,
        author: {
            id: ALICE,
            bot: false,
            username: 'ada',
            globalName: 'Ada',
            ...input.author,
        },
        member: guildId === null ?
            null :
            { roles: { cache: new Map((input.roles ?? []).map((role) => [role, { id: role }])) } },
        mentions: {
            users: new Map((mentions.users ?? []).map((id) => [id, { id }])),
            repliedUser: mentions.repliedUser === undefined ? null : { id: mentions.repliedUser },
            // read by nothing: the bot is addressed by user id only
            everyone: mentions.everyone ?? false,
            roles: new Map((mentions.roles ?? []).map((id) => [id, { id }])),
        } as DiscordInboundMessage['mentions'],
        attachments: new Map((input.attachments ?? []).map((item) => [item.id, item])),
    };
}

/** A fake discord.js client: listeners on a plain map, a login the test settles. */
export type FakeClient = DiscordClient & {
    readonly options: ClientOptions;
    /** every token login was called with */
    readonly logins: string[];
    /** how often destroy was called */
    destroyed: number;
    user: { id: string } | null;
    /** calls every listener of `event` */
    emit(event: string, ...args: unknown[]): void;
    /** how many listeners are attached in all */
    listenerCount(): number;
    resolveLogin(): void;
    rejectLogin(error: unknown): void;
};

export type FakeClients = {
    readonly factory: DiscordClientFactory;
    readonly clients: FakeClient[];
    last(): FakeClient;
    /** destroy() of the clients made from now on never settles */
    destroyHangs: boolean;
};

/** Each factory call records its options and returns a fake whose login hangs until the test settles it. */
export function createFakeClients(): FakeClients {
    const clients: FakeClient[] = [];
    const state: FakeClients = {
        clients,
        destroyHangs: false,
        last() {
            const client = clients.at(-1);

            if (!client) {
                throw new Error('no client was made');
            }

            return client;
        },
        factory: (options) => {
            const listeners = new Map<string, Set<(...args: any[]) => void>>();
            let resolveLogin: (token: string) => void = () => undefined;
            let rejectLogin: (error: unknown) => void = () => undefined;
            const hangs = state.destroyHangs;
            const client: FakeClient = {
                options,
                logins: [],
                destroyed: 0,
                user: { id: BOT },
                on(event, listener) {
                    let set = listeners.get(event);

                    if (!set) {
                        set = new Set();
                        listeners.set(event, set);
                    }

                    set.add(listener);

                    return client;
                },
                off(event, listener) {
                    listeners.get(event)?.delete(listener);

                    return client;
                },
                login(token) {
                    client.logins.push(token);

                    const login = Promise.withResolvers<string>();

                    resolveLogin = login.resolve;
                    rejectLogin = login.reject;

                    return login.promise;
                },
                destroy() {
                    client.destroyed += 1;

                    return hangs ? Promise.withResolvers<void>().promise : Promise.resolve();
                },
                emit(event, ...args) {
                    for (const listener of [...listeners.get(event) ?? []]) {
                        listener(...args);
                    }
                },
                listenerCount() {
                    let count = 0;

                    for (const set of listeners.values()) {
                        count += set.size;
                    }

                    return count;
                },
                resolveLogin: () => resolveLogin(client.logins.at(-1) ?? ''),
                rejectLogin: (error) => rejectLogin(error),
            };

            clients.push(client);

            return client;
        },
    };

    return state;
}

/** lets queued promise work run (no timers) */
export async function settle(rounds = 10): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}

/** A recorded fetch call: the URL and the init the sender passed. */
export type FetchCall = { url: string; init: RequestInit };

export type FakeFetch = {
    readonly fetch: typeof fetch;
    readonly calls: FetchCall[];
    /** answers a call; default a 200 with a Discord message of a fresh id */
    answer?: (call: FetchCall) => Response | Promise<Response>;
};

/** A fetch that records every call and answers like Discord's create-message route. */
export function createFakeFetch(): FakeFetch {
    const calls: FetchCall[] = [];
    let count = 0;
    const state: FakeFetch = {
        calls,
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
            const call = { url: String(input), init: init ?? {} };

            calls.push(call);

            if (state.answer) {
                return state.answer(call);
            }

            count += 1;

            return Response.json({ id: `90000000000000${String(count).padStart(4, '0')}` });
        }) as typeof fetch,
    };

    return state;
}

/** The JSON body of a recorded call. */
export function bodyOf(call: FetchCall | undefined): Record<string, unknown> {
    return JSON.parse(String(call?.init.body)) as Record<string, unknown>;
}

/** Every listener, login and destroy of the fake clients, to assert no client call happened. */
export function clientTrace(clients: FakeClients): string {
    return JSON.stringify(clients.clients.map((client) => ({
        listeners: client.listenerCount(),
        logins: client.logins.length,
        destroyed: client.destroyed,
    })));
}

/**
 * An in-memory Chat SDK StateAdapter (the SDK ships none in its main package),
 * every call recorded by method name.
 */
export function createMemoryState(calls: string[] = []): StateAdapter {
    const values = new Map<string, unknown>();
    const lists = new Map<string, unknown[]>();
    const queues = new Map<string, QueueEntry[]>();
    const subscriptions = new Set<string>();
    const locks = new Map<string, Lock>();

    const state: StateAdapter = {
        async acquireLock(threadId, ttlMs) {
            if (locks.has(threadId)) {
                return null;
            }

            const lock = {
                threadId,
                token: `${threadId}:${locks.size}`,
                expiresAt: Date.now() + ttlMs,
            };

            locks.set(threadId, lock);

            return lock;
        },
        async appendToList(key, value, options) {
            const list = [...(lists.get(key) ?? []), value];

            lists.set(key, options?.maxLength ? list.slice(-options.maxLength) : list);
        },
        connect: () => Promise.resolve(),
        async delete(key) {
            values.delete(key);
        },
        async dequeue(threadId) {
            return queues.get(threadId)?.shift() ?? null;
        },
        disconnect: () => Promise.resolve(),
        async enqueue(threadId, entry) {
            const queue = queues.get(threadId) ?? [];

            queue.push(entry);
            queues.set(threadId, queue);

            return queue.length;
        },
        async extendLock(lock) {
            return locks.get(lock.threadId)?.token === lock.token;
        },
        async forceReleaseLock(threadId) {
            locks.delete(threadId);
        },
        async get<T>(key: string) {
            return (values.get(key) as T | undefined) ?? null;
        },
        async getList<T>(key: string) {
            return (lists.get(key) ?? []) as T[];
        },
        async isSubscribed(threadId) {
            return subscriptions.has(threadId);
        },
        async queueDepth(threadId) {
            return queues.get(threadId)?.length ?? 0;
        },
        async releaseLock(lock) {
            if (locks.get(lock.threadId)?.token === lock.token) {
                locks.delete(lock.threadId);
            }
        },
        async set(key, value) {
            values.set(key, value);
        },
        async setIfNotExists(key, value) {
            if (values.has(key)) {
                return false;
            }

            values.set(key, value);

            return true;
        },
        async subscribe(threadId) {
            subscriptions.add(threadId);
        },
        async unsubscribe(threadId) {
            subscriptions.delete(threadId);
        },
    };

    return new Proxy(state, {
        get(target, key, receiver) {
            const value: unknown = Reflect.get(target, key, receiver);

            if (typeof value !== 'function') {
                return value;
            }

            return (...args: unknown[]) => {
                calls.push(String(key));

                return (value as (...input: unknown[]) => unknown).apply(target, args);
            };
        },
    });
}

/** A bot token string the tests look for in every error, run and log. */
export const SENTINEL_TOKEN = 'MTAwMDAw.sentinel-bot-token.SECRET';

export const APPROVAL_URL = (ref: ChatApprovalRef) => `https://chamvi.example/ui/approvals?run=${ref.runId}&approval=${ref.approvalId}`;

export type DiscordFixture = {
    setup: DiscordChatSetup;
    channel: ChatChannel;
    clients: FakeClients;
    fetch: FakeFetch;
    clock: ControllableClock;
    engine: Engine;
    store: IStore;
    errors: unknown[];
    access: ConversationAccess[];
    /** how often the token provider was called */
    tokenReads: { count: number };
    runs(): Promise<Run[]>;
    /** the last client, with its ready event emitted */
    ready(): FakeClient;
    /** hands a message to the last client's messageCreate listeners */
    deliver(...messages: DiscordInboundMessage[]): void;
};

export type DiscordFixtureInput = {
    patch?: Partial<DiscordChatOptions>;
    agents?: (channel: ChatChannel, setup: DiscordChatSetup) => Agent[];
    /** channels registered next to the Discord one (e.g. cronChannel()) */
    channels?: IChannel[];
};

/** createDiscordChat() over fake clients and a fake fetch, on an Engine with a memory store. */
export function createDiscordFixture(input: DiscordFixtureInput = {}): DiscordFixture {
    const clock = new ControllableClock(new Date('2026-11-03T09:00:00Z'));
    const clients = createFakeClients();
    const fakeFetch = createFakeFetch();
    const errors: unknown[] = [];
    const access: ConversationAccess[] = [];
    const tokenReads = { count: 0 };
    const setup = createDiscordChat({
        account: ACCOUNT,
        token: async () => {
            tokenReads.count += 1;

            return SENTINEL_TOKEN;
        },
        applicationId: BOT,
        policy: {
            guilds: [GUILD],
            users: [ALICE],
            dms: { users: [ALICE] },
        },
        resolveInvoker: (identity) => ({
            id: identity.author,
            kind: 'discord',
            permissions: [],
        }),
        state: createMemoryState(),
        approvalUrl: APPROVAL_URL,
        onError: (error) => {
            errors.push(error);
        },
        logger: new ConsoleLogger('error'),
        clientFactory: clients.factory,
        fetch: fakeFetch.fetch,
        ...input.patch,
    });
    const { channel } = setup;
    const memory = createMemoryStore({ clock });
    const engine = new Engine({
        store: memory,
        agents: input.agents ? input.agents(channel, setup) : [defineModelAgent({
            name: 'assistant',
            model: textModel(),
            instructions: 'Answer.',
            channels: [channel.on()],
        })],
        channels: [channel, ...(input.channels ?? [])],
        clock,
        conversations: {
            authorize: (item) => {
                access.push(item);

                return true;
            },
        },
        onError: (error) => {
            errors.push(error);
        },
    });

    return {
        setup,
        channel,
        clients,
        fetch: fakeFetch,
        clock,
        engine,
        store: memory,
        errors,
        access,
        tokenReads,
        runs: async () => (await memory.runs.find({})).data,
        ready() {
            const client = clients.last();

            client.emit(Events.ClientReady, client);

            return client;
        },
        deliver(...messages) {
            for (const message of messages) {
                clients.last().emit(Events.MessageCreate, message);
            }
        },
    };
}
