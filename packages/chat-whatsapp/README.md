<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/chat-whatsapp" width="128" height="128" />
</p>

<h1 align="center">@chamvi/chat-whatsapp</h1>

<p align="center">
    <b>WhatsApp Web for chamvi agents.</b><br>
    A chamvi-owned Chat SDK adapter on Baileys,<br>
    plugged into an <code>@chamvi/chat</code> channel.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/chat-whatsapp"><img src="https://img.shields.io/npm/v/@chamvi/chat-whatsapp" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/chat-whatsapp/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/chat-whatsapp" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Limits](#limits)
- [Operations](#operations)
- [With @chamvi/app](#with-chamviapp)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/chat-whatsapp @chamvi/chat @chamvi/core @chamvi/http chat baileys@7.0.0-rc14 --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/chat`, `@chamvi/core`, [`chat`](https://www.npmjs.com/package/chat) (the Chat SDK, 4.43 or later in the 4.x line) and `baileys` are peer dependencies; `baileys` is pinned to the one version chamvi's adapter was verified against (`7.0.0-rc14`). `smob` is the only runtime dependency. The package uses only `@chamvi/chat`'s public API: its channel is a `chatChannel()` with the WhatsApp hooks passed as `platform` ([`IChatPlatform`](https://www.npmjs.com/package/@chamvi/chat#platform-packages)).

## Usage

`createWhatsAppChat()` builds a Chat SDK `Chat`, the WhatsApp adapter and its `chatChannel()`. Register the channel on the engine, subscribe an agent with `channel.on()` and reply from a tool with `ctx.channels.findOneOrFail('chat').emit()`:

```typescript
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    Engine,
    createMemoryStore,
    defineAgent,
    defineTool,
} from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import { createWhatsAppChat } from '@chamvi/chat-whatsapp';
import type { WhatsAppChatOptions } from '@chamvi/chat-whatsapp';

export function createWhatsAppEngine(
    model: LanguageModel,
    // auth: your secure session store; state: a Chat SDK state adapter
    options: Pick<WhatsAppChatOptions, 'auth' | 'state' | 'onPairing' | 'socketFactory' | 'clock'>,
): IEngine {
    const { WHATSAPP_SENDERS, APP_URL } = process.env;

    if (!WHATSAPP_SENDERS || !APP_URL) {
        throw new Error('Set WHATSAPP_SENDERS (phone number jids, comma separated) and APP_URL.');
    }

    const whatsapp = createWhatsAppChat({
        // a non-secret alias of the account, not its phone number
        account: 'assistant',
        // only these senders start runs; everybody else is ignored
        policy: { senders: WHATSAPP_SENDERS.split(',') },
        resolveInvoker: (identity) => ({
            id: identity.sender,
            kind: 'whatsapp',
            permissions: [],
        }),
        // a link to the approval in the chamvi UI: ids only, answered there
        approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
        ...options,
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
        instructions: 'You are the owner\'s assistant on WhatsApp. Answer with the reply tool.',
        // one memory per direct chat and one per group
        conversation: true,
        // direct messages and mentions in an allowed group
        channels: [whatsapp.channel.on()],
        tools: { reply },
    });

    return new Engine({
        // memory store: conversations included; use @chamvi/store-db in production
        store: createMemoryStore({ clock: options.clock }),
        agents: [assistant],
        channels: [whatsapp.channel],
        clock: options.clock,
        conversations: { authorize: ({ agent }) => agent === 'assistant' },
    });
}
```

Nothing connects when the setup is built: the channel's `start` (the engine's) initializes the Chat, acquires the auth lease, then builds the socket. While the account is not paired, `onPairing` receives a QR reference to render for the phone (it rotates); it never reaches a log or `onError`. `setup.status()` reports `stopped`, `connecting`, `connected`, `disconnected` or `logged-out`, from Baileys' connection events only.

`auth` is an `IWhatsAppAuthProvider` you supply: chamvi ships no production session store (see [Operations](#operations)). `state` is a Chat SDK `StateAdapter`; chamvi's intake does not depend on its deduplication.

Who may start runs is `policy`:

| Policy | Allows |
|---|---|
| `{ senders: [...] }` | Direct messages of the listed phone number jids (`<digits>@s.whatsapp.net`, no device suffix) |
| `groups: [...]` | Messages in the listed group jids (`<id>@g.us`) from an allowed sender, by default only when they mention the bot (`requireGroupMention: false` drops that) |
| `{ open: true }` | Any resolved sender; `resolveInvoker` decides (undefined denies) |

A message starts runs only when its identity is authenticated, the policy allows it and `resolveInvoker` names an invoker. The bot's own messages, unknown senders and a sender whose LID cannot be resolved to a phone number through Baileys' authenticated mapping are denied silently: no run, no reply, no download.

Subscriptions, replies, approvals, memory and trust follow [`@chamvi/chat`](https://www.npmjs.com/package/@chamvi/chat): the conversation of a message is `{ account, chat jid, direct:<sender> | group:<group jid> }`, so a group shares one memory among its members.

## Limits

- Text only, no media download, no history, no message splitting (`CHAT_TEXT_MAX_CHARS`), as for every chat channel.
- Delivery is at least once: each send carries a WhatsApp message id derived from the message key, so a retry reuses it; whether WhatsApp drops such a duplicate is not verified.
- No lossless or offline ingestion. A message that arrives while the connector is down, or that the process loses before it is stored, is not fetched later.

## Operations

WhatsApp Web through Baileys is an **unofficial protocol**: WhatsApp may change it or restrict the account. Use an account you can afford to lose and read the [WhatsApp guide](https://chamvi.dev/deployment/whatsapp) before a live cutover. In short:

- **Auth provider required.** The lease (`acquire(signal)` -> `{ auth, saveCreds, flush, release }`) must persist creds and signal keys atomically and serialized, and take the location exclusively (a second holder refused). chamvi guards every auth call with the lease's generation, flushes before releasing and keeps a lease fenced (not released) when the pending writes and the flush outlive `WHATSAPP_SHUTDOWN_TIMEOUT_MS` (30 s) or the flush fails. Ending the socket has its own bound of the same length, so a dead link never leaves the lease held.
- **One connector.** Run one deployment per account, `Recreate`/stop-then-start, never two replicas.
- **Pairing** is by QR (`onPairing`) only; no phone-number code.
- **Reconnect**: an unexpected close reconnects with backoff (`WHATSAPP_RECONNECT`: 2 s growing to 30 s, 12 attempts). A logout (401) or a replacing session (440) does not: pair again, then restart; the lease stays held until the channel stops.
- **Stop** ends the socket, refuses later auth writes and flushes. Baileys may retry a decrypt whose key commit the stop refused (for about 30 s, to nothing); chamvi does not guarantee that such a message is processed after the restart.
- **Logging**: Baileys' own logger is silent (it would carry pairing material), which also hides its decrypt and LID warnings.

## With @chamvi/app

```ts
import { createApp } from '@chamvi/app';
import { chatModule } from '@chamvi/chat/module';
import { createWhatsAppChat } from '@chamvi/chat-whatsapp';

const whatsapp = createWhatsAppChat({ ... });

export default createApp({
    agents: [assistant],
    modules: [chatModule({ channel: whatsapp.channel })],
    conversations: { authorize: ({ agent }) => agent === 'assistant' },
});
```

`chatModule()` contributes the channel to `AppToken.CHANNELS`; the engine starts and stops it. It adds no env variable and constructs nothing, so `chamvi start --check` neither acquires the auth lease nor connects.

## API

| Export | Holds |
|---|---|
| `createWhatsAppChat(options)` | `{ chat, ingress, channel, status() }` |
| Types `WhatsAppChatOptions`, `WhatsAppChatSetup`, `WhatsAppPolicy`, `WhatsAppIdentity`, `IWhatsAppAuthProvider`, `WhatsAppAuthLease`, `WhatsAppPairing`, `WhatsAppConnectionStatus`, `WhatsAppSocket`, `WhatsAppSocketFactory` | |
| `WHATSAPP_ADAPTER_NAME` `'whatsapp'`, `WHATSAPP_RECONNECT`, `WHATSAPP_SHUTDOWN_TIMEOUT_MS` 30 000 | |
| Error codes `whatsapp_auth`, `whatsapp_connection`, `whatsapp_logged_out` (`WHATSAPP_*_ERROR_CODE`) | |

The full option reference is the [WhatsApp guide](https://chamvi.dev/deployment/whatsapp).

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
