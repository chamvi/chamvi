/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import { Events } from 'discord.js';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { ValidationError, defineModelAgent, defineTool } from '@chamvi/core';
import type {
    Agent,
    ChannelMessage,
    IEngine,
    Run,
} from '@chamvi/core';
import { chatAddress } from '@chamvi/chat';
import type { ChatChannel, ChatPayload } from '@chamvi/chat';
import { DISCORD_API_URL, DISCORD_TEXT_MAX_CHARS } from '@chamvi/chat-discord';
import type { DiscordIdentity } from '@chamvi/chat-discord';
import { mockModel } from '@chamvi/test-kit';
import { DISCORD_HANDOVER_MAX_PENDING } from '../../../src/discord/constants.ts';
import { nonceOf } from '../../../src/discord/send.ts';
import {
    ACCOUNT,
    ALICE,
    APPROVAL_URL,
    BOT,
    CHANNEL,
    DM_CHANNEL,
    MALLORY,
    OTHER_CHANNEL,
    OTHER_GUILD,
    SENTINEL_TOKEN,
    THREAD,
    attachment,
    bodyOf,
    clientTrace,
    createDiscordFixture,
    discordMessage,
    guildText,
    privateThread,
    publicThread,
    settle,
} from '../../utils/discord.ts';
import type { DiscordFixture, DiscordFixtureInput } from '../../utils/discord.ts';

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

async function started(input: DiscordFixtureInput = {}): Promise<DiscordFixture> {
    const value = createDiscordFixture(input);

    engines.push(value.engine);
    await value.engine.start();
    value.ready();

    return value;
}

function payloadOf(run: Run | undefined): ChatPayload {
    return run?.trigger.payload as ChatPayload;
}

type Act = (context: Parameters<NonNullable<Parameters<typeof defineTool>[0]['execute']>>[1]['context']) => Promise<unknown>;

/** an agent whose tool `act` runs `act` once, then answers */
function agentWith(channel: ChatChannel, act: Act): Agent {
    const tool = defineTool({
        inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
        execute: async (_input, { context }) => act(context),
    });

    return defineModelAgent({
        name: 'helper',
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'act',
                    input: {},
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]),
        instructions: 'Help.',
        tools: { act: tool },
        channels: [channel.on()],
    });
}

function message(key: string, body: string): ChannelMessage {
    return {
        kind: 'message',
        key,
        runId: 'run-1',
        agent: 'assistant',
        body,
    };
}

function send(value: DiscordFixture, item: ChannelMessage, threadId: string): Promise<void> {
    return value.channel.out!(item, chatAddress({ adapter: 'discord', threadId }), {
        signal: new AbortController().signal,
        trigger: {} as never,
    });
}

