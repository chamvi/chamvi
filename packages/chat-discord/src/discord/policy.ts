/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChannelType, MessageType } from 'discord.js';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { ConversationTarget } from '@chamvi/core';
import { isObject } from 'smob';
import { DISCORD_ADAPTER_NAME } from './constants.ts';
import type {
    DiscordIdentity,
    DiscordInboundMessage,
    DiscordPolicy,
    ResolvedDiscordPolicy,
} from './types.ts';

/** A Discord id: a snowflake, decimal digits only (names never match). */
const SNOWFLAKE = /^[0-9]{1,20}$/;

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`createDiscordChat: ${message}`);
}

/** A list of ids; the error names the option and the index, never the value. */
function readIds(value: unknown, option: string): Set<string> {
    if (!Array.isArray(value)) {
        throw invalid(`${option} must be an array of Discord ids.`);
    }

    const ids = new Set<string>();

    value.forEach((entry: unknown, index) => {
        if (typeof entry !== 'string' || !SNOWFLAKE.test(entry)) {
            throw invalid(`${option}[${index}] must be a Discord id (a snowflake of digits).`);
        }

        ids.add(entry);
    });

    return ids;
}

function readOptionalIds(value: unknown, option: string): Set<string> | undefined {
    return value === undefined ? undefined : readIds(value, option);
}

/** Checks the policy (InvalidAgentDefinitionError naming the option): ids only, deny by default. */
export function resolvePolicy(policy: DiscordPolicy): ResolvedDiscordPolicy {
    if (!isObject(policy)) {
        throw invalid('policy is required: list the allowed guilds and their users or roles.');
    }

    const requireMention = policy.requireMention ?? true;

    if (typeof requireMention !== 'boolean') {
        throw invalid('policy.requireMention must be a boolean.');
    }

    const dms: unknown = policy.dms ?? false;
    let dmUsers: Set<string> | undefined;

    if (dms !== false) {
        if (!isObject(dms)) {
            throw invalid('policy.dms must be false or { users }.');
        }

        dmUsers = readIds(dms.users, 'policy.dms.users');
    }

    const channels = readOptionalIds(policy.channels, 'policy.channels');

    return {
        guilds: readIds(policy.guilds, 'policy.guilds'),
        ...(channels ? { channels } : {}),
        users: readOptionalIds(policy.users, 'policy.users') ?? new Set(),
        roles: readOptionalIds(policy.roles, 'policy.roles') ?? new Set(),
        ...(dmUsers ? { dmUsers } : {}),
        requireMention,
    };
}

function encodeChat(guild: string, channel: string, thread?: string): string {
    return `${DISCORD_ADAPTER_NAME}:${guild}:${channel}${thread === undefined ? '' : `:${thread}`}`;
}

/** Whether a thread is private, from its channel type; undefined for a type this code does not know. */
function isPrivateThread(type: number): boolean | undefined {
    if (type === ChannelType.PrivateThread) {
        return true;
    }

    if (type === ChannelType.PublicThread || type === ChannelType.AnnouncementThread) {
        return false;
    }

    return undefined;
}

/**
 * The identity of an incoming message, or undefined for one that must start
 * nothing: the bot's own, another bot's or a webhook's message, a group DM, a
 * guildless message whose channel is no DM channel. Ids only: names, nicknames
 * and role names are never read. In a thread whose parent channel is unknown
 * (a partial channel), `channel` is the thread's own id and `privateThread`
 * undefined, so neither the policy's channels nor the audience widen to a
 * parent nobody resolved.
 */
export function identityOf(
    message: DiscordInboundMessage,
    ctx: { account: string; botId: string },
): DiscordIdentity | undefined {
    const {
        author, 
        channel, 
        mentions, 
    } = message;

    if (author.id === ctx.botId || author.bot || message.webhookId) {
        return undefined;
    }

    // only what a person wrote: system messages (pins, joins, thread created) carry no text to answer
    if (message.type !== MessageType.Default && message.type !== MessageType.Reply) {
        return undefined;
    }

    const mentioned = mentions.users.has(ctx.botId) || mentions.repliedUser?.id === ctx.botId;
    const base = {
        account: ctx.account,
        author: author.id,
        mentioned,
    };

    if (!message.guildId) {
        if (channel.type !== ChannelType.DM) {
            return undefined;
        }

        return {
            ...base,
            chat: encodeChat('@me', message.channelId),
            channel: message.channelId,
            roles: [],
            dm: true,
        };
    }

    const guild = message.guildId;
    const roles = message.member ? Array.from(message.member.roles.cache.keys()) : [];

    if (!channel.isThread()) {
        return {
            ...base,
            chat: encodeChat(guild, message.channelId),
            guild,
            channel: message.channelId,
            roles,
            dm: false,
        };
    }

    const thread = message.channelId;
    const parent = typeof channel.parentId === 'string' && channel.parentId.length > 0 ? channel.parentId : undefined;

    if (parent === undefined) {
        return {
            ...base,
            chat: encodeChat(guild, thread),
            guild,
            channel: thread,
            thread,
            roles,
            dm: false,
        };
    }

    const privateThread = isPrivateThread(channel.type);

    return {
        ...base,
        chat: encodeChat(guild, parent, thread),
        guild,
        channel: parent,
        thread,
        ...(privateThread === undefined ? {} : { privateThread }),
        roles,
        dm: false,
    };
}

/** Whether the policy lets the identity start runs (resolveInvoker decides next). */
export function isAllowed(policy: ResolvedDiscordPolicy, identity: DiscordIdentity): boolean {
    if (identity.dm) {
        return policy.dmUsers?.has(identity.author) ?? false;
    }

    if (identity.guild === undefined || !policy.guilds.has(identity.guild)) {
        return false;
    }

    if (policy.channels) {
        // a thread matches by its parent only: an unknown parent matches nothing
        if (identity.thread !== undefined && identity.channel === identity.thread) {
            return false;
        }

        if (!policy.channels.has(identity.channel)) {
            return false;
        }
    }

    const byRole = identity.roles.some((role) => policy.roles.has(role));

    if (!policy.users.has(identity.author) && !byRole) {
        return false;
    }

    return !policy.requireMention || identity.mentioned;
}

/**
 * The conversation of an identity: the account alias, the adapter thread id
 * and the narrowest known audience (`direct:<user>` for a DM,
 * `channel:<parent>` for a channel and its public or announcement threads,
 * `thread:<thread>` for a private thread or one of unknown type or parent).
 */
export function toConversationTarget(identity: DiscordIdentity, text: string): ConversationTarget {
    let audience: string;

    if (identity.dm) {
        audience = `direct:${identity.author}`;
    } else if (identity.thread !== undefined && identity.privateThread !== false) {
        audience = `thread:${identity.thread}`;
    } else {
        audience = `channel:${identity.channel}`;
    }

    return {
        account: identity.account,
        chat: identity.chat,
        audience,
        text,
    };
}
