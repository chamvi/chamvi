/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Message } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { MessageType } from 'discord.js';
import {
    identityOf,
    isAllowed,
    mayResolveParent,
    needsParent,
    resolvePolicy,
} from '../../../src/discord/policy.ts';
import type { DiscordInboundMessage, DiscordPolicy } from '../../../src/discord/types.ts';
import {
    ACCOUNT,
    ALICE,
    BOT,
    CHANNEL,
    DM_CHANNEL,
    GUILD,
    MALLORY,
    OTHER_CHANNEL,
    OTHER_GUILD,
    OTHER_ROLE,
    ROLE,
    THREAD,
    discordMessage,
    dmChannel,
    groupDmChannel,
    guildText,
    privateThread,
    publicThread,
    unknownThread,
} from '../../utils/discord.ts';
import type { DiscordMessageInput } from '../../utils/discord.ts';

// a discord.js Message is a DiscordInboundMessage (compile time only)
const asInbound = (message: Message): DiscordInboundMessage => message;

void asInbound;

const BASE: DiscordPolicy = { guilds: [GUILD], users: [ALICE] };

function allowed(input: DiscordMessageInput, policy: DiscordPolicy = BASE): boolean {
    const identity = identityOf(discordMessage(input), { account: ACCOUNT, botId: BOT });

    return identity !== undefined && isAllowed(resolvePolicy(policy), identity);
}

describe('resolvePolicy', () => {
    it('applies the defaults', () => {
        const resolved = resolvePolicy({ guilds: [GUILD] });

        expect(resolved.guilds).toEqual(new Set([GUILD]));
        expect(resolved.channels).toBeUndefined();
        expect(resolved.users).toEqual(new Set());
        expect(resolved.roles).toEqual(new Set());
        expect(resolved.dmUsers).toBeUndefined();
        expect(resolved.requireMention).toBe(true);
    });

    it('reads every list', () => {
        const resolved = resolvePolicy({
            guilds: [GUILD],
            channels: [CHANNEL],
            users: [ALICE],
            roles: [ROLE],
            dms: { users: [ALICE] },
            requireMention: false,
        });

        expect(resolved.channels).toEqual(new Set([CHANNEL]));
        expect(resolved.roles).toEqual(new Set([ROLE]));
        expect(resolved.dmUsers).toEqual(new Set([ALICE]));
        expect(resolved.requireMention).toBe(false);
    });

    it.each([
        ['no policy', undefined, 'policy is required'],
        ['guilds missing', {}, 'policy.guilds must be an array'],
        ['guilds not an array', { guilds: GUILD }, 'policy.guilds must be an array'],
        ['an empty id', { guilds: [''] }, 'policy.guilds[0]'],
        ['a non-string id', { guilds: [1] }, 'policy.guilds[0]'],
        ['a name for an id', { guilds: [GUILD], users: ['ada'] }, 'policy.users[0]'],
        ['channels not an array', { guilds: [GUILD], channels: 'x' }, 'policy.channels must be an array'],
        ['roles with an empty id', { guilds: [GUILD], roles: [ROLE, ''] }, 'policy.roles[1]'],
        ['dms true', { guilds: [GUILD], dms: true }, 'policy.dms'],
        ['dms without users', { guilds: [GUILD], dms: {} }, 'policy.dms.users must be an array'],
        ['dms with a bad id', { guilds: [GUILD], dms: { users: [' '] } }, 'policy.dms.users[0]'],
        ['requireMention not a boolean', { guilds: [GUILD], requireMention: 'yes' }, 'policy.requireMention'],
    ])('refuses %s', (_label, policy, text) => {
        expect(() => resolvePolicy(policy as DiscordPolicy)).toThrow(InvalidAgentDefinitionError);
        expect(() => resolvePolicy(policy as DiscordPolicy)).toThrow(text);
        expect(() => resolvePolicy(policy as DiscordPolicy)).toThrow(/^createDiscordChat: /);
    });

    it('never names a refused value', () => {
        expect(() => resolvePolicy({ guilds: [GUILD], users: ['secret-name'] })).toThrow(expect.objectContaining({ message: expect.not.stringContaining('secret-name') }));
    });
});

