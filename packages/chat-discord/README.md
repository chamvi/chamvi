<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/chat-discord" width="128" height="128" />
</p>

<h1 align="center">@chamvi/chat-discord</h1>

<p align="center">
    <b>Discord for chamvi agents.</b><br>
    A Gateway connection and the Chat SDK Discord adapter,<br>
    plugged into an <code>@chamvi/chat</code> channel.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/chat-discord"><img src="https://img.shields.io/npm/v/@chamvi/chat-discord" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/chat-discord/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/chat-discord" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Limits](#limits)
- [Operations](#operations)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/chat-discord @chamvi/chat @chamvi/core @chamvi/http chat @chat-adapter/discord@4.44.0 discord.js --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/chat`, `@chamvi/core`, [`chat`](https://www.npmjs.com/package/chat) (the Chat SDK, 4.44 or later in the 4.x line), `@chat-adapter/discord` and `discord.js` (14.25.1 or later in the 14.x line) are peer dependencies; `@chat-adapter/discord` is pinned to the one version chamvi was verified against (`4.44.0`). `smob` is the only runtime dependency. The package uses only `@chamvi/chat`'s public API: its channel is a `chatChannel()` with the Discord hooks passed as `platform` ([`IChatPlatform`](https://www.npmjs.com/package/@chamvi/chat#platform-packages)).

## Usage

`createDiscordChat()` builds a Chat SDK `Chat`, the Discord adapter and its `chatChannel()`. Contribute the channel with `chatModule()`, subscribe an agent with `channel.on()` and reply from a tool with `ctx.channels.findOneOrFail('chat').emit()`:

```typescript
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
```

The app entry's default export is `createDiscordApp(model, { state })`. Nothing connects when the setup is built, and `chamvi start --check` reads no token and makes no client: the channel's `start` (the engine's) initializes the Chat, then logs one discord.js client in to the Gateway (intents `Guilds`, `GuildMessages`, `MessageContent`, `DirectMessages`). `setup.status()` reports `stopped`, `connecting`, `connected`, `disconnected` or `failed`, from the client's events only.

`token` is the bot token or an async provider of it, read per login and per send; it never reaches a store, a run, a log, `onError` or an error message. `state` is a Chat SDK `StateAdapter`; chamvi's intake does not depend on its deduplication.

Who may start runs is `policy`, by Discord ids (snowflakes) only, never by names:

| Policy | Allows |
|---|---|
| `guilds: [...]` | Required. Guild messages only from these guilds (empty: no guild intake) |
| `channels: [...]` | Narrows the guilds to these channels; a thread matches by its parent channel (a parent discord.js does not know is looked up once) |
| `users: [...]`, `roles: [...]` | Authors by user id, or by one of their member role ids; with neither, no guild author passes |
| `dms: { users: [...] }` | Direct messages of these users (default `false`: no DMs); group DMs are refused |
| `requireMention` | Default `true`: a guild message must mention the bot user directly or reply to a bot message (`@everyone`, `@here` and role mentions do not count) |

A message starts runs only when the policy allows it and `resolveInvoker` names an invoker. The bot's own messages, other bots, webhooks and everything the policy refuses are dropped silently, before any other work: no run, no reply, no thread, no Discord call.

Subscriptions, replies, approvals, memory and trust follow [`@chamvi/chat`](https://www.npmjs.com/package/@chamvi/chat): the conversation of a message is `{ account, thread id, audience }` with the audience `direct:<user>` for a DM, `channel:<parent channel>` for a guild channel and its public threads, `thread:<thread>` for a private thread or one whose type is unknown. A thread is one memory, a channel's top-level messages another (no threads are created).

### `discordModule()`

`discordModule()` from `@chamvi/chat-discord/module` builds the same channel from env and the connection store instead of code (`@chamvi/app` is an optional peer there). It takes `state`, `resolveInvoker` and the other `createDiscordChat()` options except `account`, which is its `name`; `token`, `applicationId`, `policy` and `approvalUrl` are optional and win over env and the store (a given `policy` fixes all its fields). `token` is a string here, not the function `createDiscordChat()` also takes:

```typescript
import { discordModule } from '@chamvi/chat-discord/module';

const discord = discordModule({
    state,
    resolveInvoker: (identity) => ({ id: identity.author, kind: 'discord', permissions: [] }),
});

// subscribe with discord.on(); reply with ctx.channels.findOneOrFail('discord')
createApp({ agents, modules: [discord] });
```

| Variable | Field |
|---|---|
| `CHAMVI_DISCORD_TOKEN` (`_FILE`) | Bot token, required |
| `CHAMVI_DISCORD_APPLICATION_ID` | Application id, required |
| `CHAMVI_DISCORD_GUILDS`, `_CHANNELS`, `_USERS`, `_ROLES`, `_DM_USERS` | The policy, comma-separated ids |
| `CHAMVI_DISCORD_REQUIRE_MENTION` | Default `true` |

`name` (default `discord`) names the connection, the channel, the account and the env prefix: a named module reads `CHAMVI_DISCORD_<NAME>_*` (upper-cased, `-` as `_`). A malformed variable throws at the factory; `setup` resolves env, then the store, and lists the connection (type `discord`, named after the module) for [`@chamvi/chat-discord-ui`](https://www.npmjs.com/package/@chamvi/chat-discord-ui) to edit. A required field that env and the store both lack fails the start naming its variable when another field is set from env. With nothing set, or with a stored value the channel refuses (listed `incomplete`), the channel stays idle: it never logs in and its `out` throws `ConnectionNotConfiguredError`. A refused env or code value fails the start. The approval link is `approvalUrl`, else the dashboard's from `CHAMVI_PUBLIC_URL`; with neither, a connection made in the dashboard stays idle and any other fails the start. Saved values apply after a restart. See the [Discord guide](https://chamvi.dev/deployment/discord).

## Limits

- Text only: messages with attachments or no text are refused (reported, no run); replies are text up to 2000 characters (`DISCORD_TEXT_MAX_CHARS`), never split. No buttons, embeds, reactions, edits or slash commands; approvals are a link into the UI.
- Replies never ping: every send carries `allowed_mentions: { parse: [] }`.
- Delivery is at least once: each send carries a nonce derived from the channel name, the target channel or thread and the message key with `enforce_nonce`, so a retry within Discord's nonce window returns the first message instead of posting a copy; beyond it a retry may post again. A rate-limited (429) or failed send is `chat_request`, without the token; chamvi has no retry loop of its own.
- No lossless or offline ingestion. A message that arrives while the connector is down is not fetched later.

## Operations

Read the [Discord guide](https://chamvi.dev/deployment/discord) before going live. In short:

- **Developer Portal.** Enable the **Message Content** privileged intent; without it the login fails with `discord_connection`. Invite the bot with View Channel, Send Messages, Send Messages in Threads and Read Message History. Leave the **Interactions Endpoint URL** empty: setting it diverts interactions away from the Gateway, and chamvi serves no endpoint.
- **One connector per bot token.** Run one deployment, `Recreate`/stop-then-start, never two replicas.
- **Login**: an invalid or empty token (or a failing provider) is `discord_auth`, disallowed intents and an invalidated session `discord_connection`; neither retries. Other login failures retry with backoff (`DISCORD_RECONNECT`: 2 s growing to 30 s, 12 attempts); discord.js resumes and reconnects an established session by itself.
- **Stop** destroys the client within `DISCORD_SHUTDOWN_TIMEOUT_MS` (30 s) and never reconnects after.
- **Sends** go through Discord REST, independent of the Gateway status.

## API

| Export | Holds |
|---|---|
| `createDiscordChat(options)` | `{ chat, ingress, channel, status() }` |
| Types `DiscordChatOptions`, `DiscordChatSetup`, `DiscordPolicy`, `DiscordIdentity`, `DiscordConnectionStatus`, `DiscordClient`, `DiscordClientFactory`, `DiscordInboundMessage`, `DiscordInboundAttachment` | |
| `DISCORD_ADAPTER_NAME` `'discord'`, `DISCORD_API_URL`, `DISCORD_TEXT_MAX_CHARS` 2000, `DISCORD_RECONNECT`, `DISCORD_SHUTDOWN_TIMEOUT_MS` 30 000 | |
| Error codes `discord_auth`, `discord_connection` (`DISCORD_*_ERROR_CODE`) | |

The full option reference is the [Discord guide](https://chamvi.dev/deployment/discord).

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
