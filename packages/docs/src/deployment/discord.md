# Discord

[`@chamvi/chat-discord`](#creatediscordchat) connects an agent to a Discord bot: direct messages, guild channels and threads. chamvi holds one [discord.js](https://www.npmjs.com/package/discord.js) Gateway connection for incoming messages, parses them with the Chat SDK's [`@chat-adapter/discord`](https://www.npmjs.com/package/@chat-adapter/discord) `4.44.0`, and replies through Discord REST itself.

```bash
npm install @chamvi/chat-discord @chamvi/chat @chamvi/core @chamvi/http chat @chat-adapter/discord@4.44.0 discord.js --save
```

`@chamvi/chat`, `@chamvi/core`, `chat`, `@chat-adapter/discord` and `discord.js` (`^14.25.1`) are peer dependencies; `@chat-adapter/discord` is pinned to exactly `4.44.0`, the version chamvi was verified against. The package uses only `@chamvi/chat`'s public API: its channel is a [`chatChannel()`](/reference/chat#chatchannel) with the Discord hooks passed as [`platform`](/reference/chat#platform-packages), so subscriptions, replies, approvals, memory and trust work as described there.

## Developer Portal

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. **Create an application and its bot.** Copy the **application id** (General Information) and the **bot token** (Bot, Reset Token). The token goes into your secret store; chamvi never writes it anywhere.
2. **Enable the Message Content intent** (Bot, Privileged Gateway Intents). Without it Discord refuses the login (close 4014) and the channel reports `discord_connection` with that hint. chamvi asks for exactly the intents `Guilds`, `GuildMessages`, `MessageContent` and `DirectMessages`.
3. **Invite the bot** (OAuth2, URL Generator, scope `bot`) with the permissions **View Channel**, **Send Messages**, **Send Messages in Threads** and **Read Message History**. Nothing else is used: no reactions, no thread creation, no slash commands.
4. **Leave the Interactions Endpoint URL empty.** Setting it diverts interactions away from the Gateway, and chamvi serves no interactions endpoint in this version (every webhook request to the adapter is refused).

## Readiness checklist

Before a live cutover:

1. **One connector per bot token.** One deployment, `Recreate` (stop, then start), one replica. Two processes on one token both receive every message. The `agent-app` chart's Recreate strategy fits.
2. **The policy, by ids.** List guild, channel, user and role ids (enable Developer Mode in Discord to copy them). Names, nicknames and role names are never consulted, so a renamed or look-alike account gains nothing.
3. **An approval URL** into the chamvi UI, and an owner principal that can answer there. Approvals are answered in the UI only.
4. **Memory**, if the agent uses `conversation: true`: a store with conversations (PostgreSQL through `@chamvi/store-db` for restart-durable memory) and a `conversations.authorize` policy. A channel's top-level messages share one memory among the people allowed there.
5. **Trust.** Runs are tainted by default: tools marked `guardWhenTainted` need approval. Replies to the source channel or thread are not gated; do not set a `defaultAddress` unless that channel may receive whatever a tainted run produces.

## Connection and recovery

| Event | What happens |
|---|---|
| Login refused: invalid or empty token, or the token provider throws | Status `failed`, `discord_auth` (without the token or the provider's message), no retry |
| Disallowed intents (close 4014) | Status `failed`, `discord_connection` naming the Message Content intent, no retry |
| Session invalidated, or another close discord.js does not recover from | Status `failed`, `discord_connection`, no retry until the channel restarts |
| Any other login failure (network) | The client is destroyed and a new one logs in after `min(30 s, 2 s * 1.8^n)` ±25 % on the clock, at most 12 times in a row (reset by a ready), then `discord_connection` |
| Disconnect or reconnect of an established session | discord.js resumes or reconnects by itself; status `connecting` while it does, `connected` again on resume (`disconnected` only between a failed login and its retry) |
| Stop | Detaches the listeners and destroys the client within `DISCORD_SHUTDOWN_TIMEOUT_MS` (30 s); a login still pending is dropped, and nothing connects after the stop |

`setup.status()` reports `stopped`, `connecting`, `connected` (a ready or resume), `disconnected` or `failed`; poll it for a readiness signal. Sends do not depend on it: they go through REST while the channel is started.

## createDiscordChat

```ts
function createDiscordChat(options: DiscordChatOptions): DiscordChatSetup; // @chamvi/chat-discord
// DiscordChatSetup = { chat, ingress, channel, status(): DiscordConnectionStatus, conversation(input): ConversationRef }

const DISCORD_ADAPTER_NAME: 'discord';
const DISCORD_API_URL: 'https://discord.com/api/v10';
const DISCORD_TEXT_MAX_CHARS: 2000;
const DISCORD_RECONNECT: { initialMs: 2000; factor: 1.8; maxMs: 30_000; jitter: 0.25; maxAttempts: 12 };
const DISCORD_SHUTDOWN_TIMEOUT_MS: 30_000;
// error codes: 'discord_auth', 'discord_connection' (DISCORD_*_ERROR_CODE)
```

<<< @/snippets/chat.ts#discord

| Option | |
|---|---|
| `account` | Required. A non-secret alias of the bot (the conversation account) |
| `token` | Required. The bot token, or an async function that returns it, read per login and per send; never in a store, run, log, `onError` or error message |
| `applicationId` | Required. The bot's application id |
| `policy` | Required. `{ guilds, channels?, users?, roles?, dms?, requireMention? }` (below) |
| `resolveInvoker(identity)` | Required. The invoker of an allowed message's runs; `undefined` denies the message |
| `state` | Required. The Chat SDK `StateAdapter` of the `Chat` |
| `approvalUrl(ref)` | Required. The approval link, `ref = { runId, approvalId, agent }` (ids only) |
| `name`, `untrusted`, `timeoutMs` | As for [`chatChannel()`](/reference/chat#chatchannel) |
| `clock` | The connector's clock (login backoff, shutdown bound); default the engine's |
| `onError` | Failures nobody awaits; default `console.error` |
| `logger`, `userName` | The Chat SDK logger (default level `warn`) and bot user name (default `chamvi`) |
| `apiUrl` | The Discord REST base; default `DISCORD_API_URL` |
| `clientFactory` | Default `new Client(options)` of discord.js; tests pass a fake |
| `fetch` | The fetch of the REST send; default the global `fetch` |

Throws `InvalidAgentDefinitionError` (`createDiscordChat: ...`) for a missing or malformed option, without echoing the value. The factory reads no token and makes no client; neither does `chamvi start --check`. chamvi passes every adapter option explicitly, so none of the adapter's `DISCORD_*` environment variables is read.

### Policy

Every entry is a Discord id (a snowflake). Errors name the option and index, never the value.

| Message | Starts runs when |
|---|---|
| Guild channel | The guild is in `guilds`, the channel is in `channels` (when given), the author is in `users` or has a role in `roles`, the bot is addressed (unless `requireMention: false`), and `resolveInvoker` names an invoker |
| Thread | As a guild channel, with `channels` matched against the thread's parent channel; a thread whose parent discord.js does not know is looked up once (for an author the policy would otherwise allow) and refused when the lookup fails |
| Direct message | The author is in `dms.users`, and `resolveInvoker` names an invoker; no mention needed |
| Group DM | Never |

The bot is addressed by a direct mention of its user (`@everyone`, `@here` and role mentions do not count) or by a Discord reply to one of its messages, when the Gateway payload names the replied-to author (chamvi never fetches it). With neither `users` nor `roles`, no guild author passes: there is no open mode. The bot's own messages, other bots, webhooks and system messages are ignored. A policy refusal is silent and happens before any other work: no run, no reply, no thread, no typing, no Discord call. A message the policy allows but that has attachments or no text is refused by the chat intake and reported to `onError` (no run).

The identity (`DiscordIdentity { account, chat, guild?, channel, thread?, privateThread?, author, roles, dm, mentioned }`) is what `resolveInvoker` sees: ids only.

### Conversations

The conversation of a message is `{ account, chat, audience }`: `chat` is the adapter thread id (`discord:<guild | @me>:<channel>[:<thread>]`), so each thread has its own memory and a channel's top-level messages share one. The audience is the narrowest one known:

| Message | Audience |
|---|---|
| Direct message | `direct:<user id>` |
| Guild channel, public or announcement thread | `channel:<parent channel id>` |
| Private thread, or a thread of unknown type | `thread:<thread id>` |

### Cron runs in a conversation

`setup.conversation({ threadId, user? })` returns the `ConversationRef` of a chat for [`cron.on(expression, { conversation, text })`](/guide/scheduler#inside-a-conversation): the identity intake computes for a message there, and the chat's address. `threadId` is a DM (`discord:@me:<DM channel id>`, with `user` the id of the user the DM is with) or a guild channel's top-level messages (`discord:<guild id>:<channel id>`, no `user`). Threads are refused: their audience depends on a thread type only a message reveals. A malformed id, a DM without its user or a user outside a DM throws `InvalidAgentDefinitionError`.

<<< @/snippets/chat.ts#discord-cron

The DM channel id is the one in the DM's URL (`https://discord.com/channels/@me/<DM channel id>`). A later DM from that user lands in the same conversation and recalls the briefing.

### Delivery

A send is one `POST /channels/<channel or thread>/messages` with the body `{ content, allowed_mentions: { parse: [] }, nonce, enforce_nonce: true }`: replies never ping anyone. The nonce is the first 25 hex characters of the SHA-256 of the channel name, the target channel or thread id and the message key (so one key sent to two channels posts in both), so a retry within Discord's nonce window returns the first message instead of posting a copy; beyond the window a retry may post again (at least once). The send's deadline aborts the request. A non-2xx answer, a 429 included, is `chat_request` naming the status and Discord's error code, without the token; chamvi has no retry loop of its own (the engine's effect retry applies). Text is at most 2000 characters, never split; an approval's prose is cut to fit, followed by the link into the UI.

### With @chamvi/app

<<< @/snippets/chat.ts#discord-module

`chatModule()` contributes the channel to `AppToken.CHANNELS`; the engine starts and stops it. It adds no env variable and constructs nothing, so `chamvi start --check` reads no token and opens no Gateway connection.

`discordModule()` (`@chamvi/chat-discord/module`) configures the bot from env or the dashboard instead of code:

<<< @/snippets/chat.ts#discord-app-module

| Variable | Field | |
|---|---|---|
| `CHAMVI_DISCORD_TOKEN` (`_FILE`) | Bot token | Required, a secret |
| `CHAMVI_DISCORD_APPLICATION_ID` | Application id | Required |
| `CHAMVI_DISCORD_GUILDS`, `_CHANNELS`, `_USERS`, `_ROLES`, `_DM_USERS` | The policy | Comma-separated Discord ids; empty `_DM_USERS` turns direct messages off |
| `CHAMVI_DISCORD_REQUIRE_MENTION` | Require mention | `true`, `false`, `1`, `0`; default `true` |

A module with `name` (the connection, channel, account and env prefix; default `discord`) reads `CHAMVI_DISCORD_<NAME>_*` (upper-cased, `-` as `_`). The names `dm` and `*-dm` are refused, since `<NAME>_USERS` would be another instance's `DM_USERS`. Code options win over env and the store, and a given `policy` fixes all its fields. A partial env fails the start naming the missing variable; nothing set starts an idle channel, which [`chatDiscordUiModule()`](/guide/ui#connection-pages) can configure. Saved values apply after a restart.

## What is not guaranteed

- **No lossless or offline ingestion.** A message that arrives while the connector is down, or that the process loses before it is stored as runs, is not fetched later. Channel history is not read.
- **At least once delivery.** A send that times out (30 s) may still be delivered; a retry within Discord's nonce window is deduplicated, a later one may post twice.
- **Text only.** Messages with attachments or without text are refused (reported, no run); replies are text up to 2000 characters, never split.
- **Not in this version:** slash commands, buttons and select menus (approvals are a UI link), the Interactions Endpoint URL, reactions, message edits and deletes, embeds, streaming, more than one connector per token.
