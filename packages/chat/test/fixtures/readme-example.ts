import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { Chat } from 'chat';
import type { Adapter, StateAdapter } from 'chat';
import {
    Engine,
    createMemoryStore,
    defineAgent,
    defineTool,
} from '@chamvi/core';
import type { IClock, IEngine } from '@chamvi/core';
import { chatChannel, createChatIngressAdapter } from '@chamvi/chat';

export function createChatEngine(
    model: LanguageModel,
    // adapter: any Chat SDK adapter whose platform posts webhooks; state: a Chat SDK state adapter
    options: {
        adapter: Adapter;
        state: StateAdapter;
        clock?: IClock
    },
): IEngine {
    const { CHAT_USERS, APP_URL } = process.env;

    if (!CHAT_USERS || !APP_URL) {
        throw new Error('Set CHAT_USERS (platform user ids, comma separated) and APP_URL.');
    }

    const allowed = new Set(CHAT_USERS.split(','));

    // chamvi's intake, not the Chat SDK's handlers, accepts the adapter's messages
    const ingress = createChatIngressAdapter(options.adapter);
    const chat = new Chat({
        userName: 'chamvi',
        adapters: { [ingress.name]: ingress },
        state: options.state,
        logger: 'warn',
        concurrency: 'concurrent',
    });

    const channel = chatChannel({
        chat,
        adapters: [ingress],
        // the platform posts to POST /channels/chat/<adapter> (the http app's channel mount)
        webhooks: [ingress.name],
        // only these users start runs; everybody else is ignored
        allowMessage: ({ message }) => allowed.has(message.author.userId),
        resolveInvoker: ({ message }) => ({
            id: message.author.userId,
            kind: 'chat',
            permissions: [],
        }),
        // a link to the approval in the chamvi UI: ids only, answered there
        approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
    });

    const reply = defineTool({
        description: 'Reply in the chat the message came from.',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }, { context }) => {
            // the source chat: no address needed
            await context.channels.findOneOrFail('chat').emit({ body: text });

            return 'sent';
        },
    });

    const assistant = defineAgent({
        name: 'assistant',
        model,
        instructions: 'You are the team\'s assistant. Answer with the reply tool.',
        // one memory per direct chat and one per group
        conversation: true,
        // direct messages and mentions in a group
        channels: [channel.on()],
        tools: { reply },
    });

    return new Engine({
        // memory store: conversations included; use @chamvi/store-db in production
        store: createMemoryStore({ clock: options.clock }),
        agents: [assistant],
        channels: [channel],
        clock: options.clock,
        conversations: { authorize: ({ agent }) => agent === 'assistant' },
    });
}