describe('identityOf', () => {
    it('ignores the bot\'s own, other bots\' and webhook messages', () => {
        const ctx = { account: ACCOUNT, botId: BOT };

        expect(identityOf(discordMessage({ author: { id: BOT } }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ author: { bot: true } }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ webhookId: '1' }), ctx)).toBeUndefined();
    });

    it('ignores system messages (pins, joins, thread created), keeps default messages and replies', () => {
        const ctx = { account: ACCOUNT, botId: BOT };

        expect(identityOf(discordMessage({ type: MessageType.ChannelPinnedMessage }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ type: MessageType.UserJoin }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ type: MessageType.ThreadCreated }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ type: MessageType.ThreadStarterMessage }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ type: MessageType.Default }), ctx)).toBeDefined();
        expect(identityOf(discordMessage({ type: MessageType.Reply }), ctx)).toBeDefined();
    });

    it('ignores a group DM and a DM whose channel is no DM channel', () => {
        const ctx = { account: ACCOUNT, botId: BOT };

        expect(identityOf(discordMessage({ guildId: null, channel: groupDmChannel() }), ctx)).toBeUndefined();
        expect(identityOf(discordMessage({ guildId: null, channel: guildText(DM_CHANNEL) }), ctx)).toBeUndefined();
    });

    it('reads a guild message by ids', () => {
        expect(identityOf(discordMessage({ roles: [ROLE] }), { account: ACCOUNT, botId: BOT })).toEqual({
            account: ACCOUNT,
            chat: `discord:${GUILD}:${CHANNEL}`,
            guild: GUILD,
            channel: CHANNEL,
            author: ALICE,
            roles: [ROLE],
            dm: false,
            mentioned: true,
        });
    });

    it('reads a DM by ids', () => {
        expect(identityOf(discordMessage({ guildId: null, mentions: {} }), { account: ACCOUNT, botId: BOT })).toEqual({
            account: ACCOUNT,
            chat: `discord:@me:${DM_CHANNEL}`,
            channel: DM_CHANNEL,
            author: ALICE,
            roles: [],
            dm: true,
            mentioned: false,
        });
    });
});

describe('isAllowed: guilds, channels, authors', () => {
    it('denies an unknown guild', () => {
        expect(allowed({ guildId: OTHER_GUILD })).toBe(false);
    });

    it('denies an unlisted channel of a listed guild when channels are set', () => {
        const policy = { ...BASE, channels: [CHANNEL] };

        expect(allowed({ channel: guildText(OTHER_CHANNEL) }, policy)).toBe(false);
        expect(allowed({ channel: guildText(CHANNEL) }, policy)).toBe(true);
    });

    it('allows a thread by its parent channel id', () => {
        const policy = { ...BASE, channels: [CHANNEL] };

        expect(allowed({ channel: publicThread(THREAD, CHANNEL) }, policy)).toBe(true);
        expect(allowed({ channel: privateThread(THREAD, CHANNEL) }, policy)).toBe(true);
        expect(allowed({ channel: publicThread(THREAD, OTHER_CHANNEL) }, policy)).toBe(false);
        // the thread's own id is no channel of the policy
        expect(allowed({ channel: publicThread(THREAD, OTHER_CHANNEL) }, { ...BASE, channels: [THREAD] })).toBe(false);
    });

    it('denies a thread whose parent is unknown when channels are set (Review Focus 1)', () => {
        const message = discordMessage({ channel: unknownThread(THREAD, null) });
        const identity = identityOf(message, { account: ACCOUNT, botId: BOT });

        expect(identity).toBeDefined();
        expect(identity!.thread).toBe(THREAD);
        expect(identity!.privateThread).toBeUndefined();
        expect(isAllowed(resolvePolicy({ ...BASE, channels: [CHANNEL] }), identity!)).toBe(false);
        expect(isAllowed(resolvePolicy({ ...BASE, channels: [THREAD] }), identity!)).toBe(false);
        // the parent is resolved first (createDiscordChat): an unresolved one is never allowed
        expect(isAllowed(resolvePolicy(BASE), identity!)).toBe(false);
        expect(needsParent(identity!)).toBe(true);
        expect(mayResolveParent(resolvePolicy(BASE), identity!)).toBe(true);
        expect(mayResolveParent(resolvePolicy({
            ...BASE, 
            users: [], 
            roles: [], 
        }), identity!)).toBe(false);
        expect(mayResolveParent(resolvePolicy({ ...BASE, guilds: [] }), identity!)).toBe(false);
        expect(identityOf(message, { account: ACCOUNT, botId: BOT }, publicThread(THREAD, CHANNEL))!.chat).toBe(`discord:${GUILD}:${CHANNEL}:${THREAD}`);

        const partial = identityOf(discordMessage({ channel: publicThread(THREAD, null) }), { account: ACCOUNT, botId: BOT });

        expect(partial!.privateThread).toBeUndefined();
        expect(isAllowed(resolvePolicy({ ...BASE, channels: [CHANNEL] }), partial!)).toBe(false);
    });

    it('allows an author in users', () => {
        expect(allowed({})).toBe(true);
        expect(allowed({ author: { id: MALLORY } })).toBe(false);
    });

    it('allows an author with a role in roles', () => {
        const policy = { guilds: [GUILD], roles: [ROLE] };

        expect(allowed({ author: { id: MALLORY }, roles: [OTHER_ROLE, ROLE] }, policy)).toBe(true);
        expect(allowed({ author: { id: MALLORY }, roles: [OTHER_ROLE] }, policy)).toBe(false);
    });

    it('never authorizes by name: same username, global name and role name, other id', () => {
        const policy = {
            guilds: [GUILD], 
            users: [ALICE], 
            roles: [ROLE], 
        };

        expect(allowed({
            author: {
                id: MALLORY, 
                username: 'ada', 
                globalName: 'Ada', 
            },
            roles: [OTHER_ROLE],
        }, policy)).toBe(false);
    });

    it('denies everyone when users and roles are both empty', () => {
        expect(allowed({ roles: [ROLE] }, { guilds: [GUILD] })).toBe(false);
        expect(allowed({ roles: [ROLE] }, {
            guilds: [GUILD], 
            users: [], 
            roles: [], 
        })).toBe(false);
    });

    it('denies a guild message under an empty guild list', () => {
        expect(allowed({}, { guilds: [], users: [ALICE] })).toBe(false);
    });
});

