<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/chat" width="128" height="128" />
</p>

<h1 align="center">@chamvi/chat</h1>

<p align="center">
    <b>Chat channels for chamvi agents.</b><br>
    Chat SDK adapters start runs and get replies through one channel,<br>
    and platform packages plug into it through a public seam.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/chat"><img src="https://img.shields.io/npm/v/@chamvi/chat" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/chat/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/chat" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Webhooks](#webhooks)
- [Platform packages](#platform-packages)
- [Subscriptions and replies](#subscriptions-and-replies)
- [Memory](#memory)
- [Trust](#trust)
- [Limits](#limits)
- [With @chamvi/app](#with-chamviapp)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/chat @chamvi/core @chamvi/http chat --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/core`, `@chamvi/http` (the webhook body reader) and [`chat`](https://www.npmjs.com/package/chat) (the Chat SDK, 4.44 or later in the 4.x line) are peer dependencies; `smob` is the only runtime dependency. `@chamvi/app` is an optional peer of `@chamvi/chat/module`. The package imports no platform SDK: WhatsApp Web lives in [`@chamvi/chat-whatsapp`](https://www.npmjs.com/package/@chamvi/chat-whatsapp).

| Entry | Holds |
|---|---|
| `@chamvi/chat` | `chatChannel()`, `createChatIngressAdapter()`, `chat.on()`/`chat.to()`, the platform seam `IChatPlatform`, the limits and error codes |
| `@chamvi/chat/module` | `chatModule()`, which contributes a prebuilt channel to a `@chamvi/app` app |

## Usage

Any Chat SDK `Adapter` works through the channel. Wrap it with `createChatIngressAdapter()` before registering it with the `Chat`, so chamvi's intake, not the SDK's handlers and pre-handler deduplication, accepts its messages; the channel owns that `Chat` alone. Register the channel on the engine, subscribe an agent with `channel.on()` and reply from a tool with `ctx.channels.findOneOrFail('chat').emit()`:

```typescript
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { Chat } from 'chat';
import type { Adapter, StateAdapter } from 'chat';
import {
    Engine,
    createMemoryStore,
    defineModelAgent,
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

    const assistant = defineModelAgent({
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
```

Nothing initializes when the channel is built: the channel's `start` (the engine's) binds the adapters, initializes the `Chat`, then calls `connect`. `allowMessage` is required for every adapter (who may start runs); `resolveInvoker` names the runs' invoker (none by default); `connect`/`disconnect` hook a socket-style adapter into the channel's start and stop. A message starts runs only when `allowMessage` allows it; a refused message is dropped silently: no run, no reply, no download. Generic webhook adapters are covered by tests with fake adapters only: chamvi has verified no platform but WhatsApp Web.

## Webhooks

A webhook adapter's platform posts to `POST /channels/<channel>/<adapter>` (the http app's channel mount; only the adapters listed in `webhooks`, anything else 404). The body is read up to `CHAT_BODY_LIMIT_BYTES` (1 MiB, 413 above it) and handed to the adapter's own `handleWebhook`, which verifies the request. The answer waits until every message the adapter handed over is stored as runs (at most `CHAT_WEBHOOK_TIMEOUT_MS`, 30 s), and is a 503 when one could not be for a reason a redelivery may fix (a store failure, the channel not started or stopping, the timeout), so the platform redelivers. A message only refused (media, no text, invalid ids, a denied conversation, a throwing filter) is reported once and gets the adapter's own answer, since a redelivery would be refused again. GET challenge flows are not served. Only messages the adapter hands over within the request's async context are tracked: an adapter that passes them to a consumer started outside it (a queue, a pre-request listener) is not waited for, and its own 2xx stands. The mount sits under the http app's general rate limit unless `channelRateLimits` names the channel.

## Platform packages

A platform package (such as [`@chamvi/chat-whatsapp`](https://www.npmjs.com/package/@chamvi/chat-whatsapp)) builds its `Chat`, its wrapped adapter and a `chatChannel()` like any app, and passes what only the transport knows as `platform` (`IChatPlatform`, every hook optional and called on the platform object):

| Hook | Runs | Answers |
|---|---|---|
| `online()` | per send, after `prepare`, only while the channel is started | false refuses the send (`chat_request`, nothing posted); default true |
| `prepare({ adapter, threadId, text, key })` | per send, after the address decoded and the message rendered, before `online` | a throw refuses the target (its error as is); else the post `(signal) => Promise` the channel calls once, bounded by `timeoutMs` and the send's signal (a failure a `chat_request`); its `signal` aborts at whichever comes first, so the platform can cancel its request; `key` is the message key, so a transport can derive a stable message id. Default the adapter's `postMessage(threadId, { raw: text })` |
| `conversationTarget(incoming, payload)` | per agent with `conversation`, after `allowMessage`, the text checks and `resolveInvoker` | the conversation identity; undefined refuses that agent (`chat_intake_failed`), a throw fails the message. Default from the payload |

The channel checks the platform at construction (`InvalidAgentDefinitionError` for one that is no object, a hook that is no function, or a plain object with a key that is no hook). Its socket lifecycle stays with `connect`/`disconnect`, its message policy with `allowMessage`/`resolveInvoker`.

## Subscriptions and replies

`channel.on({ adapter?, events?, id?, filter?, concurrencyMaxRuns? })` subscribes an agent; `events` are `direct` (a direct chat), `mention` (the bot mentioned in a group) and `message` (any other group message), default `['direct', 'mention']`. `chat.on()` does the same for the channel named `chat`. A run's payload is a small `ChatPayload` (`adapter`, `event`, `threadId`, `channelId`, `message: { id, text, author, sentAt? }`), never the platform's raw object; its address is the chat, so a tool's `emit()` without an address replies there. `channel.to({ adapter, threadId })` builds the address of another chat.

A message is accepted once per agent (the idempotency key hashes channel, adapter, thread, sender and message id), so a redelivery starts no second run; a transient store failure is retried twice (1 s, 2 s), then reported as `chat_intake_failed`.

Approvals (`ctx.channels.findOneOrFail('chat').approve()`) send a text with the title, the body (cut to fit), the options and the `approvalUrl` link (`Approve or deny: <link>`, with options `Choose and approve or deny: <link>`); the owner answers in the chamvi UI. The link carries ids only; there are no native buttons, and a reply in the chat does not answer an approval.

## Memory

An agent with `conversation: true` gets one memory per chat through core's [conversation memory](https://chamvi.dev/guide/conversations): the channel binds each message through the engine's trusted conversation intake, never through a payload field. It needs a store with `conversations` (`createMemoryStore()` or `@chamvi/store-db`) and the engine's `conversations: { authorize }` (`createApp({ conversations })`). The identity is the channel, the `account` alias, the chat and an audience: `direct:<sender>` for a direct chat, `group:<channel id>` for a group, so a group shares one memory among its members. Accepted message text and replies emitted to the source chat are remembered; `history: 0` is the only setting (no platform history is fetched). A platform package may name its own identity (`IChatPlatform.conversationTarget`).

## Trust

Every run a chat channel starts is tainted (`untrusted: true` by default; `false` only for a fully trusted private deployment), so tools classified `guardWhenTainted` ask for approval (or are denied) in these runs. A reply to the source chat is exempt from the outbound gate; a send to another chat goes through it. A configured `defaultAddress` is exempt too: it is an ungated sink for tainted runs, so none is set by default.

## Limits

- Text only: a message with attachments or without text is refused (reported, no run). No media download.
- No history (`history: 0`), no message splitting: a message above `maxTextChars` (default `CHAT_TEXT_MAX_CHARS`, 4096 UTF-16 code units) is refused; an approval cuts only its prose.
- `ChannelMessage.slot` is ignored: every message is a new chat message.
- Delivery is at least once: a send is bounded by `timeoutMs` (default `CHAT_TIMEOUT_MS`, 30 s); a send that times out may still be delivered and a retry may send it again. A send while the channel is stopped or draining fails.

## With @chamvi/app

```ts
import { createApp } from '@chamvi/app';
import { chatChannel } from '@chamvi/chat';
import { chatModule } from '@chamvi/chat/module';

const channel = chatChannel({ ... });

export default createApp({
    agents: [assistant],
    modules: [chatModule({ channel })],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
```

`chatModule()` contributes the channel to `AppToken.CHANNELS` (module name `chamvi:channel:<name>`); the engine starts and stops it, and the http module mounts its `in` when it serves webhooks. It adds no env variable and constructs nothing, so `chamvi start --check` neither initializes the `Chat` nor connects.

## API

| Export | Entry |
|---|---|
| `chatChannel(options)`, `createChatIngressAdapter(adapter)`, `chat`, `chatAddress()`, `createChatSubscription()` | `@chamvi/chat` |
| Types `ChatChannelOptions`, `ChatChannel`, `ChatPayload`, `ChatEvent`, `ChatIncoming`, `ChatIngress`, `ChatApprovalRef`, `IChatPlatform`, `ChatPlatformSend`, `ChatPlatformPost` | `@chamvi/chat` |
| `CHAT_CHANNEL_NAME` `'chat'`, `CHAT_TEXT_MAX_CHARS` 4096, `CHAT_TIMEOUT_MS` 30 000, `CHAT_BODY_LIMIT_BYTES` 1 MiB, `CHAT_WEBHOOK_TIMEOUT_MS` 30 000, `CHAT_STOP_TIMEOUT_MS` 30 000, `CHAT_EVENTS`, `DEFAULT_CHAT_EVENTS`, `CHAT_ADDRESS_PREFIX` | `@chamvi/chat` |
| Error codes `chat_request`, `chat_intake_failed`, `chat_stop_timeout` (`CHAT_*_ERROR_CODE`) | `@chamvi/chat` |
| `chatModule(options)`, `ChatModule` | `@chamvi/chat/module` |

The full option reference is the [chat reference](https://chamvi.dev/reference/chat).

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
