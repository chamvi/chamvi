/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createDiscordAdapter } from '@chat-adapter/discord';
import type { DiscordAdapter } from '@chat-adapter/discord';
import type { Logger } from 'chat';
import { Message } from 'chat';
import { describe, expect, it } from 'vitest';
import { toApiMessage, toChatMessage } from '../../../src/discord/message.ts';
import { identityOf, toConversationTarget } from '../../../src/discord/policy.ts';
import type { DiscordIdentity, DiscordInboundMessage } from '../../../src/discord/types.ts';
import {
    ACCOUNT,
    ALICE,
    BOT,
    CHANNEL,
    DM_CHANNEL,
    GUILD,
    THREAD,
    announcementThread,
    attachment,
    discordMessage,
    guildText,
    privateThread,
    publicThread,
    unknownThread,
} from '../../utils/discord.ts';

const silent: Logger = {
    child: () => silent,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};

function adapter(): DiscordAdapter {
    return createDiscordAdapter({
        botToken: 'explicit-token',
        applicationId: BOT,
        apiUrl: 'https://discord.test/api/v10',
        mentionRoleIds: [],
        respondToChannelIds: [],
        respondToGlobalMentions: false,
        webhookVerifier: () => false,
        logger: silent,
        userName: 'chamvi',
    });
}

function identity(message: DiscordInboundMessage): DiscordIdentity {
    const value = identityOf(message, { account: ACCOUNT, botId: BOT });

    expect(value).toBeDefined();

    return value!;
}

function audienceOf(message: DiscordInboundMessage): string {
    return toConversationTarget(identity(message), 'hi').audience;
}

describe('toConversationTarget', () => {
    it('reads a DM as direct:<author>', () => {
        expect(toConversationTarget(identity(discordMessage({ guildId: null })), 'hi')).toEqual({
            account: ACCOUNT,
            chat: `discord:@me:${DM_CHANNEL}`,
            audience: `direct:${ALICE}`,
            text: 'hi',
        });
    });

    it('reads a top-level guild message as channel:<channel>', () => {
        expect(toConversationTarget(identity(discordMessage({ channel: guildText() })), 'hi')).toEqual({
            account: ACCOUNT,
            chat: `discord:${GUILD}:${CHANNEL}`,
            audience: `channel:${CHANNEL}`,
            text: 'hi',
        });
    });

    it('reads a public and an announcement thread as channel:<parent>', () => {
        expect(audienceOf(discordMessage({ channel: publicThread() }))).toBe(`channel:${CHANNEL}`);
        expect(audienceOf(discordMessage({ channel: announcementThread() }))).toBe(`channel:${CHANNEL}`);
    });

    it('reads a private thread and an unknown thread type as thread:<thread>', () => {
        expect(audienceOf(discordMessage({ channel: privateThread() }))).toBe(`thread:${THREAD}`);
        expect(audienceOf(discordMessage({ channel: unknownThread() }))).toBe(`thread:${THREAD}`);
    });

    it('never widens a thread whose parent is unknown (Review Focus 1)', () => {
        expect(audienceOf(discordMessage({ channel: publicThread(THREAD, null) }))).toBe(`thread:${THREAD}`);
        expect(audienceOf(discordMessage({ channel: unknownThread(THREAD, null) }))).toBe(`thread:${THREAD}`);
    });
});

