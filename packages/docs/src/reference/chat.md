# @chamvi/chat

Chat channels on the [Chat SDK](https://www.npmjs.com/package/chat). The public API of `packages/chat/src/index.ts` and `src/module/index.ts`.

```bash
npm install @chamvi/chat @chamvi/core @chamvi/http chat --save
```

`@chamvi/core`, `@chamvi/http` and `chat` (`^4.44.0`) are peer dependencies; `@chamvi/app` is an optional peer, imported only by `@chamvi/chat/module`. The package imports no platform SDK: platforms ship as their own packages on the public [platform seam](#platform-packages), WhatsApp Web as [`@chamvi/chat-whatsapp`](/deployment/whatsapp), Discord as [`@chamvi/chat-discord`](/deployment/discord).

## chatChannel

```ts
function chatChannel(options: ChatChannelOptions): ChatChannel; // IChannel & { on(), to() }
function createChatIngressAdapter(adapter: Adapter): ChatIngress;

const CHAT_CHANNEL_NAME: 'chat';
const CHAT_TEXT_MAX_CHARS: 4096;          // UTF-16 code units
const CHAT_TIMEOUT_MS: 30_000;            // one send
const CHAT_BODY_LIMIT_BYTES: 1_048_576;   // one webhook body
const CHAT_WEBHOOK_TIMEOUT_MS: 30_000;    // waiting for the webhook's messages
const CHAT_STOP_TIMEOUT_MS: 30_000;       // waiting for messages being accepted at stop
const CHAT_REQUEST_ERROR_CODE: 'chat_request';
const CHAT_INTAKE_FAILED_ERROR_CODE: 'chat_intake_failed';
const CHAT_STOP_TIMEOUT_ERROR_CODE: 'chat_stop_timeout';
```

<<< @/snippets/chat.ts#generic

| Option | |
|---|---|
| `chat`, `adapters` | The `Chat` and its adapters, each wrapped by `createChatIngressAdapter()` and registered with that `Chat` under its name. The channel owns the `Chat` alone; another channel cannot take it |
| `allowMessage(incoming)` | Required for every adapter: whether a message may start runs at all |
| `resolveInvoker(incoming)` | The runs' invoker; none by default |
| `name` | Default `chat` (the agent name rule) |
| `webhooks` | Adapter names served at `POST /channels/<name>/<adapter>`; without any the channel has no `in` |
| `untrusted` | Default `true`: every run is tainted `channel:<name>` |
| `account` | The conversation account alias; default the adapter's name |
| `defaultAddress` | An address of `to()`; none by default (an ungated sink for tainted runs) |
| `connect({ signal, clock })`, `disconnect()` | Called on start (after the `Chat` initialized) and on stop; `connect` must settle once `signal` aborts |
| `approvalUrl(ref)` | Required to send an approval |
| `history` | Only `0`: no platform history is fetched |
| `timeoutMs` | One send's bound, default `CHAT_TIMEOUT_MS` |
| `onError` | Failures nobody awaits (refused and failed messages, stop) |
| `platform` | A platform package's hooks (`IChatPlatform`, [below](#platform-packages)); none by default |

The wrapper replaces the SDK's `processMessage` on the `ChatInstance` it hands the adapter, so messages reach chamvi's intake instead of the SDK's handlers and its pre-handler deduplication (which would drop a redelivery after a failure). Actions (`processAction`) are not supported.

### Platform packages

```ts
interface IChatPlatform {
    online?(): boolean;
    prepare?(input: ChatPlatformSend): ChatPlatformPost;
    conversationTarget?(incoming: ChatIncoming, payload: ChatPayload): ConversationTarget | undefined;
}
type ChatPlatformSend = { adapter: string; threadId: string; text: string; key: string };
type ChatPlatformPost = (signal: AbortSignal) => Promise<unknown>;
```

<<< @/snippets/chat.ts#platform

A platform package builds its `Chat`, its wrapped adapter and a `chatChannel()` with the public options, and passes what only its transport knows as `platform`. Every hook is optional and called on the platform object; a missing one keeps the default. The channel checks it at construction (`InvalidAgentDefinitionError` for one that is no object, a hook that is no function, or a plain object with a key that is no hook; a class instance may keep state in its own fields). The socket lifecycle stays with `connect`/`disconnect`, the message policy with `allowMessage`/`resolveInvoker`.

| Hook | Runs | Answers |
|---|---|---|
| `online()` | Per send, after `prepare`, only while the channel is started | False refuses the send (`chat_request`, nothing posted). Default true |
| `prepare(input)` | Per send, after the address decoded and the message rendered, before `online` | A throw refuses the target (its error reaches the caller as is, nothing goes out); else the post (`ChatPlatformPost`) the channel calls once and waits for, bounded by `timeoutMs` and the send's signal. The post gets a signal that aborts at whichever comes first, so it can cancel its request; a failure is a `chat_request`, a late outcome goes to `onError` (not a rejection with that abort reason). `key` is `ChannelMessage.key`, the same on every retry. Default the adapter's `postMessage(threadId, { raw: text })` |
| `conversationTarget(incoming, payload)` | Per agent with `conversation`, after `allowMessage`, the text checks and `resolveInvoker` (never for a refused message) | The conversation identity; `undefined` refuses that agent's dispatch (`chat_intake_failed`, the other agents still run), a throw fails the message. Default from the payload, as in [Memory and trust](#memory-and-trust) |

### Intake

Per message, in order: the bot's own messages are skipped; ids are checked (`ValidationError`, never echoing ids or text); `allowMessage` decides; a message with attachments or without text is refused (`ValidationError` to `onError`); `resolveInvoker`; then every agent with a matching subscription gets one run, through the engine's trusted conversation intake for an agent with `conversation`, else a plain dispatch. The idempotency key hashes channel, adapter, thread, sender and message id, so a redelivery dedupes per agent; a plain dispatch also gets a per-chat concurrency key. A transient failure (a store write) is retried after 1 s and 2 s; an agent already accepted is not dispatched again. What still fails is reported once as `chat_intake_failed`, naming channel, adapter and agents, never the text.

### Webhooks

`POST /channels/<name>/<adapter>` (only adapters in `webhooks`, else 404) reads the body up to `CHAT_BODY_LIMIT_BYTES` (413 above it, before the adapter runs) and hands the raw request to the adapter's `handleWebhook`, which verifies it (its 401 passes through). The answer waits for every message the adapter handed over in the request's async context until each is stored as runs, at most `CHAT_WEBHOOK_TIMEOUT_MS`; a message that could not be stored for a reason a redelivery may fix (a store failure, the channel not started or stopping), or the timeout, answers 503 so the platform redelivers. A message only refused (attachments, no text, invalid ids, no conversation identity, a denied conversation, a throwing filter) is reported once and gets the adapter's own answer: a redelivery would be refused again. An adapter that passes messages to a consumer running in another async context (started before the request) is not tracked: its own 2xx stands. GET challenge flows are not served. The mount is under the http app's general rate limit unless [`channelRateLimits`](/guide/http) names the channel.

### Subscriptions

```ts
chat.on(options?: ChatSubscriptionOptions): ChannelSubscription<ChatPayload>; // channel 'chat'
channel.on(options?), channel.to({ adapter, threadId }): string;
// ChatSubscriptionOptions = { adapter?, events?, id?, filter?, concurrencyMaxRuns? }
```

`events`: `direct`, `mention`, `message` (any other group message), default `DEFAULT_CHAT_EVENTS` `['direct', 'mention']`. `id` default `chat:<events>` (`chat:<adapter>:<events>` with an adapter). The payload, `ChatPayload { adapter, event, threadId, channelId, message: { id, text, author: { id, name? }, sentAt? } }`, holds no raw platform object. The run's address (`chat:` + base64url of `[adapter, threadId]`, at most 255 characters) is the chat.

### Outbound

`emit()` sends `title`, a blank line and `body`, refused above `CHAT_TEXT_MAX_CHARS` (no splitting). `approve()` sends the title and body (only this prose is cut, surrogate-safe), the options (`- <id>: <label>`, no detail), `Expires: <ISO>` and `Approve or deny: <approvalUrl>` (with options `Choose and approve or deny: <approvalUrl>`); the owner answers in the UI, there are no native buttons. `ChannelMessage.slot` is ignored: every message is a new chat message. A send is bounded by `timeoutMs`; a timeout fails with `chat_request` saying the message may still be delivered, a late completion is reported, and the engine's retry may send it again (at least once). A send while the channel is stopped or draining fails.

### Memory and trust

An agent with `conversation` is bound to `{ account, chat, audience }`: audience `direct:<author>` for a direct chat, `group:<channel>` for a group (one memory per group). It needs `IStore.conversations` and the engine's `conversations: { authorize }`; see [Conversation Memory](/guide/conversations). Runs are tainted by default, so `guardWhenTainted` tools ask for approval; replies to the source chat and the `defaultAddress` are exempt from the outbound gate (see [untrusted content](/guide/tools#untrusted-content-and-outbound-tools)).

<<< @/snippets/chat.ts#agent

## chatModule

```ts
function chatModule(options: { channel: ChatChannel }): IModule; // @chamvi/chat/module, name chamvi:channel:<name>
```

<<< @/snippets/chat.ts#module

Contributes the prebuilt channel to `AppToken.CHANNELS`; the engine starts and stops it, the http module mounts its `in`. No env variable, no start step; `start --check` neither initializes the `Chat` nor connects. A channel that is no `chatChannel()` is `InvalidAgentDefinitionError`.

## Not supported yet

Media (incoming attachments, outbound files), platform history, message splitting, native approval buttons and actions, and verified webhook platforms beyond the generic adapter contract. For WhatsApp's own gaps see [WhatsApp](/deployment/whatsapp#what-is-not-guaranteed), for Discord's [Discord](/deployment/discord#what-is-not-guaranteed).
