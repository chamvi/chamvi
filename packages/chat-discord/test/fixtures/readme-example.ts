import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { createApp, defineModelAgent, defineTool } from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import { chatModule } from '@chamvi/chat/module';
import { createDiscordChat } from '@chamvi/chat-discord';
import type { DiscordChatOptions } from '@chamvi/chat-discord';

export function createDiscordApp(
    model: LanguageModel,
    // state: a Chat SDK state adapter
    options: Pick<DiscordChatOptions, 'state' | 'clientFactory' | 'fetch'>,
): IApp {
    const {
        DISCORD_BOT_TOKEN,
        DISCORD_APPLICATION_ID,
        DISCORD_GUILD_ID,
        DISCORD_USER_IDS,
        APP_URL,
    } = process.env;

    if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID || !DISCORD_USER_IDS || !APP_URL) {
        throw new Error('Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DISCORD_USER_IDS (comma separated) and APP_URL.');
    }

    const discord = createDiscordChat({
        // a non-secret alias of the bot (the conversation account)
        account: 'assistant',
        // read from the environment per login and per send; never stored or logged
        token: async () => process.env.DISCORD_BOT_TOKEN ?? '',
        applicationId: DISCORD_APPLICATION_ID,
        // ids only: these users in this guild, when they mention the bot or reply to it
        policy: { guilds: [DISCORD_GUILD_ID], users: DISCORD_USER_IDS.split(',').map((id) => id.trim()) },
        resolveInvoker: (identity) => ({
            id: identity.author,
            kind: 'discord',
            permissions: [],
        }),
        // a link to the approval in the chamvi UI: ids only, answered there
        approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
        ...options,
    });

    const reply = defineTool({
        description: 'Reply in the channel or thread the message came from.',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }, { context }) => {
            // the source channel or thread: no address needed, and the reply pings nobody
            await context.channels.findOneOrFail('chat').emit({ body: text });

            return 'sent';
        },
    });

    const assistant = defineModelAgent({
        name: 'assistant',
        model,
        instructions: 'You are the team\'s assistant on Discord. Answer with the reply tool.',
        // one memory per thread and one per channel's top-level messages
        conversation: true,
        // mentions and replies in an allowed guild
        channels: [discord.channel.on()],
        tools: { reply },
    });

    // chatModule() contributes the channel; the engine starts and stops it
    return createApp({
        agents: [assistant],
        modules: [chatModule({ channel: discord.channel })],
        conversations: { authorize: ({ agent }) => agent === 'assistant' },
    });
}