describe('identity chat ids', () => {
    it('is the 3-part channel id for a top-level message', () => {
        expect(identity(discordMessage({ channel: guildText() })).chat).toBe(`discord:${GUILD}:${CHANNEL}`);
    });

    it('is the 4-part id for a thread message', () => {
        const value = identity(discordMessage({ channel: privateThread() }));

        expect(value.chat).toBe(`discord:${GUILD}:${CHANNEL}:${THREAD}`);
        expect(value.chat).toBe(adapter().encodeThreadId({
            guildId: GUILD, 
            channelId: CHANNEL, 
            threadId: THREAD, 
        }));
        expect(adapter().decodeThreadId(value.chat)).toEqual({
            guildId: GUILD, 
            channelId: CHANNEL, 
            threadId: THREAD, 
        });
        expect(value.channel).toBe(CHANNEL);
        expect(value.thread).toBe(THREAD);
        expect(value.privateThread).toBe(true);
    });

    it('is the thread\'s own channel id when its parent is unknown', () => {
        const value = identity(discordMessage({ channel: publicThread(THREAD, null) }));

        expect(value.chat).toBe(`discord:${GUILD}:${THREAD}`);
        expect(value.channel).toBe(THREAD);
        expect(value.thread).toBe(THREAD);
    });

    it('is the @me id of the DM channel for a DM', () => {
        const value = identity(discordMessage({ guildId: null }));

        expect(value.chat).toBe(`discord:@me:${DM_CHANNEL}`);
        expect(adapter().isDM(value.chat)).toBe(true);
    });
});

describe('toApiMessage', () => {
    it('maps the fields the adapter parses', () => {
        const editedAt = new Date('2026-11-03T11:00:00.000Z');

        expect(toApiMessage(discordMessage({
            content: 'hi',
            editedAt,
            attachments: [attachment()],
        }))).toEqual({
            id: '300000000000000001',
            type: 0,
            channel_id: CHANNEL,
            guild_id: GUILD,
            content: 'hi',
            timestamp: '2026-11-03T10:00:00.000Z',
            edited_timestamp: '2026-11-03T11:00:00.000Z',
            author: {
                id: ALICE,
                username: 'ada',
                global_name: 'Ada',
                bot: false,
            },
            attachments: [{
                id: '900000000000000001',
                filename: 'a.png',
                content_type: 'image/png',
                size: 3,
                url: 'https://cdn.discordapp.com/a.png',
                proxy_url: 'https://media.discordapp.net/a.png',
                width: 1,
                height: 1,
            }],
        });
    });

    it('leaves out the guild of a DM', () => {
        expect(toApiMessage(discordMessage({ guildId: null }))).not.toHaveProperty('guild_id');
    });
});

describe('toChatMessage', () => {
    it('keeps the parsed fields and sets the thread id and mention', () => {
        const target = adapter();
        const raw = discordMessage({ channel: privateThread(), attachments: [attachment()] });
        const parsed = target.parseMessage(toApiMessage(raw));
        const message = toChatMessage(target, raw, identity(raw));

        expect(message).toBeInstanceOf(Message);
        expect(message.threadId).toBe(`discord:${GUILD}:${CHANNEL}:${THREAD}`);
        expect(message.isMention).toBe(true);
        expect(message.id).toBe(parsed.id);
        expect(message.text).toBe(`@${BOT} hello world`);
        expect(message.text).toBe(parsed.text);
        expect(message.formatted).toEqual(parsed.formatted);
        expect(message.raw).toEqual(parsed.raw);
        expect(message.author).toEqual(parsed.author);
        expect(message.author.userId).toBe(ALICE);
        expect(message.attachments).toHaveLength(1);
        expect(message.metadata).toEqual(parsed.metadata);
        expect(message.metadata.dateSent).toEqual(new Date('2026-11-03T10:00:00.000Z'));
        expect(message.metadata.edited).toBe(false);
        expect(message.links).toEqual(parsed.links);
    });

    it('marks an unaddressed message as no mention, definitively', () => {
        const target = adapter();
        const raw = discordMessage({ content: '@chamvi hi', mentions: {} });

        expect(toChatMessage(target, raw, identity(raw)).isMention).toBe(false);
    });

    it('copies every field the adapter sets (a new upstream field fails here)', () => {
        const target = adapter();
        const raw = discordMessage();
        const parsed = target.parseMessage(toApiMessage(raw));
        const message = toChatMessage(target, raw, identity(raw));
        const fields = [
            '_subjectPromise',
            'attachments',
            'author',
            'formatted',
            'id',
            'isMention',
            'links',
            'metadata',
            'raw',
            'replyTo',
            'text',
            'threadId',
            'userKey',
        ];

        expect(Object.keys(parsed).sort()).toEqual(fields);
        expect(Object.keys(message).sort()).toEqual(fields);
    });
});
