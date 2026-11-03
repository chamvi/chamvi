/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Fake discord.js messages and channels: plain objects of the structural
// subset chamvi reads (DiscordInboundMessage), so no discord.js runtime runs.

import { ChannelType } from 'discord.js';
import type { DiscordInboundMessage } from '../../src/discord/types.ts';

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