describe('Discord inbound', () => {
    it('resolves an unknown thread parent before deciding: one memory, the parent audience', async () => {
        const value = await started();
        const partial = publicThread(THREAD, null);
        let fetches = 0;

        partial.fetch = async () => {
            fetches += 1;

            return publicThread(THREAD, CHANNEL);
        };

        value.deliver(discordMessage({ channel: partial }));
        await settle();

        const runs = await value.runs();

        expect(fetches).toBe(1);
        expect(runs).toHaveLength(1);
        expect(payloadOf(runs[0]).threadId).toBe(`discord:400000000000000001:${CHANNEL}:${THREAD}`);
        expect(payloadOf(runs[0]).channelId).toBe(`discord:400000000000000001:${CHANNEL}`);
    });

    it('denies a thread whose parent stays unknown, and fetches nothing for a refused author', async () => {
        const value = await started();
        const failing = publicThread(THREAD, null);
        const refused = publicThread(THREAD, null);
        let refusedFetches = 0;

        failing.fetch = async () => {
            throw new Error('Missing Access');
        };
        refused.fetch = async () => {
            refusedFetches += 1;

            return publicThread(THREAD, CHANNEL);
        };

        value.deliver(
            discordMessage({ channel: failing }),
            discordMessage({ id: '300000000000000002', channel: publicThread(THREAD, null) }),
            discordMessage({
                id: '300000000000000003', 
                channel: refused, 
                author: { id: MALLORY }, 
            }),
        );
        await settle();

        expect(await value.runs()).toHaveLength(0);
        expect(refusedFetches).toBe(0);
    });

    it('drops a hand-over still waiting when the channel stops, also after a restart', async () => {
        const value = await started();
        const stalled = publicThread(THREAD, null);
        let release!: () => void;

        stalled.fetch = () => new Promise((resolve) => {
            release = () => resolve(publicThread(THREAD, CHANNEL));
        });

        value.deliver(discordMessage({ channel: stalled }));
        await settle();
        await value.engine.stop();
        await value.engine.start();
        value.ready();
        release();
        await settle();

        expect(await value.runs()).toHaveLength(0);
    });

    it('bounds the hand-overs waiting per conversation and reports the dropped message', async () => {
        const value = await started();
        const stalled = publicThread(THREAD, null);

        stalled.fetch = () => new Promise(() => {
            // never settles: every later message waits
        });

        for (let index = 0; index <= DISCORD_HANDOVER_MAX_PENDING; index += 1) {
            value.deliver(discordMessage({ id: String(300000000000000100n + BigInt(index)), channel: stalled }));
        }

        await settle();

        const dropped = value.errors.filter((error) => String((error as Error).message).includes('waiting'));

        expect(dropped).toHaveLength(1);
        expect(String((dropped[0] as Error).message)).not.toContain(SENTINEL_TOKEN);
    });

    it('starts one tainted run for an allowed mention, with the parsed text and ids only', async () => {
        const value = await started();

        expect(value.setup.status()).toBe('connected');

        value.deliver(discordMessage());
        await settle();

        const runs = await value.runs();

        expect(runs).toHaveLength(1);
        expect(runs[0]?.taint?.source).toBe('channel:chat');
        expect(payloadOf(runs[0])).toEqual({
            adapter: 'discord',
            event: 'mention',
            threadId: `discord:400000000000000001:${CHANNEL}`,
            channelId: `discord:400000000000000001:${CHANNEL}`,
            message: {
                id: '300000000000000001',
                text: expect.stringContaining('hello'),
                author: { id: ALICE, name: 'Ada' },
                sentAt: '2026-11-03T10:00:00.000Z',
            },
        });
        expect(runs[0]?.trigger.invoker).toEqual({
            id: ALICE,
            kind: 'discord',
            bindings: [],
        });
        expect(JSON.stringify(runs)).not.toContain(SENTINEL_TOKEN);
        expect(value.errors).toEqual([]);
    });

    it('binds a conversation agent to the account alias, the adapter thread and the narrowest audience', async () => {
        const value = await started({
            agents: (channel) => [defineModelAgent({
                name: 'assistant',
                model: mockModel([
                    { parts: [{ type: 'text', text: 'a' }] },
                    { parts: [{ type: 'text', text: 'b' }] },
                    { parts: [{ type: 'text', text: 'c' }] },
                    { parts: [{ type: 'text', text: 'd' }] },
                ]),
                instructions: 'Answer.',
                conversation: true,
                channels: [channel.on()],
            })],
        });

        value.deliver(
            discordMessage({ id: '300000000000000011', content: 'top' }),
            discordMessage({
                id: '300000000000000012',
                content: 'public',
                channel: publicThread(),
            }),
            discordMessage({
                id: '300000000000000013',
                content: 'private',
                channel: privateThread('600000000000000002'),
            }),
            discordMessage({
                id: '300000000000000014',
                content: 'direct',
                guildId: null,
                mentions: {},
            }),
        );
        await settle(20);

        const targets = value.access
            .filter((item) => item.operation === 'dispatch')
            .map((item) => ({
                account: item.identity.account,
                chat: item.identity.chat,
                audience: item.identity.audience,
            }));

        expect(targets.sort((a, b) => (a.chat < b.chat ? -1 : 1))).toEqual([
            {
                account: ACCOUNT,
                chat: `discord:400000000000000001:${CHANNEL}`,
                audience: `channel:${CHANNEL}`,
            },
            {
                account: ACCOUNT,
                chat: `discord:400000000000000001:${CHANNEL}:${THREAD}`,
                audience: `channel:${CHANNEL}`,
            },
            {
                account: ACCOUNT,
                chat: `discord:400000000000000001:${CHANNEL}:600000000000000002`,
                audience: 'thread:600000000000000002',
            },
            {
                account: ACCOUNT,
                chat: `discord:@me:${DM_CHANNEL}`,
                audience: `direct:${ALICE}`,
            },
        ]);
        expect(await value.runs()).toHaveLength(4);
    });

    it('refuses a message of an unknown guild silently: no run, no fetch, no client call, no invoker lookup', async () => {
        const decided: DiscordIdentity[] = [];
        const value = await started({
            patch: {
                resolveInvoker: (identity) => {
                    decided.push(identity);

                    return {
                        id: identity.author,
                        kind: 'discord',
                        bindings: [],
                    };
                },
            },
        });
        const before = clientTrace(value.clients);

        value.deliver(
            discordMessage({ guildId: OTHER_GUILD }),
            discordMessage({ id: '300000000000000002', author: { id: MALLORY } }),
            discordMessage({ id: '300000000000000003', mentions: {} }),
        );
        await settle();

        expect(await value.runs()).toEqual([]);
        expect(value.fetch.calls).toEqual([]);
        expect(clientTrace(value.clients)).toBe(before);
        expect(decided).toEqual([]);
        expect(value.errors).toEqual([]);
    });

    it('refuses an allowed message with an attachment or without text as ValidationError, with no run', async () => {
        const value = await started();

        value.deliver(
            discordMessage({ content: `<@${BOT}> private caption`, attachments: [attachment()] }),
            discordMessage({ id: '300000000000000002', content: ' '.repeat(3) }),
        );
        await settle();

        expect(await value.runs()).toEqual([]);
        expect(value.errors).toHaveLength(2);
        expect(value.errors.every((error) => error instanceof ValidationError)).toBe(true);
        expect(value.errors.map((error) => (error as Error).message).join('\n')).toMatch(/attachments are not supported[\s\S]*no text/);
        expect(JSON.stringify(value.errors, ['message', 'code'])).not.toContain('private caption');
        expect(value.fetch.calls).toEqual([]);
    });

    it('starts no run when resolveInvoker names no invoker', async () => {
        const value = await started({ patch: { resolveInvoker: () => undefined } });

        value.deliver(discordMessage());
        await settle();

        expect(await value.runs()).toEqual([]);
        expect(value.errors).toEqual([]);
    });

    it('hands the messages of one channel over in arrival order, another channel unblocked', async () => {
        const calls: string[] = [];
        const first = Promise.withResolvers<void>();
        const value = await started({
            patch: {
                resolveInvoker: async (identity) => {
                    calls.push(identity.chat);

                    if (calls.length === 1) {
                        await first.promise;
                    }

                    return {
                        id: identity.author,
                        kind: 'discord',
                        bindings: [],
                    };
                },
            },
        });

        value.deliver(
            discordMessage({ id: '300000000000000001', content: `<@${BOT}> one` }),
            discordMessage({ id: '300000000000000002', content: `<@${BOT}> two` }),
            discordMessage({
                id: '300000000000000003',
                content: `<@${BOT}> elsewhere`,
                channel: guildText(OTHER_CHANNEL),
            }),
        );
        await settle();

        try {
            // the second message of the channel waits for the first; the other channel does not
            expect(calls).toEqual([
                `discord:400000000000000001:${CHANNEL}`,
                `discord:400000000000000001:${OTHER_CHANNEL}`,
            ]);
            expect((await value.runs()).map((run) => payloadOf(run).message.id)).toEqual(['300000000000000003']);
        } finally {
            first.resolve();
        }

        await settle();

        const ids = (await value.runs()).map((run) => payloadOf(run).message.id);

        expect(ids.sort()).toEqual(['300000000000000001', '300000000000000002', '300000000000000003']);
        expect(calls).toHaveLength(3);
    });
});

