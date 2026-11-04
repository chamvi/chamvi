/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DiscordAdapter } from '@chat-adapter/discord';
import type { APIMessage } from 'discord.js';
import { Message } from 'chat';
import type {
    DiscordApiMessage,
    DiscordIdentity,
    DiscordInboundMessage,
} from './types.ts';

/** The raw Discord API shape of a discord.js message: the fields the adapter's parseMessage() reads. */
export function toApiMessage(message: DiscordInboundMessage): DiscordApiMessage {
    return {
        id: message.id,
        type: message.type as APIMessage['type'],
        channel_id: message.channelId,
        ...(message.guildId ? { guild_id: message.guildId } : {}),
        content: message.content,
        timestamp: message.createdAt.toISOString(),
        edited_timestamp: message.editedAt ? message.editedAt.toISOString() : null,
        author: {
            id: message.author.id,
            username: message.author.username,
            global_name: message.author.globalName,
            bot: message.author.bot,
        },
        attachments: Array.from(message.attachments.values(), (item) => ({
            id: item.id,
            filename: item.name,
            content_type: item.contentType ?? undefined,
            size: item.size,
            url: item.url,
            proxy_url: item.proxyURL,
            width: item.width,
            height: item.height,
        })),
    };
}

/**
 * The Chat SDK message of a discord.js message: the adapter's public
 * parseMessage() (its Discord markdown conversion), rebuilt with the
 * identity's thread id (parseMessage gives a thread its own 3-part id, no
 * parent) and chamvi's addressing verdict as a definitive isMention (the
 * Chat SDK guesses from the text only when it is undefined).
 */
export function toChatMessage(adapter: DiscordAdapter, message: DiscordInboundMessage, identity: DiscordIdentity): Message<unknown> {
    const parsed = adapter.parseMessage(toApiMessage(message));

    return new Message<unknown>({
        id: parsed.id,
        threadId: identity.chat,
        text: parsed.text,
        formatted: parsed.formatted,
        raw: parsed.raw,
        author: parsed.author,
        metadata: parsed.metadata,
        attachments: parsed.attachments,
        replyTo: parsed.replyTo,
        isMention: identity.mentioned,
        links: parsed.links,
    });
}
