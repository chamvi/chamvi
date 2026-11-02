# WhatsApp

[`@chamvi/chat-whatsapp`](#createwhatsappchat) connects an agent to a WhatsApp account through WhatsApp Web, using [Baileys](https://www.npmjs.com/package/baileys) `7.0.0-rc14`. The account appears as a linked device; messages from allowed senders start runs, and tools reply in the same chat.

```bash
npm install @chamvi/chat-whatsapp @chamvi/chat @chamvi/core @chamvi/http chat baileys@7.0.0-rc14 --save
```

`@chamvi/chat`, `@chamvi/core`, `chat` and `baileys` are peer dependencies; `baileys` is pinned to exactly `7.0.0-rc14`, the version the adapter's identity rules were verified against. The package uses only `@chamvi/chat`'s public API: its channel is a [`chatChannel()`](/reference/chat#chatchannel) with the WhatsApp hooks passed as [`platform`](/reference/chat#platform-packages), so subscriptions, replies, approvals, memory and trust work as described there.

::: danger Unofficial protocol
WhatsApp Web through Baileys is not an official WhatsApp API. WhatsApp can change the protocol, and it can restrict or ban an account that automates it. Use an account you can afford to lose, keep the volume personal, and keep a way back (your previous setup) until the connector has run for a while.
:::

## Readiness checklist

Before a live cutover:

1. **A maintained auth provider.** chamvi ships no production session store. Your `IWhatsAppAuthProvider` must persist the creds and every signal key write atomically (a crash never leaves a half-written file), serialize writes, keep the session secret (it is the account), and take the location exclusively: `acquire` refuses while another holder has it. Test it against restarts before going live; Baileys' `useMultiFileAuthState` alone is not that.
2. **One connector.** One deployment per account, `Recreate` (stop, then start), one replica. Two processes on one session replace each other (440) and can corrupt the signal state. The `agent-app` chart's Recreate strategy fits.
3. **The sender policy.** List phone number jids and group jids explicitly; `{ open: true }` lets anyone write, with `resolveInvoker` as the only gate.
4. **An approval URL** into the chamvi UI, and an owner principal that can answer there. Approvals are answered in the UI only.
5. **Memory**, if the agent uses `conversation: true`: a store with conversations (PostgreSQL through `@chamvi/store-db` for restart-durable memory) and a `conversations.authorize` policy. A group is one memory (`group:<group jid>`), shared by its members.
6. **Trust.** Runs are tainted by default: tools marked `guardWhenTainted` need approval. Replies to the source chat are not gated; do not set a `defaultAddress` unless that chat may receive whatever a tainted run produces.

## Pairing

The first start of an unpaired session emits a QR reference to `onPairing` (it rotates periodically until scanned: Baileys shows the first for 60 s, each later one for 20 s). Render it for the phone (WhatsApp, Linked devices, Link a device); never log it. There is no phone-number pairing code yet. Once paired, the provider persists the creds and later starts connect without a QR.

## Connection and recovery

| Event | What happens |
|---|---|
| Unexpected close (network, server restart) | Reconnects with backoff on the clock: 2 s growing by 1.8 to 30 s, ±25 %, 12 attempts in a row, then `whatsapp_connection` and it stays disconnected until the channel restarts |
| Logout (401: the device was removed on the phone) | Status `logged-out`, `whatsapp_logged_out`, no reconnect. Pair again (a fresh session from the provider), then restart. The lease stays held until the channel stops |
| Replaced (440: another client took the session) | `whatsapp_connection`, no reconnect: stop the other connector first |
| Stop | Ends the socket (at most 30 s), refuses later auth writes, then waits for pending ones and flushes the lease, then releases it, within another 30 s; past those, or when the flush fails, the lease stays held and `whatsapp_auth` is reported. A dead link that holds the socket's end for its 30 s does not keep the lease |

A stop takes at most the socket's end (30 s) and the auth settling (30 s), plus the channel's wait for messages still being accepted (`CHAT_STOP_TIMEOUT_MS`, 30 s) and the Chat's shutdown. Only when every phase runs to its bound does that reach the CLI's 90 s force exit (`CHAMVI_FORCE_EXIT_MS`), which the chart's 120 s termination grace covers; raise `CHAMVI_FORCE_EXIT_MS` (below the grace) if a stop must never be cut short.

`setup.status()` reports the connection (`connected` only after Baileys' `open`); poll it for a readiness signal. Sends fail while it is not `connected`.

Baileys' own logger is silent, because its lines carry pairing material and session details; this also hides its decrypt and LID warnings. Errors reach `onError` without message text.

## createWhatsAppChat

```ts
function createWhatsAppChat(options: WhatsAppChatOptions): WhatsAppChatSetup; // @chamvi/chat-whatsapp
// WhatsAppChatSetup = { chat, ingress, channel, status(): WhatsAppConnectionStatus }

const WHATSAPP_ADAPTER_NAME: 'whatsapp';
const WHATSAPP_RECONNECT: { initialMs: 2000; factor: 1.8; maxMs: 30_000; jitter: 0.25; maxAttempts: 12 };
const WHATSAPP_SHUTDOWN_TIMEOUT_MS: 30_000;
// error codes: 'whatsapp_auth', 'whatsapp_connection', 'whatsapp_logged_out' (WHATSAPP_*_ERROR_CODE)
```

<<< @/snippets/chat.ts#whatsapp

| Option | |
|---|---|
| `account` | Required. A non-secret alias of the account (the conversation account), not its phone number |
| `auth` | Required. An `IWhatsAppAuthProvider` (below); chamvi ships no production provider |
| `policy` | Required. `{ senders, groups?, requireGroupMention? }` or `{ open: true, groups?, requireGroupMention? }` (below) |
| `resolveInvoker(identity)` | Required. The invoker of an allowed message's runs; `undefined` denies the message |
| `state` | Required. The Chat SDK `StateAdapter` of the `Chat` |
| `approvalUrl(ref)` | Required. The approval link, `ref = { runId, approvalId, agent }` (ids only) |
| `onPairing({ qr })` | Required. Gets the QR reference to render while the account is not paired; never a log or `onError` |
| `name`, `untrusted`, `timeoutMs` | As for [`chatChannel()`](/reference/chat#chatchannel) |
| `clock` | The connector's clock (backoff, shutdown bound); default the engine's |
| `onError` | Failures nobody awaits; default `console.error` |
| `logger`, `userName` | The Chat SDK logger (default level `warn`) and bot user name (default `chamvi`) |
| `socketOptions` | Further Baileys `SocketConfig` fields (`version`, `browser`, ...); `auth` and `logger` are chamvi's |
| `socketFactory` | Default Baileys' `makeWASocket`; tests pass a fake |

Throws `InvalidAgentDefinitionError` for a missing or malformed option. The factory acquires nothing and builds no socket; neither does `chamvi start --check`.

### Sender policy

Policy entries are normalized jids, never names: senders are phone number jids (`<digits>@s.whatsapp.net`, no device suffix), groups group jids (`<id>@g.us`). Errors name the option and index, never the value.

| Message | Starts runs when |
|---|---|
| Direct | The sender is listed (or `open`), and `resolveInvoker` names an invoker |
| Group | The group is listed, the participant is listed (or `open`), the bot is mentioned (unless `requireGroupMention: false`), and `resolveInvoker` names an invoker |

The identity (`WhatsAppIdentity { account, chat, sender, group, mentioned }`) is authenticated: the sender of a group message is its participant, never the group jid; a device suffix is removed; a LID sender resolves to a phone number only through the stanza's server-provided alternative (`participantAlt`/`remoteJidAlt`) or Baileys' LID mapping store, else the message is denied (an unresolved identity never inherits another's permissions). The bot's own messages are ignored. Denied messages are dropped silently: no run, no reply, no download.

### Auth provider

```ts
interface IWhatsAppAuthProvider {
    acquire(signal: AbortSignal): Promise<WhatsAppAuthLease>;
}
type WhatsAppAuthLease = {
    auth: AuthenticationState;     // Baileys creds and signal key store (get, set, clear?)
    saveCreds(): Promise<void>;    // persists auth.creds, serialized with key writes
    flush(): Promise<void>;        // resolves once every accepted write is durable
    release(): Promise<void>;      // gives the location up
};
```

`acquire` loads the session and takes its location exclusively (a second holder is refused; the start then fails before any socket). chamvi calls `saveCreds` and the key store only while the lease is in use: once the connection closes, every later call is refused (`InvalidRunStateError`). On stop it ends the socket (bounded by `WHATSAPP_SHUTDOWN_TIMEOUT_MS`), then waits for pending writes, `flush`es and `release`s, within a second `WHATSAPP_SHUTDOWN_TIMEOUT_MS` (no write is admitted after the close, so a dead link's end never eats into it); past it, or when `flush` fails, the lease is not released (fenced) and `whatsapp_auth` is reported. A lease that arrives after the stop is released at once.

### Connection

`status()`: `stopped`, `connecting`, `connected` (an `open` event), `disconnected`, `logged-out`, from Baileys' `connection.update` only. Sends go out only while `connected`. An unexpected close reconnects after `min(30 s, 2 s * 1.8^n)` ±25 % on the clock, at most 12 times in a row (reset by an open), then reports `whatsapp_connection` and stays disconnected. A logout (401) reports `whatsapp_logged_out` and a replacing session (440) `whatsapp_connection`; neither reconnects.

### Delivery

A send posts the raw text to the chat's jid with a message id derived from the send's key (`3EB0` + 36 hex of its SHA-256), so a retry reuses the id. Whether WhatsApp drops such a duplicate is not verified: delivery is at least once.

### With @chamvi/app

<<< @/snippets/chat.ts#whatsapp-module

`chatModule()` contributes the channel to `AppToken.CHANNELS`; the engine starts and stops it. It adds no env variable and constructs nothing, so `chamvi start --check` neither acquires the auth lease nor connects.

## What is not guaranteed

- **No lossless or offline ingestion.** A message that arrives while the connector is down, or that the process loses before it is stored as runs, is not fetched later. Platform history is not read.
- **Stop during a decrypt.** A message whose signal key commit arrives after the stop refused auth writes is not processed; Baileys may retry the commit for about 30 s, refused each time.
- **At least once delivery.** A send that times out (30 s) may still be delivered; the retry reuses the message id, but whether WhatsApp drops the duplicate is unverified.
- **Text only.** Messages with media are refused (reported, no run); replies are text up to 4096 characters, never split.
