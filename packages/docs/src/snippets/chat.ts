import type { LanguageModel } from 'ai';
import { Chat } from 'chat';
import type { Adapter, StateAdapter } from 'chat';
import { z } from 'zod';
import { createApp } from '@chamvi/app';
import { cron } from '@chamvi/channel-cron';
import {
    Engine,
    createMemoryStore,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import { chatChannel, createChatIngressAdapter } from '@chamvi/chat';
import type { IChatPlatform } from '@chamvi/chat';
import { chatModule } from '@chamvi/chat/module';
import { createDiscordChat } from '@chamvi/chat-discord';
import { discordModule } from '@chamvi/chat-discord/module';
import { chatDiscordUiModule } from '@chamvi/chat-discord-ui/module';
import { createWhatsAppChat } from '@chamvi/chat-whatsapp';
import type { IWhatsAppAuthProvider } from '@chamvi/chat-whatsapp';
import { whatsappModule } from '@chamvi/chat-whatsapp/module';
import { chatWhatsappUiModule } from '@chamvi/chat-whatsapp-ui/module';

declare const model: LanguageModel;
// an exclusive session store of your own (or whatsappModule's, below)
declare const auth: IWhatsAppAuthProvider;
// a Chat SDK state adapter
declare const state: StateAdapter;
// any Chat SDK adapter of a webhook platform
declare const platformAdapter: Adapter;
// a platform client of your own
declare const client: { connected: boolean; send(threadId: string, text: string, messageId: string, signal: AbortSignal): Promise<void> };
declare function showQr(qr: string): void;
// the bot token from your secret store, read per login and per send
declare function readDiscordToken(): Promise<string>;

const approvalUrl = ({ runId, approvalId }: { runId: string; approvalId: string }) => `https://chamvi.example/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`;

// #region generic
const ingress = createChatIngressAdapter(platformAdapter);
const chat = new Chat({
    userName: 'chamvi',
    adapters: { [ingress.name]: ingress },
    state,
    concurrency: 'concurrent',
});

export const channel = chatChannel({
    chat,
    adapters: [ingress],
    // required for every adapter: who may start runs
    allowMessage: ({ message }) => message.author.userId === 'U0123',
    // served at POST /channels/chat/<adapter>
    webhooks: [ingress.name],
    approvalUrl,
});
// #endregion generic

// #region platform
// passed as chatChannel({ ..., platform }) by a platform package
export const platform: IChatPlatform = {
    // sends go out only while the client is connected
    online: () => client.connected,
    // the client posts itself, with a message id derived from the message key;
    // the signal aborts at the send's deadline or when the channel stops waiting
    prepare: ({
        threadId,
        text,
        key,
    }) => (signal) => client.send(threadId, text, key, signal),
    // the conversation of a message for an agent with `conversation`
    conversationTarget: (_incoming, payload) => ({
        account: 'team',
        chat: payload.threadId,
        audience: `room:${payload.channelId}`,
        text: payload.message.text,
    }),
};
// #endregion platform

// #region agent
const reply = defineTool({
    description: 'Reply in the chat the message came from.',
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }, { context }) => {
        // the source chat: no address, and no outbound gate in a tainted run
        await context.channels.findOneOrFail('chat').emit({ body: text });

        return 'sent';
    },
});

export const assistant = defineModelAgent({
    name: 'assistant',
    model,
    instructions: 'Answer with the reply tool.',
    // one memory per direct chat and one per group
    conversation: true,
    // direct messages and group mentions (events: ['direct', 'mention'])
    channels: [channel.on()],
    tools: { reply },
});

