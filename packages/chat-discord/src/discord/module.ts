/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createDiscordAdapter } from '@chat-adapter/discord';
import type { DiscordAdapter } from '@chat-adapter/discord';
import { Client } from 'discord.js';
import { Chat, ConsoleLogger } from 'chat';
import type { ChatInstance, Message } from 'chat';
import { ChamviError, InvalidAgentDefinitionError, InvalidRunStateError } from '@chamvi/core';
import type { Invoker } from '@chamvi/core';
import { isObject } from 'smob';
import { CHAT_REQUEST_ERROR_CODE, chatChannel, createChatIngressAdapter } from '@chamvi/chat';
import type { ChatIncoming } from '@chamvi/chat';
import {
    DISCORD_ADAPTER_NAME,
    DISCORD_API_URL,
    DISCORD_HANDOVER_MAX_PENDING,
    DISCORD_TEXT_MAX_CHARS,
} from './constants.ts';
import { createDiscordConnection } from './connection.ts';
import { toChatMessage } from './message.ts';
import {
    identityOf,
    isAllowed,
    mayResolveParent,
    needsParent,
    resolvePolicy,
    toConversationRef,
    toConversationTarget,
} from './policy.ts';
import { createDiscordSender } from './send.ts';
import type {
    DiscordChatOptions,
    DiscordChatSetup,
    DiscordClientFactory,
    DiscordIdentity,
    DiscordInboundMessage,
} from './types.ts';

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`createDiscordChat: ${message}`);
}

function isText(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}

/** Whether `value` is an absolute http(s) URL without credentials. */
function isApiUrl(value: unknown): boolean {
    if (typeof value !== 'string') {
        return false;
    }

    try {
        const url = new URL(value);

        return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.search && !url.hash;
    } catch {
        return false;
    }
}

/** The checks of the options besides the policy; no message echoes a value. */
function assertOptions(options: DiscordChatOptions): void {
    if (!isObject(options)) {
        throw invalid('options must be an object.');
    }

    if (!isText(options.account)) {
        throw invalid('account must be a non-empty string without NUL (an alias, not a token or an id).');
    }

    if (typeof options.token !== 'function' && !isText(options.token)) {
        throw invalid('token must be the non-empty bot token or a function that returns it.');
    }

    if (!isText(options.applicationId)) {
        throw invalid('applicationId must be the bot\'s application id, a non-empty string.');
    }

    if (!isObject(options.state)) {
        throw invalid('state must be a Chat SDK StateAdapter.');
    }

    for (const key of ['resolveInvoker', 'approvalUrl'] as const) {
        if (typeof options[key] !== 'function') {
            throw invalid(`${key} must be a function.`);
        }
    }

    for (const key of ['onError', 'clientFactory', 'fetch'] as const) {
        if (options[key] !== undefined && typeof options[key] !== 'function') {
            throw invalid(`${key} must be a function.`);
        }
    }

    for (const key of ['clock', 'logger'] as const) {
        if (options[key] !== undefined && !isObject(options[key])) {
            throw invalid(`${key} must be an object.`);
        }
    }

    if (options.apiUrl !== undefined && !isApiUrl(options.apiUrl)) {
        throw invalid('apiUrl must be an absolute http(s) URL without credentials, query or fragment.');
    }

    if (options.userName !== undefined && !isText(options.userName)) {
        throw invalid('userName must be a non-empty string.');
    }
}

/**
 * The adapter's own REST calls never get the token: chamvi sends through its
 * own sender, and an SDK path that reached Discord through the adapter
 * (its postMessage sets no allowed_mentions) fails instead.
 */
function refusedToken(): Promise<string> {
    return Promise.reject(new ChamviError({
        code: CHAT_REQUEST_ERROR_CODE,
        message: 'The Discord adapter does not call Discord itself; chamvi sends through its own REST sender.',
    }));
}

const defaultClientFactory: DiscordClientFactory = (clientOptions) => new Client(clientOptions);

