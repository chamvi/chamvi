import type { LanguageModel } from 'ai';
import { Chat } from 'chat';
import type { Adapter, StateAdapter } from 'chat';
import { z } from 'zod';
import { createApp } from '@chamvi/app';
import {
    Engine,
    createMemoryStore,
    defineAgent,
    defineTool,
} from '@chamvi/core';
import { chatChannel, createChatIngressAdapter } from '@chamvi/chat';
import type { IChatPlatform } from '@chamvi/chat';
import { chatModule } from '@chamvi/chat/module';
import { createWhatsAppChat } from '@chamvi/chat-whatsapp';
import type { IWhatsAppAuthProvider } from '@chamvi/chat-whatsapp';

declare const model: LanguageModel;
// your secure, exclusive session store (chamvi ships none)
declare const auth: IWhatsAppAuthProvider;
// a Chat SDK state adapter
declare const state: StateAdapter;
// any Chat SDK adapter of a webhook platform
declare const platformAdapter: Adapter;
// a platform client of your own
declare const client: { connected: boolean; send(threadId: string, text: string, messageId: string): Promise<void> };
declare function showQr(qr: string): void;

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
    // the client posts itself, with a message id derived from the message key
    prepare: ({
        threadId,
        text,
        key,
    }) => () => client.send(threadId, text, key),
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

export const assistant = defineAgent({
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
export const whatsappAssistant = defineAgent({
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