export const engine = new Engine({
    store: createMemoryStore(),
    agents: [assistant],
    channels: [channel],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
// #endregion agent

// #region module
export default createApp({
    agents: [assistant],
    modules: [chatModule({ channel })],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
// #endregion module

// #region whatsapp
const whatsapp = createWhatsAppChat({
    // a non-secret alias of the account (the conversation account)
    account: 'assistant',
    auth,
    state,
    // placeholder jids: phone number jids, no device suffix; groups need a mention by default
    policy: { senders: ['491701111111@s.whatsapp.net'], groups: ['120363000000000001@g.us'] },
    // undefined denies the message
    resolveInvoker: (identity) => ({
        id: identity.sender,
        kind: 'whatsapp',
        permissions: [],
    }),
    approvalUrl,
    // render the QR for the phone; never log it
    onPairing: ({ qr }) => showQr(qr),
});
// #endregion whatsapp

// #region whatsapp-module
export const whatsappAssistant = defineModelAgent({
    name: 'assistant',
    model,
    instructions: 'Answer with the reply tool.',
    conversation: true,
    channels: [whatsapp.channel.on()],
    tools: { reply },
});

export const whatsappApp = createApp({
    agents: [whatsappAssistant],
    modules: [chatModule({ channel: whatsapp.channel })],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
// #endregion whatsapp-module

// #region whatsapp-store
// the session lives sealed in the app store, under CHAMVI_ENCRYPTION_KEYS
const phone = whatsappModule({
    // the connection: its lease, its sealed entries, /connections/whatsapp in the dashboard
    connection: 'whatsapp',
    account: 'assistant',
    state,
    policy: { senders: ['491701111111@s.whatsapp.net'] },
    resolveInvoker: (identity) => ({
        id: identity.sender,
        kind: 'whatsapp',
        permissions: [],
    }),
    // approvalUrl defaults to the dashboard under CHAMVI_PUBLIC_URL
});

export const phoneAssistant = defineModelAgent({
    name: 'assistant',
    model,
    instructions: 'Answer with the reply tool.',
    conversation: true,
    channels: [phone.on()],
    tools: { reply },
});

export const phoneApp = createApp({
    agents: [phoneAssistant],
    // no chatModule: whatsappModule contributes the channel and the connection itself;
    // chatWhatsappUiModule serves the page that shows the pairing QR
    modules: [phone, chatWhatsappUiModule()],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
// #endregion whatsapp-store

// #region discord
const discord = createDiscordChat({
    // a non-secret alias of the bot (the conversation account)
    account: 'assistant',
    token: readDiscordToken,
    // placeholder snowflakes: the bot's application id, a guild, a channel, users and a role
    applicationId: '100000000000000001',
    state,
    // ids only; guild messages must mention the bot or reply to it by default
    policy: {
        guilds: ['400000000000000001'],
        channels: ['200000000000000001'],
        users: ['500000000000000001'],
        roles: ['800000000000000001'],
        dms: { users: ['500000000000000001'] },
    },
    // undefined denies the message
    resolveInvoker: (identity) => ({
        id: identity.author,
        kind: 'discord',
        permissions: [],
    }),
    approvalUrl,
});
// #endregion discord

// #region discord-module
export const discordAssistant = defineModelAgent({
    name: 'assistant',
    model,
    instructions: 'Answer with the reply tool.',
    // one memory per thread and one per channel's top-level messages
    conversation: true,
    channels: [discord.channel.on()],
    tools: { reply },
});

export const discordApp = createApp({
    agents: [discordAssistant],
    modules: [chatModule({ channel: discord.channel })],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
// #endregion discord-module

// #region discord-app-module
// no token in code: CHAMVI_DISCORD_* or the dashboard configure the bot
const discordBot = discordModule({
    state,
    resolveInvoker: (identity) => ({
        id: identity.author,
        kind: 'discord',
        permissions: [],
    }),
});

export const discordBotAssistant = defineModelAgent({
    name: 'assistant',
    model,
    instructions: 'Answer with the reply tool.',
    conversation: true,
    channels: [discordBot.on()],
    tools: { reply },
});

export const discordBotApp = createApp({
    agents: [discordBotAssistant],
    // no chatModule: discordModule contributes the channel itself
    modules: [discordBot, chatDiscordUiModule()],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
// #endregion discord-app-module

// #region discord-cron
export const briefer = defineModelAgent({
    name: 'briefer',
    model,
    instructions: 'Write a short morning briefing and send it with the reply tool.',
    // the cron run joins the conversation, so it needs memory like the chat
    conversation: true,
    channels: [
        // later DMs from the user land in the same conversation and recall the briefing
        discord.channel.on(),
        cron.on('0 7 * * *', {
            timezone: 'Europe/Berlin',
            // the DM with user 500000000000000001: its thread id is discord:@me:<DM channel id>
            conversation: discord.conversation({ threadId: 'discord:@me:600000000000000001', user: '500000000000000001' }),
            // the user turn of each run
            text: 'Send me my morning briefing.',
        }),
    ],
    // the reply goes to the source DM: no outbound approval even in a tainted run
    tools: { reply },
});

export const brieferApp = createApp({
    agents: [briefer],
    modules: [chatModule({ channel: discord.channel })],
    // a cron dispatch has no invoker: allow it by agent (or by access.identity)
    conversations: { authorize: ({ agent }) => agent === 'briefer' },
});
// #endregion discord-cron