describe('Discord outbound', () => {
    it('a reply tool posts to the source channel through REST with no pings and an enforced nonce', async () => {
        const value = await started({
            agents: (channel) => [agentWith(channel, async (context) => {
                await context.channels.findOneOrFail('chat').emit({ body: 'Reply @everyone.', key: 'greeting' });

                return 'ok';
            })],
        });

        value.deliver(discordMessage());
        await settle();
        await value.engine.idle();

        const [run] = await value.runs();

        expect(run?.status).toBe('completed');
        expect(value.fetch.calls).toHaveLength(1);

        const [call] = value.fetch.calls;

        expect(call?.url).toBe(`${DISCORD_API_URL}/channels/${CHANNEL}/messages`);
        expect(call?.init.method).toBe('POST');
        expect(new Headers(call?.init.headers).get('authorization')).toBe(`Bot ${SENTINEL_TOKEN}`);

        const body = bodyOf(call);

        expect(body).toEqual({
            content: 'Reply @everyone.',
            allowed_mentions: { parse: [] },
            nonce: expect.stringMatching(/^[0-9a-f]{25}$/),
            enforce_nonce: true,
        });
        expect(JSON.stringify(await value.runs())).not.toContain(SENTINEL_TOKEN);
        expect(JSON.stringify(await value.store.steps.find(run!.id))).not.toContain(SENTINEL_TOKEN);
    });

    it('a reply in a thread goes to the thread, a DM reply to the DM channel', async () => {
        const value = await started({
            agents: (channel) => [agentWith(channel, async (context) => {
                await context.channels.findOneOrFail('chat').emit({ body: 'Reply.' });

                return 'ok';
            })],
        });

        value.deliver(discordMessage({ channel: publicThread() }));
        await settle();
        await value.engine.idle();

        expect(value.fetch.calls.map((call) => call.url)).toEqual([`${DISCORD_API_URL}/channels/${THREAD}/messages`]);
    });

    it('sends to a DM channel', async () => {
        const value = await started();

        await send(value, message('k1', 'hi'), `discord:@me:${DM_CHANNEL}`);

        expect(value.fetch.calls.map((call) => call.url)).toEqual([`${DISCORD_API_URL}/channels/${DM_CHANNEL}/messages`]);
        expect(bodyOf(value.fetch.calls[0]).nonce).toBe(nonceOf('chat', DM_CHANNEL, 'k1'));
    });

    it('sends 2000 characters and refuses 2001 before any fetch', async () => {
        const value = await started();
        const thread = `discord:400000000000000001:${CHANNEL}`;

        expect(DISCORD_TEXT_MAX_CHARS).toBe(2000);

        await send(value, message('k1', 'x'.repeat(2000)), thread);

        await expect(send(value, message('k2', 'x'.repeat(2001)), thread)).rejects.toThrow(ValidationError);
        await expect(send(value, message('k3', 'x'.repeat(2001)), thread)).rejects.toThrow(/2000/);
        expect(value.fetch.calls).toHaveLength(1);
        expect(bodyOf(value.fetch.calls[0]).content).toHaveLength(2000);
    });

    it('sends an approval as an ids-only link that fits 2000 characters, its prose cut', async () => {
        const value = await started({
            agents: (channel) => [agentWith(channel, async (context) => {
                await context.channels.findOneOrFail('chat').approve({
                    title: 'Deploy?',
                    body: 'y'.repeat(3000),
                });

                return 'ok';
            })],
        });

        value.deliver(discordMessage());
        await settle();
        await value.engine.idle();

        const [run] = await value.runs();

        expect(run?.status).toBe('waiting');
        expect(value.fetch.calls).toHaveLength(1);

        const content = String(bodyOf(value.fetch.calls[0]).content);
        const approvalId = run?.waiting?.kind === 'approval' ? run.waiting.approvalId : '';

        expect(content.length).toBeLessThanOrEqual(2000);
        expect(content.length).toBeGreaterThan(1900);
        expect(content).toContain('(cut, ');
        expect(content.endsWith(APPROVAL_URL({
            runId: run!.id,
            approvalId,
            agent: 'helper',
        }))).toBe(true);
        expect(bodyOf(value.fetch.calls[0]).allowed_mentions).toEqual({ parse: [] });
    });

    it('sends while the Gateway is disconnected: REST does not depend on it', async () => {
        const value = await started();

        value.clients.last().emit(Events.ShardDisconnect, { code: 1006 }, 0);

        expect(value.setup.status()).toBe('disconnected');

        await send(value, message('k1', 'still here'), `discord:400000000000000001:${CHANNEL}`);

        expect(value.fetch.calls).toHaveLength(1);
    });

    it('sends nothing before the channel started', async () => {
        const value = createDiscordFixture();

        await expect(send(value, message('k1', 'early'), `discord:400000000000000001:${CHANNEL}`)).rejects.toBeDefined();
        expect(value.fetch.calls).toEqual([]);
        expect(value.tokenReads.count).toBe(0);
    });
});
