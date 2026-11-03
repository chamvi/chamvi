/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { APIAttachment, APIMessage, APIUser } from 'discord.js';

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
    channel: {
        type: number;
        isThread(): boolean;
        parentId?: string | null;
    };
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