describe('isAllowed: addressing', () => {
    it('denies an unmentioned message by default', () => {
        expect(allowed({ mentions: {} })).toBe(false);
    });

    it('allows a direct mention of the bot user', () => {
        expect(allowed({ mentions: { users: [BOT] } })).toBe(true);
    });

    it('allows a reply to the bot, denies a reply to someone else', () => {
        expect(allowed({ mentions: { repliedUser: BOT } })).toBe(true);
        expect(allowed({ mentions: { repliedUser: MALLORY } })).toBe(false);
        expect(allowed({ mentions: { users: [MALLORY], repliedUser: MALLORY } })).toBe(false);
    });

    it('denies @everyone and a role mention', () => {
        expect(allowed({ content: '@everyone hi', mentions: { everyone: true } })).toBe(false);
        expect(allowed({
            content: `<@&${ROLE}> hi`, 
            mentions: { roles: [ROLE] }, 
            roles: [ROLE], 
        })).toBe(false);
    });

    it('does not take a mention from text', () => {
        expect(allowed({ content: `<@${BOT}> hi`, mentions: {} })).toBe(false);
    });

    it('allows an unmentioned message with requireMention false', () => {
        expect(allowed({ mentions: {} }, { ...BASE, requireMention: false })).toBe(true);
    });
});

describe('isAllowed: direct messages', () => {
    it('allows a DM from dms.users without a mention', () => {
        expect(allowed({ guildId: null, mentions: {} }, { ...BASE, dms: { users: [ALICE] } })).toBe(true);
    });

    it('denies a DM from anyone else', () => {
        expect(allowed({ guildId: null, author: { id: MALLORY } }, { ...BASE, dms: { users: [ALICE] } })).toBe(false);
    });

    it('denies every DM by default and with dms false', () => {
        expect(allowed({ guildId: null })).toBe(false);
        expect(allowed({ guildId: null }, { ...BASE, dms: false })).toBe(false);
    });

    it('does not let guild users or roles write DMs', () => {
        expect(allowed({ guildId: null, channel: dmChannel() }, {
            guilds: [GUILD], 
            users: [ALICE], 
            dms: { users: [] }, 
        })).toBe(false);
    });
});
