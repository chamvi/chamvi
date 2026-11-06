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

1. **A session store.** With `@chamvi/app`, [`whatsappModule()`](#with-chamvi-app) keeps the session sealed in the app store (PostgreSQL through `@chamvi/store-db` in production) under `CHAMVI_ENCRYPTION_KEYS`. Without the app, `createStoreWhatsAppAuth()` does the same over a [connection vault](#session-store), or you write an `IWhatsAppAuthProvider` that persists the creds and every signal key write atomically, serializes writes, keeps the session secret (it is the account) and takes it exclusively. Baileys' `useMultiFileAuthState` alone is not that.
2. **One connector.** One deployment per account, `Recreate` (stop, then start), one replica. Two processes on one session replace each other (440) and can corrupt the signal state. The `agent-app` chart's Recreate strategy fits.
3. **The sender policy.** List phone number jids and group jids explicitly; `{ open: true }` lets anyone write, with `resolveInvoker` as the only gate.
4. **An approval URL** into the chamvi UI, and an owner principal that can answer there. Approvals are answered in the UI only.
5. **Memory**, if the agent uses `conversation: true`: a store with conversations (PostgreSQL through `@chamvi/store-db` for restart-durable memory) and a `conversations.authorize` policy. A group is one memory (`group:<group jid>`), shared by its members.
6. **Trust.** Runs are tainted by default: tools marked `guardWhenTainted` need approval. Replies to the source chat are not gated; do not set a `defaultAddress` unless that chat may receive whatever a tainted run produces.

## Pairing

The first start of an unpaired session emits a QR reference (it rotates periodically until scanned: Baileys shows the first for 60 s, each later one for 20 s). With `whatsappModule()` it shows on the dashboard's [Connections page](/guide/ui#pages), live, to a principal holding `connection:<name>:write`: open `/ui/connections/<name>` and scan it with the phone (WhatsApp, Linked devices, Link a device). With `createWhatsAppChat()` it goes to `onPairing`; render it there. Either way it is never logged. There is no phone-number pairing code yet. Once paired, the session is stored and later starts connect without a QR.

## Session store

`whatsappModule()` stores the session as a **connection** of the app: one row per connection (its name, type `whatsapp` and data key) and one entry per Baileys value (`creds`, `key:<type>:<id>`), each sealed with AES-256-GCM under the connection's data key and bound to its connection and entry name. The data key is wrapped by the first key of `CHAMVI_ENCRYPTION_KEYS`; the store holds sealed bytes only.

```bash
# one key: <id>:<base64 of 32 random bytes>
CHAMVI_ENCRYPTION_KEYS="k1:$(openssl rand -base64 32)"
```

| Topic | What to know |
|---|---|
| The key | One `CHAMVI_ENCRYPTION_KEYS` per app, shared by every replica and pod of it; keep it in a secret (the chart's `secrets`). Ids follow the agent-name rule. A malformed value fails the start and `chamvi start --check`, naming the variable, never echoing the value. `chamvi run-job` pods do not need it (a job resolves no keyring). |
| Rotation | Put the new key first and keep the old one: `k2:<new>,k1:<old>`. New connections use `k2`; rows wrapped under `k1` stay readable. There is no re-encrypt command, so keep `k1` while any row uses it. |
| Losing the key | The session cannot be opened (`decryption_failed`, naming the missing key id, never key material): delete the connection's row from the store (`DELETE FROM chamvi_connections WHERE name = '<name>'`, its entries go with it) and pair again. |
| Exclusive | A process holds the session through the store lock `connection:<name>` (TTL `leaseTtlMs`, default 60 s, renewed every third of it); every write is fenced by that lease in the same transaction, so a process that lost it writes nothing. |
| kill -9 | The next start comes up, shows the connection `held_elsewhere` and retries on its own; once the old lease expires (at most `leaseTtlMs`, plus one backoff step of at most 30 s) it connects with the stored session. Every stored batch of signal keys is all or nothing. |
| Reset | A logged-out session, or one you want to drop: **Reset session** on the Connections page (`POST /connections/<name>/reset`, `connection:<name>:write`) clears the stored session under the lease and reconnects, so a new QR appears; no restart. On a replica that does not hold the lease it waits for the lease like a start and clears nothing before. |

## Connection and recovery

| Event | What happens |
|---|---|
| Unexpected close (network, server restart) | Reconnects with backoff on the clock: 2 s growing by 1.8 to 30 s, ±25 %, 12 attempts in a row, then `whatsapp_connection` and it stays disconnected until the channel restarts |
| Logout (401: the device was removed on the phone) | Status `logged-out`, `whatsapp_logged_out`, no reconnect. Reset the session (dashboard or `reset()`) and pair again; the lease stays held meanwhile |
| Session held at start (another process, or a crashed one within its lease TTL) | Status `held-elsewhere`; the start does not fail: it retries with the reconnect backoff, without a cap, until the lease is free or the channel stops (reported once per hold, `whatsapp_auth`) |
| Session store failing (the database, a wrong key) | Status `failed`, `whatsapp_auth` with the cause; retried with the backoff up to 12 times, then `whatsapp_connection` and it stays failed until a reset or restart |
| Replaced (440: another client took the session) | `whatsapp_connection`, no reconnect: stop the other connector first |
| Stop | Ends the socket (at most 30 s), refuses later auth writes, then waits for pending ones and flushes the lease, then releases it, within another 30 s; past those, or when the flush fails, the lease stays held and `whatsapp_auth` is reported. A dead link that holds the socket's end for its 30 s does not keep the lease |

A stop takes at most the socket's end (30 s) and the auth settling (30 s), plus the channel's wait for messages still being accepted (`CHAT_STOP_TIMEOUT_MS`, 30 s) and the Chat's shutdown. Only when every phase runs to its bound does that reach the CLI's 90 s force exit (`CHAMVI_FORCE_EXIT_MS`), which the chart's 120 s termination grace covers; raise `CHAMVI_FORCE_EXIT_MS` (below the grace) if a stop must never be cut short.

`setup.status()` reports the connection (`connected` only after Baileys' `open`), `onStatus(status)` gets every change; poll or listen for a readiness signal. Sends fail while it is not `connected`.

Baileys' own logger is silent, because its lines carry pairing material and session details; this also hides its decrypt and LID warnings. Errors reach `onError` without message text.

## createWhatsAppChat

```ts
function createWhatsAppChat(options: WhatsAppChatOptions): WhatsAppChatSetup; // @chamvi/chat-whatsapp
// WhatsAppChatSetup = { chat, ingress, channel, status(): WhatsAppConnectionStatus, reset(): Promise<void>, conversation(input): ConversationRef }

const WHATSAPP_ADAPTER_NAME: 'whatsapp';
const WHATSAPP_RECONNECT: { initialMs: 2000; factor: 1.8; maxMs: 30_000; jitter: 0.25; maxAttempts: 12 };
const WHATSAPP_SHUTDOWN_TIMEOUT_MS: 30_000;
// error codes: 'whatsapp_auth', 'whatsapp_connection', 'whatsapp_logged_out' (WHATSAPP_*_ERROR_CODE)
```

<<< @/snippets/chat.ts#whatsapp

| Option | |
|---|---|
| `account` | Required. A non-secret alias of the account (the conversation account), not its phone number |
| `auth` | Required. An `IWhatsAppAuthProvider` (below), e.g. `createStoreWhatsAppAuth()` |
| `policy` | Required. `{ senders, groups?, requireGroupMention? }` or `{ open: true, groups?, requireGroupMention? }` (below) |
| `resolveInvoker(identity)` | Required. The invoker of an allowed message's runs; `undefined` denies the message |
| `state` | Required. The Chat SDK `StateAdapter` of the `Chat` |
| `approvalUrl(ref)` | Required. The approval link, `ref = { runId, approvalId, agent }` (ids only) |
| `onPairing({ qr })` | Required. Gets the QR reference to render while the account is not paired; never a log or `onError` |
| `onStatus(status)` | Called on every status change; a throw is reported, the change stands |
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
    lost?: Promise<unknown>;       // resolves when the provider lost the session (e.g. its lease)
};

function createStoreWhatsAppAuth(options: StoreWhatsAppAuthOptions): IWhatsAppAuthProvider; // @chamvi/chat-whatsapp
// StoreWhatsAppAuthOptions = { vault: IConnectionVault, connection: string, owner?: string, leaseTtlMs?: number }
const WHATSAPP_CONNECTION_TYPE: 'whatsapp';
```

`createStoreWhatsAppAuth()` is the provider `whatsappModule()` uses: over a vault (`createConnectionVault({ store, keyring, clock })` from `@chamvi/core`, `store.connections` required, `createKeyring()`/`parseKeyring()` for the keys) it opens the connection `connection` of type `whatsapp`, refused with `ConnectionHeldError` (`connection_held`) while another owner holds it, and maps every key-store write to one sealed, fenced batch.

`acquire` loads the session and takes its location exclusively (a second holder is refused with `ConnectionHeldError`: the connection shows `held-elsewhere` and retries). chamvi calls `saveCreds` and the key store only while the lease is in use: once the connection closes, every later call is refused (`InvalidRunStateError`). On stop it ends the socket (bounded by `WHATSAPP_SHUTDOWN_TIMEOUT_MS`), then waits for pending writes, `flush`es and `release`s, within a second `WHATSAPP_SHUTDOWN_TIMEOUT_MS` (no write is admitted after the close, so a dead link's end never eats into it); past it, or when `flush` fails, the lease is not released (fenced) and `whatsapp_auth` is reported. A lease that arrives after the stop is released at once.

### Connection

`status()`: `stopped`, `connecting`, `pairing` (a QR is out), `connected` (an `open` event), `disconnected`, `logged-out`, `held-elsewhere` (the session is held by another process), `failed` (the session store failed). `reset()` clears the session and pairs again without restarting the channel (`InvalidRunStateError` while it is not started). Sends go out only while `connected`. An unexpected close reconnects after `min(30 s, 2 s * 1.8^n)` ±25 % on the clock, at most 12 times in a row (reset by an open), then reports `whatsapp_connection` and stays disconnected. A logout (401) reports `whatsapp_logged_out` and a replacing session (440) `whatsapp_connection`; neither reconnects.

### Cron runs in a conversation

`setup.conversation({ chat })` returns the `ConversationRef` of a chat for [`cron.on(expression, { conversation, text })`](/guide/scheduler#inside-a-conversation): the identity intake computes for a message there (audience `direct:<jid>` or `group:<jid>`), and the chat's address. `chat` is a normalized phone number jid (`<digits>@s.whatsapp.net`, a direct chat) or group jid (`<id>@g.us`); anything else throws `InvalidAgentDefinitionError`.

```ts
cron.on('0 7 * * *', {
    conversation: whatsapp.conversation({ chat: '491701111111@s.whatsapp.net' }),
    text: 'Send me my morning briefing.',
});
```

A send goes out only while the connection is `connected`, as any reply.

### Delivery

A send posts the raw text to the chat's jid with a message id derived from the send's key (`3EB0` + 36 hex of its SHA-256), so a retry reuses the id. Whether WhatsApp drops such a duplicate is not verified: delivery is at least once.

### With @chamvi/app

`whatsappModule()` (`@chamvi/chat-whatsapp/module`) is the production path: the session in the app store, pairing and reset on the dashboard.

<<< @/snippets/chat.ts#whatsapp-store

```ts
function whatsappModule(options: WhatsAppModuleOptions): WhatsAppModule; // @chamvi/chat-whatsapp/module
// WhatsAppModuleOptions = WhatsAppChatOptions without auth, onPairing, onStatus
//   & { connection: string; leaseTtlMs?: number; approvalUrl?: WhatsAppChatOptions['approvalUrl'] }
// WhatsAppModule: { channel, handle, on(), to(), conversation(), status(), reset() }
```

The factory builds the channel at once (nothing read, acquired or connected), so agents subscribe with `module.on()`. In `setup` (start mode, `chamvi start --check` included) it resolves the keyring from `CHAMVI_ENCRYPTION_KEYS` (unset or malformed: setup fails naming the variable) and builds the vault over the app store, contributes the channel to `AppToken.CHANNELS` and the connection to `AppToken.CONNECTIONS` (the dashboard's Connections page and `/connections`); `approvalUrl` defaults to the dashboard under `CHAMVI_PUBLIC_URL` (one of them is required). A `run-job` contributes the channel only, a migration nothing. The lease is taken only when the engine starts the channel, so a check acquires and writes nothing. Use it instead of `chatModule()`, not with it.

With your own provider, `chatModule()` contributes a `createWhatsAppChat()` channel; it adds no env variable and constructs nothing, so `chamvi start --check` neither acquires the auth lease nor connects:

<<< @/snippets/chat.ts#whatsapp-module

## What is not guaranteed

- **No lossless or offline ingestion.** A message that arrives while the connector is down, or that the process loses before it is stored as runs, is not fetched later. Platform history is not read.
- **Stop during a decrypt.** A message whose signal key commit arrives after the stop refused auth writes is not processed; Baileys may retry the commit for about 30 s, refused each time.
- **At least once delivery.** A send that times out (30 s) may still be delivered; the retry reuses the message id, but whether WhatsApp drops the duplicate is unverified.
- **Text only.** Messages with media are refused (reported, no run); replies are text up to 4096 characters, never split.
