/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    APIAttachment,
    APIMessage,
    APIUser,
    ClientOptions,
} from 'discord.js';
import type { DiscordAdapter } from '@chat-adapter/discord';
import type { ConversationRef, IClock, Invoker } from '@chamvi/core';
import type {
    Chat,
    Logger,
    StateAdapter,
} from 'chat';
import type { ChatApprovalRef, ChatChannel, ChatIngress } from '@chamvi/chat';

/** Who may start runs: Discord ids (snowflakes) only, never names. */
export type DiscordPolicy = {
    /** Guilds whose messages may start runs; empty: no guild intake. */
    guilds: readonly string[];
    /** Narrows guild intake to these channels; a thread matches by its parent channel id. */
    channels?: readonly string[];
    /** Author ids allowed in the guilds. */
    users?: readonly string[];
    /** Author role ids (from the Gateway member payload) allowed in the guilds. */
    roles?: readonly string[];
    /** Direct messages from these user ids; default false (no DMs). */
    dms?: { users: readonly string[] } | false;
    /** A guild message must mention the bot or reply to it; default true. */
    requireMention?: boolean;
};

/** The identity of one incoming message, as the policy and resolveInvoker see it: ids only. */
export type DiscordIdentity = {
    /** The operator's account alias. */
    account: string;
    /** The adapter thread id: `discord:<guild | @me>:<channel>[:<thread>]`. */
    chat: string;
    /** undefined for a DM */
    guild?: string;
    /** The parent channel of a thread (the thread's own id when its parent is unknown), else the message's channel. */
    channel: string;
    /** The thread a message was written in. */
    thread?: string;
    /** For a thread: true private, false public or announcement, undefined when unknown. */
    privateThread?: boolean;
    /** The author's user id. */
    author: string;
    /** The author's member role ids (empty in a DM). */
    roles: readonly string[];
    dm: boolean;
    /** The bot user is mentioned directly, or the message replies to the bot. */
    mentioned: boolean;
};

/** An attachment as chamvi reads it (a discord.js Attachment is one). */
export type DiscordInboundAttachment = {
    id: string;
    name: string;
    contentType: string | null;
    size: number;
    url: string;
    proxyURL: string;
    width: number | null;
    height: number | null;
};

/**
 * The members of a discord.js `Message` chamvi reads, structurally, so a fake
 * needs no discord.js runtime (a discord.js Message is one).
 */
export type DiscordInboundMessage = {
    id: string;
    type: number;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    webhookId: string | null;
    guildId: string | null;
    channelId: string;
    author: {
        id: string;
        bot: boolean;
        username: string;
        globalName: string | null;
    };
    member?: {
        roles: { cache: { keys(): Iterable<string> } };
    } | null;
    mentions: {
        users: { has(id: string): boolean };
        repliedUser?: { id: string } | null;
    };
    attachments: { values(): Iterable<DiscordInboundAttachment> };
    channel: DiscordInboundChannel;
};

/** The channel of an incoming message; `fetch()` loads a partial one (a thread whose parent is unknown). */
export type DiscordInboundChannel = {
    type: number;
    isThread(): boolean;
    parentId?: string | null;
    fetch?(): Promise<DiscordInboundChannel>;
};

/** The fields of a raw Discord API message the adapter's `parseMessage()` reads. */
export type DiscordApiMessage = Pick<APIMessage, 'id' | 'type' | 'channel_id' | 'content' | 'timestamp' | 'edited_timestamp'> & {
    guild_id?: string;
    author: Pick<APIUser, 'id' | 'username' | 'global_name' | 'bot'>;
    attachments: Pick<APIAttachment, 'id' | 'filename' | 'content_type' | 'size' | 'url' | 'proxy_url' | 'width' | 'height'>[];
};

/** The checked policy (internal). */
export type ResolvedDiscordPolicy = {
    guilds: ReadonlySet<string>;
    /** undefined: every channel of a listed guild */
    channels?: ReadonlySet<string>;
    users: ReadonlySet<string>;
    roles: ReadonlySet<string>;
    /** undefined: no DMs */
    dmUsers?: ReadonlySet<string>;
    requireMention: boolean;
};

/**
 * The Gateway connection's state: `failed` is terminal (an invalid token,
 * disallowed intents, an invalidated session, reconnects exhausted) until the
 * channel starts again.
 */
export type DiscordConnectionStatus = 'stopped' | 'connecting' | 'connected' | 'disconnected' | 'failed';

/** The members of a discord.js `Client` chamvi uses (a Client is one). */
export type DiscordClient = {
    on(event: string, listener: (...args: any[]) => void): unknown;
    off(event: string, listener: (...args: any[]) => void): unknown;
    login(token: string): Promise<string>;
    destroy(): Promise<void> | void;
    readonly user: { id: string } | null;
};

