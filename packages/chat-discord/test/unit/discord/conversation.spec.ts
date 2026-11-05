/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError, defineModelAgent, defineTool } from '@chamvi/core';
import type { IEngine, Run } from '@chamvi/core';
import { cron, cronChannel, fireCronSubscription } from '@chamvi/channel-cron';
import { DISCORD_API_URL } from '@chamvi/chat-discord';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    ACCOUNT,
    ALICE,
    CHANNEL,
    DM_CHANNEL,
    GUILD,
    THREAD,
    bodyOf,
    createDiscordFixture,
    discordMessage,
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

const text = (value: string): MockResponse => ({ parts: [{ type: 'text', text: value }] });

/** A conversation agent of the Discord channel. */
function conversational(responses: MockResponse[] = [text('a')]): DiscordFixtureInput {
    return {
        agents: (channel) => [defineModelAgent({
            name: 'assistant',
            model: mockModel(responses),
            instructions: 'Answer.',
            conversation: true,
            channels: [channel.on()],
        })],
    };
}

/** The conversation identity and source address intake gave the only run. */
async function intakeOf(value: DiscordFixture) {
    const runs = await value.runs();

    expect(runs).toHaveLength(1);

    const run = runs[0] as Run;
    const identity = run.conversation?.scope.identity;

    return {
        channel: identity?.channel,
        account: identity?.account,
        chat: identity?.chat,
        audience: identity?.audience,
        address: run.trigger.address,
    };
}

describe('DiscordChatSetup.conversation()', () => {
    it('names the conversation intake computes for a DM of that user', async () => {
        const value = await started(conversational());

        value.deliver(discordMessage({
            content: 'hi',
            guildId: null,
            mentions: {},
        }));
        await settle(20);

        const ref = value.setup.conversation({ threadId: `discord:@me:${DM_CHANNEL}`, user: ALICE });

        expect(ref).toEqual(await intakeOf(value));
        expect(ref).toMatchObject({
            channel: 'chat',
            account: ACCOUNT,
            chat: `discord:@me:${DM_CHANNEL}`,
            audience: `direct:${ALICE}`,
        });
    });

    it('names the conversation intake computes for a guild channel', async () => {
        const value = await started(conversational());

        value.deliver(discordMessage());
        await settle(20);

        const ref = value.setup.conversation({ threadId: `discord:${GUILD}:${CHANNEL}` });

        expect(ref).toEqual(await intakeOf(value));
        expect(ref.audience).toBe(`channel:${CHANNEL}`);
    });

    it('refuses a malformed thread id, a DM without its user, a user outside a DM and a thread', () => {
        const value = createDiscordFixture();
        const refused = [
            { threadId: 'discord:@me' },
            { threadId: `slack:@me:${DM_CHANNEL}`, user: ALICE },
            { threadId: 'discord:@me:general', user: ALICE },
            { threadId: `discord:@me:${DM_CHANNEL}` },
            { threadId: `discord:@me:${DM_CHANNEL}`, user: 'alice' },
            { threadId: `discord:${GUILD}:${CHANNEL}`, user: ALICE },
            { threadId: `discord:${GUILD}:${CHANNEL}:${THREAD}` },
            { threadId: 42 },
        ];

        for (const input of refused) {
            expect(() => value.setup.conversation(input as never)).toThrow(InvalidAgentDefinitionError);
        }
    });

    it('lets a cron subscription post into a DM and the next DM recall it', async () => {
        const reply = defineTool({
            inputSchema: jsonSchema<{ body: string }>({
                type: 'object',
                properties: { body: { type: 'string' } },
                required: ['body'],
            }),
            execute: async ({ body }, { context }) => {
                await context.channels.findOneOrFail('chat').emit({ body });

                return 'sent';
            },
        });
        const model = mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'reply',
                    input: { body: 'Three meetings today.' },
                }],
            },
            text('done'),
            text('You have three.'),
        ]);
        let subscription: ReturnType<typeof cron.on> | undefined;
        const value = await started({
            channels: [cronChannel()],
            agents: (channel, setup) => {
                subscription = cron.on('0 7 * * *', {
                    id: 'briefing',
                    timezone: 'UTC',
                    conversation: setup.conversation({ threadId: `discord:@me:${DM_CHANNEL}`, user: ALICE }),
                    text: 'Write my morning briefing.',
                });

                return [defineModelAgent({
                    name: 'assistant',
                    model,
                    instructions: 'Answer.',
                    conversation: true,
                    tools: { reply },
                    channels: [subscription, channel.on()],
                })];
            },
        });
        const agent = value.engine.getAgent('assistant');

        expect(agent).toBeDefined();
        expect(await fireCronSubscription({
            engine: value.engine,
            agent: agent!,
            subscription: subscription!,
            scheduledAt: new Date('2026-11-04T07:00:00.000Z'),
        })).toMatchObject({ dispatched: true });
        await value.engine.idle();

        expect(value.fetch.calls.map((call) => call.url)).toEqual([`${DISCORD_API_URL}/channels/${DM_CHANNEL}/messages`]);
        expect(bodyOf(value.fetch.calls[0])).toMatchObject({ content: 'Three meetings today.' });

        value.clock.advance(1000);
        value.deliver(discordMessage({
            id: '300000000000000021',
            content: 'how many meetings?',
            guildId: null,
            mentions: {},
        }));
        await settle(20);
        await value.engine.idle();

        const runs = await value.runs();

        expect(runs.map((run) => run.status)).toEqual(['completed', 'completed']);
        expect(new Set(runs.map((run) => run.trigger.address)).size).toBe(1);
        expect(runs[1]?.conversation?.scope.id).toBe(runs[0]?.conversation?.scope.id);

        const prompt = model.doStreamCalls[2]?.prompt ?? [];
        const recalled = prompt.map((message) => ({ role: message.role, text: JSON.stringify(message.content) }));
        const user = recalled.findIndex((m) => m.role === 'user' && m.text.includes('Write my morning briefing.'));
        const assistant = recalled.findIndex((m) => m.role === 'assistant' && m.text.includes('Three meetings today.'));
        const current = recalled.findIndex((m) => m.role === 'user' && m.text.includes('how many meetings?'));

        expect(user).toBeGreaterThanOrEqual(0);
        expect(assistant).toBeGreaterThan(user);
        expect(current).toBeGreaterThan(assistant);
        expect(value.errors).toEqual([]);
    });
});