/**
 * A forwarding view of the adapter (no subclass, no protected member): every
 * member is the adapter's, bound to it, except `initialize`, which first keeps
 * the ChatInstance it is handed. Wrapped by createChatIngressAdapter(), that
 * instance is chamvi's facade, whose processMessage reaches the channel.
 */
function captureInitialize(adapter: DiscordAdapter, onInitialize: (chat: ChatInstance) => void): DiscordAdapter {
    const initialize = async (chat: ChatInstance) => {
        onInitialize(chat);
        await adapter.initialize(chat);
    };

    return new Proxy(adapter, {
        get(target, key) {
            if (key === 'initialize') {
                return initialize;
            }

            const value: unknown = Reflect.get(target, key, target);

            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

/**
 * Discord as a chat channel: a Chat SDK Chat with `@chat-adapter/discord`
 * (initialize, parsing, thread ids only) wrapped by createChatIngressAdapter(),
 * and its chatChannel() bounded at DISCORD_TEXT_MAX_CHARS (2000). Nothing is
 * read or connected here (a factory or `start --check` reads no token and
 * makes no client): the channel's start initializes the Chat, then the
 * connection logs one discord.js client in to the Gateway; its stop destroys
 * the client. `status()` follows the client's events.
 *
 * Inbound, per Gateway message: the bot's own, bot and webhook messages are
 * dropped, then the policy decides on ids alone (DiscordPolicy) before any
 * other work, so a refused message leaves no trace on Discord; an allowed one
 * is parsed by the adapter's public parseMessage(), rebuilt with its thread id
 * and mention verdict, and handed to the facade's processMessage, one after
 * another per channel or thread. `resolveInvoker` names the invoker
 * (undefined denies). An agent with `conversation` gets
 * `{ account, thread id, direct:<user> | channel:<parent> | thread:<thread> }`.
 *
 * Outbound is chamvi's own REST send (createDiscordSender): no pings, a nonce
 * per message key with `enforce_nonce`, abortable at the send deadline,
 * independent of the Gateway status. Delivery is at least once.
 */
export function createDiscordChat(options: DiscordChatOptions): DiscordChatSetup {
    assertOptions(options);

    const policy = resolvePolicy(options.policy);
    // eslint-disable-next-line no-console
    const onError = options.onError ?? ((error: unknown) => console.error('[chamvi]', error));
    const logger = options.logger ?? new ConsoleLogger('warn');
    const userName = options.userName ?? 'chamvi';
    const apiUrl = options.apiUrl ?? DISCORD_API_URL;
    const tokenValue = options.token;
    const token: () => Promise<string> = typeof tokenValue === 'string' ? async () => tokenValue : tokenValue;
    const fetchOf: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));

    const adapter = createDiscordAdapter({
        botToken: refusedToken,
        applicationId: options.applicationId,
        apiUrl,
        mentionRoleIds: [],
        respondToChannelIds: [],
        respondToGlobalMentions: false,
        // there is no Interactions endpoint: every webhook request is refused
        webhookVerifier: () => false,
        logger: logger.child(DISCORD_ADAPTER_NAME),
        userName,
    });

    let facade: ChatInstance | undefined;
    const ingress = createChatIngressAdapter(captureInitialize(adapter, (chat) => {
        facade = chat;
    }));
    const chat = new Chat({
        userName,
        adapters: { [DISCORD_ADAPTER_NAME]: ingress },
        state: options.state,
        logger,
        concurrency: 'concurrent',
    });

    // the identity the policy allowed and the invoker resolveInvoker named, per handed-over message
    const identities = new WeakMap<Message, DiscordIdentity>();
    const invokers = new WeakMap<Message, Invoker>();
    // the hand-over chain of each conversation (keyed by the Discord channel or thread id):
    // its tail and how many messages wait in it
    const queues = new Map<string, { tail: Promise<void>; pending: number }>();
    // bumped on every disconnect: a hand-over queued by an earlier connection never reaches a later one
    let generation = 0;
    const ctx = () => ({ account: options.account });

    const handOver = async (
        message: DiscordInboundMessage,
        botId: string,
        found: DiscordIdentity,
        run: number,
    ): Promise<void> => {
        let identity: DiscordIdentity | undefined = found;

        if (needsParent(identity)) {
            // a partial thread: its parent decides the conversation, so look it up once
            // (a read, no visible effect); a failed lookup refuses the message
            let fetched: DiscordInboundMessage['channel'] | undefined;

            try {
                fetched = await message.channel.fetch?.();
            } catch {
                fetched = undefined;
            }

            if (!fetched || run !== generation) {
                return;
            }

            identity = identityOf(message, { ...ctx(), botId }, fetched);
        }

        const instance = facade;

        if (!identity || !isAllowed(policy, identity) || !instance || run !== generation) {
            return;
        }

        const parsed = toChatMessage(adapter, message, identity);

        identities.set(parsed, identity);
        await instance.processMessage(ingress, identity.chat, parsed);
    };

    const onMessage = (message: DiscordInboundMessage, botId: string) => {
        const identity = identityOf(message, { ...ctx(), botId });

        // refused before any other work: no lookup, no parsing, no hand-over, no Discord call
        if (!identity || !(needsParent(identity) ? mayResolveParent(policy, identity) : isAllowed(policy, identity))) {
            return;
        }

        const key = message.channelId;
        const queue = queues.get(key) ?? { tail: Promise.resolve(), pending: 0 };

        if (queue.pending >= DISCORD_HANDOVER_MAX_PENDING) {
            onError(new InvalidRunStateError(`A Discord conversation of channel "${channel.name}" has ${DISCORD_HANDOVER_MAX_PENDING} messages waiting for their hand-over; a later message was dropped.`));

            return;
        }

        const run = generation;

        queue.pending += 1;
        // one after another per conversation: their runs are created in arrival order;
        // a refused or failed message is the channel's to report
        queue.tail = queue.tail
            .then(() => (run === generation ? handOver(message, botId, identity, run) : undefined))
            .catch(() => undefined)
            .finally(() => {
                queue.pending -= 1;

                if (queue.pending === 0 && queues.get(key) === queue) {
                    queues.delete(key);
                }
            });
        queues.set(key, queue);
    };

    const connection = createDiscordConnection({
        token,
        clientFactory: options.clientFactory ?? defaultClientFactory,
        onMessage,
        onError,
    });
    const sender = createDiscordSender({
        apiUrl,
        token,
        fetch: fetchOf,
        adapter,
    });

    const allowMessage = async (incoming: ChatIncoming): Promise<boolean> => {
        const identity = identities.get(incoming.message);

        if (!identity || !isAllowed(policy, identity)) {
            return false;
        }

        const invoker = await options.resolveInvoker(identity);

        if (!invoker) {
            return false;
        }

        invokers.set(incoming.message, invoker);

        return true;
    };

    const { name } = options;
    const channel = chatChannel({
        chat,
        adapters: [ingress],
        ...(name !== undefined ? { name } : {}),
        ...(options.untrusted !== undefined ? { untrusted: options.untrusted } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        account: options.account,
        maxTextChars: DISCORD_TEXT_MAX_CHARS,
        connect: (ctx) => connection.connect({ signal: ctx.signal, clock: options.clock ?? ctx.clock }),
        disconnect: () => {
            generation += 1;
            queues.clear();

            return connection.close();
        },
        allowMessage,
        resolveInvoker: (incoming) => invokers.get(incoming.message),
        approvalUrl: options.approvalUrl,
        onError,
        platform: {
            // REST is independent of the Gateway: the channel sends while it is started
            online: () => true,
            prepare: ({
                threadId,
                text,
                key,
            }) => sender({
                channel: channel.name,
                threadId,
                text,
                key,
            }),
            conversationTarget: (incoming, payload) => {
                const identity = identities.get(incoming.message);

                return identity ? toConversationTarget(identity, payload.message.text) : undefined;
            },
        },
    });

    return {
        chat,
        ingress,
        channel,
        status: () => connection.status(),
        conversation: (input) => toConversationRef(input, {
            account: options.account,
            channel: channel.name,
            address: (threadId) => channel.to({ adapter: DISCORD_ADAPTER_NAME, threadId }),
        }),
    };
}