/** Makes a client; default `new Client(options)` of discord.js (tests pass a fake). */
export type DiscordClientFactory = (options: ClientOptions) => DiscordClient;

/** The Gateway connection's inputs (internal). */
export type DiscordConnectionOptions = {
    /** Read per login attempt, never kept. */
    token: () => Promise<string>;
    clientFactory: DiscordClientFactory;
    /** Every message the current client receives, with the bot's own user id. */
    onMessage(message: DiscordInboundMessage, botId: string): void;
    onError(error: unknown): void;
    onStatusChange?(): void;
};

/** The Gateway connection (internal). */
export type DiscordConnection = {
    status(): DiscordConnectionStatus;
    /** Resolves once the first client is made and its login started; settles on abort. */
    connect(ctx: { signal: AbortSignal; clock: IClock }): Promise<void>;
    /** Stops the connection for good: no client is made after it. */
    close(): Promise<void>;
};

/** One send the chat channel prepares (ChatPlatformSend plus the channel's name). */
export type DiscordSend = {
    /** The chat channel's name: part of the nonce, so two channels never share one. */
    channel: string;
    /** The adapter thread id the address names. */
    threadId: string;
    /** The rendered text, at most DISCORD_TEXT_MAX_CHARS. */
    text: string;
    /** `ChannelMessage.key`: the same for every retry of one message. */
    key: string;
};

/** What createDiscordSender() needs. */
export type DiscordSenderOptions = {
    /** The REST base, e.g. DISCORD_API_URL. */
    apiUrl: string;
    /** The bot token, read once per post. */
    token: () => Promise<string>;
    fetch: typeof fetch;
    /** The adapter's public thread-id decoding. */
    adapter: Pick<DiscordAdapter, 'decodeThreadId'>;
};

export type DiscordChatOptions = {
    /** The operator's non-secret alias of the bot (the conversation account). */
    account: string;
    /** The bot token, or a provider read per login and per send (never in a store, run, log or error). */
    token: string | (() => Promise<string>);
    /** The bot's application id (a snowflake). */
    applicationId: string;
    /** Who may start runs: ids only; unknown guilds, channels and users are denied. */
    policy: DiscordPolicy;
    /** The invoker of an allowed message's runs; undefined denies the message. */
    resolveInvoker: (identity: DiscordIdentity) => Invoker | undefined | Promise<Invoker | undefined>;
    /** The Chat SDK state adapter of the Chat. */
    state: StateAdapter;
    /** The approval link (ids only); approvals are answered in the UI. */
    approvalUrl: (ref: ChatApprovalRef) => string;
    /** Default `chat`. */
    name?: string;
    /** Default true (runs are tainted). */
    untrusted?: boolean;
    /** Bound of one send; default `CHAT_TIMEOUT_MS`. */
    timeoutMs?: number;
    /** The connector's clock (login retry backoff, shutdown bound); default the engine's. */
    clock?: IClock;
    /** Failures nobody awaits; default console.error. Never gets the token. */
    onError?: (error: unknown) => void;
    /** Called after every change of `status()`. */
    onStatusChange?: () => void;
    /** The logger of the Chat and the adapter; default a console logger at level `warn`. */
    logger?: Logger;
    /** The Chat's bot user name; default `chamvi`. */
    userName?: string;
    /** The Discord REST base; default DISCORD_API_URL. */
    apiUrl?: string;
    /** Makes the discord.js client; default `new Client(options)` (tests pass a fake). */
    clientFactory?: DiscordClientFactory;
    /** The fetch of the REST send; default the global fetch. */
    fetch?: typeof fetch;
};

/** The chat of a conversation reference (DiscordChatSetup.conversation()). */
export type DiscordConversationInput = {
    /** The adapter thread id: `discord:@me:<DM channel id>` or `discord:<guild>:<channel>` (no thread). */
    threadId: string;
    /** For a DM: the user id the DM is with; refused for a guild channel. */
    user?: string;
};

export type DiscordChatSetup = {
    chat: Chat;
    ingress: ChatIngress;
    channel: ChatChannel;
    status(): DiscordConnectionStatus;
    /**
     * The reference of a conversation of this channel (e.g. for
     * `cron.on(expr, { conversation, text })`): the identity intake computes
     * for a message in that chat and its address. InvalidAgentDefinitionError
     * for a malformed id, a DM without its user, a user outside a DM or a
     * thread (its audience depends on its type).
     */
    conversation(input: DiscordConversationInput): ConversationRef;
};
