# Upgrading

chamvi is pre-1.0: a minor release may break the API. Each section lists what changed and the exact replacement.

## Upgrading to 0.13

### Records move to `@chamvi/core-kit`

The domain records, enums, constants, helpers and wire views are in the new browser-safe `@chamvi/core-kit`; `@chamvi/app` re-exports it. `@chamvi/store` keeps only the repository ports, so every record, enum, constant and helper it exported (`Run`, `Step`, `RunStatus`, `STEP_STORED_ORDER`, `normalizeEnvelope`, ...) is imported from `@chamvi/core-kit` (or `@chamvi/app`). Install core-kit next to core when you do not use `@chamvi/app`. These exports are also removed from their old package:

- `@chamvi/core`: `Budget`, `ArtifactInput`, `ConnectionStatus`, `ConnectionWidget`, `ConnectionFieldKind`, `ConnectionFieldSource`, `ConnectionState`, `PeerStartInput`, `PeerRunView`, and the domain rules `isAgentName`, `isArtifactMediaType`, `AGENT_NAME_MAX_LENGTH`, `TRIGGER_KEY_MAX_LENGTH`, `DISPATCH_DEPTH_MAX`, `PEER_ORIGIN_MAX_LENGTH`, `APPROVAL_OPTIONS_MAX`.
- `@chamvi/http`: `AgentSummary`, `AgentIssue`, `ScheduleSummary`, `ScheduleOverlap`, `MeView`, `ComponentView`, `AuthorizationCheckView`, `RunView`, `InvokerView`, `UiPage`, `ConnectionView`, `ConnectionDetailView`, `ConnectionTypeFieldView`, `ConnectionTypeView`, `ConnectionSettingsFieldView`, `ConnectionSettingsView`, `ConnectionTestView`, `ConnectionSecretValues`, `ConnectionSaveBody`, `ConnectionCreateBody`, `ApproveBody`, `AuthorizationCheckBody`.

| Before | After |
|---|---|
| `import type { Run, RunStatus } from '@chamvi/store'` | `import type { Run, RunStatus } from '@chamvi/core-kit'` (or `@chamvi/app`) |
| `import type { RunView, Budget } from '@chamvi/http'` / `'@chamvi/core'` | `import type { RunView, Budget } from '@chamvi/core-kit'` (or `@chamvi/app`) |

### Errors move to `@chamvi/errors`

`ChamviError`, `ErrorCode` and `ValidationError` are no longer exported by `@chamvi/core`. Import them from `@chamvi/errors`, or from `@chamvi/app`, which re-exports it. Core's engine errors (`AgentNotFoundError`, `BudgetExceededError`, ...) stay in `@chamvi/core` and now extend the new `ChamviError`. Error codes, response bodies and statuses are unchanged.

`@chamvi/errors` is a new package: the packages that use it peer on it, so install it next to core when you do not use `@chamvi/app`. `@chamvi/http` and `@chamvi/github` throw its generic built-ins (`BadRequestError`, `ForbiddenError`, ...) instead of `@ebec/http` errors; the HTTP error handler still renders `@ebec/http` errors thrown by your own controllers. Errors thrown by `authorizeRequest`, `assertGranted`, `usePrincipal` and `decodeQuery` (re-exported by `@chamvi/app`) are `@chamvi/errors` built-ins: they no longer carry `status`/`statusCode` and fail `isHTTPError()`; use `httpStatusOf()` or the `is<Name>Error` guards.

The six storage errors (`EntityNotFoundError`, ...) move from `@chamvi/store` to `@chamvi/errors` and extend `ChamviError`; `StoreErrorCode` is gone, its codes are in `ErrorCode` with unchanged values. Each takes a message or options naming the entity, no longer positional labels. Response bodies and statuses are unchanged.

| Before | After |
|---|---|
| `import { ChamviError, ErrorCode, ValidationError } from '@chamvi/core'` | `import { ChamviError, ErrorCode, ValidationError } from '@chamvi/errors'` (or `@chamvi/app`) |
| `import { EntityNotFoundError, StoreErrorCode } from '@chamvi/store'` | `import { EntityNotFoundError, ErrorCode } from '@chamvi/errors'` (or `@chamvi/app`) |
| `new EntityNotFoundError('run')`, `new EntityRelationError('step', 'run')`, `new EntityInvalidError('run', 'save', 'status')` | `new EntityNotFoundError({ entity: 'run' })`, `new EntityRelationError({ entity: 'step', relation: 'run' })`, `new EntityInvalidError({ entity: 'run', operation: 'save', field: 'status' })` |

## Upgrading to 0.12

### Env variable names

An env variable is named after what it configures: chamvi's own settings drop the `CHAMVI_` prefix, a setting for an external system keeps that system's name (`AUTHUP_*`, `GITHUB_*`, `DISCORD_*`, `OPENCLAW_*`, the provider keys), and conventional names stay as they are (`PORT`, `HOST`, `DATABASE_URL`, `NODE_ENV`). An old name is ignored, not refused: rename every variable in your `.env`, Secrets and chart values with the upgrade. A forgotten one falls back to its default without an error, and some defaults are unsafe:

- `CHAMVI_SANDBOX_PROVIDER=docker` or `kubernetes` falls back to `local`: agent shell commands run unisolated on the app's host or pod.
- `CHAMVI_SCHEDULER=false` falls back to `true`: in CronJob mode the Deployment fires every schedule a second time.
- `CHAMVI_MIGRATE=false` falls back to migrating at every start.
- `CHAMVI_DEPLOYMENT` falls back to `default`: workspaces labelled with the old value are no longer collected.
- `CHAMVI_PUBLIC_URL` unset drops approval links; `CHAMVI_GIT_TOKENS`, `CHAMVI_MAIL_ACCOUNTS` or `CHAMVI_DISCORD_TOKEN` unset leave their module idle.
- `AUTHUP_CLIENT_ID` changes meaning: it now names the dashboard's public client. With `authupModule()`, move the server client to `AUTHUP_SERVER_CLIENT_ID` and `AUTHUP_SERVER_CLIENT_SECRET` (a missing secret refuses the start), and drop or repoint `AUTHUP_CLIENT_ID`: left at `chamvi-server`, the dashboard signs in as the confidential client and the login fails.

With the `agent-app` chart, upgrade the chart in the same rollout: an older chart sets `CHAMVI_SCHEDULER`, `CHAMVI_BASE_PATH`, `CHAMVI_PUBLIC_URL` and `CHAMVI_SANDBOX_*`, which 0.12 no longer reads. Until a chart for 0.12 is released, set the new names under `env` yourself (the older chart does not own them), for example `SCHEDULER: "false"`, `BASE_PATH`, `PUBLIC_URL` and `SANDBOX_NAMESPACE`.

Also mind names your app or platform already sets: chamvi now reads bare `LOG_LEVEL` (only `error`, `warn`, `info` or `debug`, anything else refuses the start), `MODEL`, `TOKENS`, `AGENTS` and `DEPLOYMENT`. A `PROVIDER_*` variable is read only when it ends in a provider field (`_TYPE`, `_API_KEY`, `_BASE_URL`, `_HEADER_<NAME>`).

| Before | After |
|---|---|
| `CHAMVI_MODEL`, `CHAMVI_CONFIG_FILE`, `CHAMVI_KNOWLEDGE_MODEL`, `CHAMVI_TIMEZONE` | `MODEL`, `CONFIG_FILE`, `KNOWLEDGE_MODEL`, `TIMEZONE` |
| `CHAMVI_PROVIDER_<NAME>_*` (`CHAMVI_PROVIDER_TEAM_A_API_KEY`) | `PROVIDER_<NAME>_*` (`PROVIDER_TEAM_A_API_KEY`) |
| `CHAMVI_TOKENS`, `CHAMVI_PUBLIC_URL`, `CHAMVI_BASE_PATH`, `CHAMVI_ENCRYPTION_KEYS` | `TOKENS`, `PUBLIC_URL`, `BASE_PATH`, `ENCRYPTION_KEYS` |
| `AUTHUP_CLIENT_ID`, `AUTHUP_CLIENT_SECRET` (the server's confidential client) | `AUTHUP_SERVER_CLIENT_ID` (default `chamvi-server`), `AUTHUP_SERVER_CLIENT_SECRET` |
| `CHAMVI_UI_AUTHUP_CLIENT_ID` (the dashboard's public client) | `AUTHUP_CLIENT_ID` (default `chamvi`) |
| `CHAMVI_UI_AUTHUP_REALM_ID` | Removed: the dashboard client lives in `AUTHUP_REALM`, like the server client; another realm only through `uiModule({ auth })` |
| `CHAMVI_SCHEDULER`, `CHAMVI_MIGRATE`, `CHAMVI_AGENTS`, `CHAMVI_AGENTS_DIR`, `CHAMVI_AGENTS_POLL_MS`, `CHAMVI_LOG_LEVEL`, `CHAMVI_MAX_CONCURRENT_RUNS` | `SCHEDULER`, `MIGRATE`, `AGENTS`, `AGENTS_DIR`, `AGENTS_POLL_MS`, `LOG_LEVEL`, `MAX_CONCURRENT_RUNS` |
| `CHAMVI_READINESS_DELAY_MS`, `CHAMVI_DRAIN_TIMEOUT_MS`, `CHAMVI_CLOSE_TIMEOUT_MS`, `CHAMVI_PURGE_INTERVAL_MS`, `CHAMVI_FORCE_EXIT_MS` | `READINESS_DELAY_MS`, `DRAIN_TIMEOUT_MS`, `CLOSE_TIMEOUT_MS`, `PURGE_INTERVAL_MS`, `FORCE_EXIT_MS` |
| `CHAMVI_MIGRATION_DATABASE_URL`, `CHAMVI_DEV_LINK` | `MIGRATION_DATABASE_URL`, `DEV_LINK` |
| `CHAMVI_SANDBOX_*` (`CHAMVI_SANDBOX_PROVIDER`, `CHAMVI_SANDBOX_IMAGE`, ...), `CHAMVI_DEPLOYMENT` | `SANDBOX_*`, `DEPLOYMENT` |
| `CHAMVI_GIT_TOKENS` | `SANDBOX_GIT_TOKENS` |
| `CHAMVI_MAIL_*`, `CHAMVI_CALENDAR_*` (`CHAMVI_MAIL_ACCOUNTS`, `CHAMVI_MAIL_<ID>_PASSWORD`, `CHAMVI_CALENDAR_TIMEZONE`) | `MAIL_*`, `CALENDAR_*` (`MAIL_ACCOUNTS`, `MAIL_<ID>_PASSWORD`, `CALENDAR_TIMEZONE`) |
| `CHAMVI_DISCORD_*`, `CHAMVI_DISCORD_<NAME>_*` | `DISCORD_*`, `DISCORD_<NAME>_*` |
| `CHAMVI_GITHUB_<NAME>_*` (a named `githubModule()`) | `GITHUB_<NAME>_*`; the default instance keeps `GITHUB_*` |

Unchanged: `PORT`, `HOST`, `DATABASE_URL`, `NODE_ENV`, `AUTHUP_URL`, `AUTHUP_REALM`, `AUTHUP_TIMEOUT_MS`, `AUTHUP_PERMISSION_OWNER`, `GITHUB_*`, `OPENCLAW_*`, the provider keys (`ANTHROPIC_API_KEY`, ...), `SKILLS_CLONE_TIMEOUT_MS`. The exported constants keep their names and carry the new values (`MAIL_ACCOUNTS_VARIABLE` is `'MAIL_ACCOUNTS'`).

## Upgrading to 0.11

chamvi moves to routup 6.5 and authup 1.0.0-beta.77. An app that pinned `ioredis` for the `ERESOLVE` described under 0.9 can drop the `overrides` entry: `@authup/server-adapter-kit` no longer peers `ioredis`. When the `authup()` authenticator cannot reach authup (introspection, the verifier's token, the JWKs), a request answers 503 instead of 401, so the dashboard no longer signs out during an authup outage.

### Tool limits

Per-tool rate limits ([Limits](/guide/tools#limits)): `limit` on a tool, `limits` on an agent, the `limitService` of the engine and `AppToken.LIMIT_REPOSITORY`/`LIMIT_SERVICE`. One store migration, `LimitUses1795552285096`, adds the table `chamvi_limit_uses` and runs like any other (`CHAMVI_MIGRATE`, `chamvi migrate`). A custom store module must register `AppToken.LIMIT_REPOSITORY` (an `ILimitRepository`, proven by `describeLimitRepositoryContract()` of `@chamvi/test-kit`); the app builds the `LimitService` from it and purges it with the lock and idempotency services. An engine built by hand needs `limitService` when an agent declares limits or one of its tools carries a `limit`.

### Breaking changes

| Change | Before | Replacement |
|---|---|---|
| Path matching (`@chamvi/http`) | Static path segments matched in any letter case (`/DOCS`, `/Runs/:id`, `/HEALTHZ`) | Paths match in their exact case; another case answers 404, and a wrong-case `/HEALTHZ` is rate limited. Call routes, probes and webhooks with the exact path, `basePath` included. Extra routes and controller paths that differ from a built-in route or from each other only by case are accepted as separate routes |
| `rateLimit.trustProxy` (`@chamvi/http`) | Accepted and ignored | Removed from the option type; the app's `trustProxy` decides the client address the limiter keys by |
| `GET /runs/:id/artifacts/:artifactId` (`@chamvi/http`) | `attachment; filename="…"; filename*=UTF-8''…` for every name, `_` for characters outside ASCII | An ASCII name as `filename` only (quoted when needed); a non-ASCII name with `filename*` and `?` in the `filename` fallback |
| `AUTHUP_CLIENT_ID` (`@chamvi/app/authup`) | Required | Defaults to `chamvi-server`. Set it to keep another client name |
| `AUTHUP_REALM` (`@chamvi/app/authup`) | None: the client-credentials request carried no realm | New, default `master` (or `authupModule({ clientRealm })`): the realm, by name or id, of the server and dashboard clients, sent as `realm_id`. A server client outside `master` needs it set |
| Dashboard sign-in (`uiModule()`, the `*-ui` pages) | The authup login only with `CHAMVI_UI_AUTHUP_CLIENT_ID` | Offered whenever `AUTHUP_URL` is set, as the client `chamvi` (`CHAMVI_UI_AUTHUP_CLIENT_ID`) of the realm `AUTHUP_REALM` (`CHAMVI_UI_AUTHUP_REALM_ID`). Provision a public client `chamvi` with the redirect URI `<origin><uiBase>/login/callback`, set `CHAMVI_UI_AUTHUP_CLIENT_ID` to yours, or pass `uiModule({ auth: { tokens: true } })` to keep the token login only |

## Upgrading to 0.10

A connection row is identified by its id, its generation, never by a timestamp: a save made from a form that another save, a WhatsApp reset or a delete and create replaced answers 409 `connection_changed`, and the dashboard keeps the typed values and offers **Reload values**. No migration: the id is the row's existing primary key.

One store migration, `LockTokens1795093873329`, runs like any other (`CHAMVI_MIGRATE`, `chamvi migrate`): it adds the table `chamvi_lock_tokens` and the column `chamvi_locks.token` (bigint, `NOT NULL`), filled for the stored locks in the same transaction. Lock tokens start at the wall clock in microseconds, so a recreated or switched lock store issues tokens above those an earlier store handed out as long as its host's clock (in microseconds) is past the highest of them. A host whose clock is behind (clock skew, or the same millisecond as the last issued token), like a wall clock set back, issues lower tokens: a fenced writer (a knowledge collection) then refuses its writes until the clock catches up. Once migrated, `chamvi_locks.token` is `NOT NULL`, so a replica of an older version that is still running cannot take a new lock (every lock insert fails): stop old replicas before or while migrating (the `agent-app` chart's `Recreate` strategy does this; suspend run-job CronJobs too).

Agents can run in another chamvi app ([Remote agents](/guide/remote-agents)): `defineRemoteAgent()`, the new package `@chamvi/peer` with `peerModule()`, and `AppToken.PEERS`. Nothing changes for an app that configures no peer. `@chamvi/http` adds the route `POST /runs/:id/wake` (peers only; anyone else gets 404) and the error code `peer_start_busy` (503 with `Retry-After`, a peer's start only); a run can store the code `remote_failed`, and a waiting run the wait kind `remote`. A client that switches over `run.waiting.kind` must handle `remote`. `GET /agents` lists a remote agent with `kind: 'remote'` and `remote: { peer, agent }`.

### Breaking changes

| Change | Before | Replacement |
|---|---|---|
| `Connection` (`@chamvi/store`) | No id | `id: string`, the row's uuid v7, set at insert and never changed. `ConnectionService.create()` and `replace()` take `ConnectionInput` (`Omit<Connection, 'id'>`); the service assigns the id |
| `IConnectionService.writeConfig()` (`@chamvi/core`) | `writeConfig(name, write, expectedWrappedKey, expectedRevision?)` | `writeConfig(name, write, { wrappedKey, revision?, generation? })` (`ConnectionWriteExpectation`); a stored id other than `generation` is `ConnectionChangedError` too |
| `ConnectionService.replace()` (`@chamvi/core`) | Kept the config revision and took `createdAt` from the replacement | Bumps the config revision, so a save that read before a reset is refused; keeps the row's `createdAt` |
| `ConnectionConfig`, `ConnectionConfigView`, `IConnectionConfigStore.read()` (`@chamvi/core`) | `revision` only | Also `generation` (the row id); `ConnectionConfigUpdateOptions` takes `generation` next to `revision` |
| `DeclaredConnection.loadedCreatedAt` (`@chamvi/core`), `StoredConnection.createdAt` (`@chamvi/app`) | The loaded row's creation time | `loadedGeneration` and `id`: set `loadedGeneration: row.id` from `readStoredConnections()` in a third-party connection type |
| Stored connection settings (`@chamvi/core`) | Only the HTTP layer checked values; a direct `IConnectionConfigStore` or `writeConfig` caller could store `undefined`, a `Date`, a nested object or text with NUL, and memory and Postgres answered differently | `ConnectionService` refuses with `ValidationError` anything but well-formed text without NUL, finite numbers, booleans and lists of such text (keys well-formed without NUL), for every driver (`assertConnectionSettings()`, `isStorableConnectionText()`) |
| `PUT /connections/:name/config` (`@chamvi/http`) | The body carried `settings` and `secrets` only, and the later of two saves won | The body needs `revision` (400 without) and the `generation` of the `GET /connections/:name/config` it was made from (both in that view; no `generation` and `revision: 0` before the first save). Another revision or generation stored now answers 409 `connection_changed`. `ConnectionSaveBody` and `ConnectionSettingsView` (`@chamvi/http`, `@chamvi/http-kit`) carry both |
| `useConnectionForm()` (`@chamvi/ui-kit`) | A save overwrote whatever another tab saved meanwhile | It sends the view's version; on `connection_changed` it sets `stale` (Save disabled, typed values kept) until `reload()` loads the stored config |
| `IKnowledgeRepository`, `MemoryKnowledgeRepository` (`@chamvi/knowledge`) | One interface holding every storage operation and rule, implemented by each backend | Removed. Storage is three entity ports on `@chamvi/store`'s `IEntityRepository` (`IKnowledgeCollectionRepository` with its children `documents` and `chunks`), and `KnowledgeService` holds the rules: call the service (`knowledge.service`, or `new KnowledgeService({ repository, clock })`) where you called the repository. A custom backend implements the three ports, keeps each collection row's `id` and `fence`, and passes `describeKnowledgeRepositoryContract()` |
| `createMemoryKnowledgeRepository()` (`@chamvi/knowledge`) | Returned a `MemoryKnowledgeRepository` | Returns the root port `IKnowledgeCollectionRepository`; `createKnowledge({ repository })` and `knowledgeModule({ repository })` take it as before |
| `IKnowledge.repository` (`@chamvi/knowledge`) | The `IKnowledgeRepository` | The root port; reads and writes go through the new `IKnowledge.service` |
| `describeKnowledgeRepositoryContract()` (`@chamvi/test-kit`) | `(name, create)`, `create` returning a repository | `({ name, create })`, `create` returning a `KnowledgeService` over fresh repositories |
| `ILockService.acquire()`, `LockService.acquire()` (`@chamvi/core`) | Resolved `true` when granted, `false` when refused | Resolves the lease's fencing token (a `number`) when granted, `undefined` when refused: test `!== undefined` where you tested the boolean. The token is higher than every token the lock store issued before, for any key; `renew` keeps it. `createRepositoryScheduleLock()` (`@chamvi/channel-cron`) still resolves a boolean for hubwire |
| `Lock`, `ILockRepository` (`@chamvi/store`) | `Lock` was `id`, `key`, `owner`, `expiresAt` | `Lock.token: number` and `ILockRepository.nextToken()`: a custom lock repository stores `token` as given and issues `max(last + 1, Date.now() * 1000)`, strictly increasing across all keys and concurrent callers, and passes `describeLockRepositoryContract()` |
| `createKnowledge({ locks })` (`@chamvi/knowledge`) | `Pick<ILockService, 'acquire' \| 'release'>` | Also `renew`: a pass renews its lease in place and keeps the lock's fencing token, which it claims as the collection's fence. Pass `engine.lockService` |

## Upgrading to 0.9

Connections can be configured in the dashboard, on a page per provider ([Connection pages](/guide/ui#connection-pages)). An env-only deployment keeps working once `CHAMVI_TOKENS` uses the new permission format (`"permissions": "*"` or a list of bindings, see Permissions below; the old string list, also `["*"]`, refuses to start), and `CHAMVI_ENCRYPTION_KEYS` is needed once the dashboard saves a connection, also one with plain settings only, since every stored connection has its own data key. One migration, `ConnectionsRevisionsItemBytes1794230765000`, upgrades the 0.8 schema and runs like any other (`CHAMVI_MIGRATE`, `chamvi migrate`). It adds the connection settings and secrets tables; the nullable column `chamvi_runs.agent_revision`, the agent revision a permission-checked run is bound to (existing runs keep it empty and run as before); and the column `chamvi_conversation_items.bytes` (integer, `NOT NULL`, no default), the UTF-8 byte length of an item's text, and fills it for every stored item in the same migration (one `UPDATE` computing `octet_length(text)`, then `SET NOT NULL`). The migration runs in one transaction that holds an exclusive lock on the conversation items, runs and connections tables until it commits: conversation turns, run reads and writes, connection reads and every read of the items table (the recall, the conversation API) wait for it. The migration sets no `lock_timeout`: each `ALTER TABLE` first waits for every transaction that touched its table (an old replica, an open `psql` session), and every later query of those tables queues behind it. It takes about 12 µs a stored item (measured: 500,000 items of 1 KB in 6 s; TOASTed text is not read), so run it at a start or with `chamvi migrate` before the app serves. Stop every replica of the previous version before migrating: once the column is `NOT NULL`, an old process fails every item insert (the `agent-app` chart's `Recreate` strategy does this; suspend run-job CronJobs too). `POST /agents/:name/runs` and webhooks answer 409 `agent_replaced` when the agent is being replaced at the dispatch; nothing is written, and the caller can retry. Every app serves its OpenAPI document at `<basePath>/openapi.json` and a Swagger UI at `<basePath>/docs`, unauthenticated, by default ([OpenAPI document](/reference/http#openapi-document); `httpModule({ openapi: false })` turns both off). `@chamvi/http` now installs `swagger-ui-dist`, whose dependency `@scarf/scarf` runs a postinstall analytics script unless `SCARF_ANALYTICS=false` is set where `npm install` runs (an image build, CI).

Every app that installs `@chamvi/app` 0.9 next to `typeorm` gets an npm `ERESOLVE`, also without `authupModule()`: npm resolves `@authup/server-adapter-kit` (an optional peer of `@chamvi/app`), which peers `ioredis ^6`, while typeorm has an optional peer `ioredis ^5`. chamvi never uses ioredis through typeorm, so pin it in the app's `package.json`:

```json
{
    "overrides": {
        "ioredis": "^6.0.0"
    }
}
```

### Breaking changes

| Change | Before | Replacement |
|---|---|---|
| WhatsApp pairing | `@chamvi/ui` showed the QR on its Connections page | Add `chatWhatsappUiModule()` (`@chamvi/chat-whatsapp-ui/module`) to keep pairing; the QR is at `<uiBase>/ext/chat-whatsapp`. The generic Connections page keeps the status and Reset session |
| `githubModule()` with a missing required variable | The factory threw | The factory throws for a malformed value only. A partial env fails the start in `setup` naming the variable; nothing set starts idle (tools report not configured, webhooks answer 503) |
| `GITHUB_MODULE_NAME` (`@chamvi/github/module`) | The module's id | The prefix only: the id is `chamvi:github:<name>`, by default `chamvi:github:github`. Change a `dependencies` entry that named the old id |
| Permissions | Dynamic strings (`agent:<name>:run`, `run:read`, `connection:<name>:write`, `tool:<agent>:<tool>`, `*`) | Static names (`chamvi_agent_run`, ...) granted as authup permission bindings, a policy narrowing a grant to an agent or a connection. `CHAMVI_TOKENS` takes `"*"` or a list of bindings. See [Permissions and authup](/guide/permissions#upgrading) |
| `authup()` options (`@chamvi/http`) | `{ verifier }` | `{ verifier, catalog, realm }`; `authupModule()`'s client also needs `permission_read` (realm scope `ownOrNull` or wider) |
| `hasPermission`, `matchesPermission`, `toolPermission` (`@chamvi/core`), `agentPermission` (`@chamvi/http`, `@chamvi/app`) | String matching | `can()` and `canSome()` of `@chamvi/access` (re-exported by `@chamvi/app`) |
| `/knowledge` routes and `KNOWLEDGE_READ_PERMISSION`, `KNOWLEDGE_WRITE_PERMISSION` (`@chamvi/knowledge`) | `knowledge:read`, `knowledge:write` | `chamvi_knowledge_read`, `chamvi_knowledge_write` (covered by `"*"`), checked with `{ "name": "<collection>" }` when the path names one collection; the two constants hold the new names |
| `Permission` and `connectionPermission()` (`@chamvi/http`) | `Permission` held `ALL` (`*`), `RUN_READ`, `RUN_CANCEL`, `STATE_READ` and `STATE_WRITE` as strings (`run:read`, ...); `connectionPermission(name, action)` built `connection:<name>:<action>` | Both removed from `@chamvi/http`. `Permission` of `@chamvi/access` (re-exported by `@chamvi/app`) holds the static names (`Permission.RUN_READ` is `chamvi_run_read`, `Permission.CONNECTION_WRITE` is `chamvi_connection_write`, ...); check a connection with `await can(principal, Permission.CONNECTION_WRITE, { attributes: { name } })` |
| `GET /me` and the dashboard's permission gates (`@chamvi/http`, `@chamvi/ui-kit`) | `/me` answered `bindings` and `authorization`, which a client evaluated with `@chamvi/access`; ui-kit exported `canAddAccount`, `canReadConnection`, `canWriteConnection`, `useResolved`, `ResolvedOptions` and `ConnectionRef`, `AccountsColumn` took a `principal` prop, and `visibleUiPages` was async | `/me` answers `{ id, kind, name?, identity? }` only. Ask `POST /authorization/check` with `{ names? }` for `{ permissions }`, the names the caller may attempt (an upper bound, the route decides per resource). In ui-kit read `session.permissions` and `session.allowed(name)`; `visibleUiPages(pages, connections, allowed)` is synchronous; pass `AccountsColumn` `can-create` (`session.allowed('chamvi_connection_create')`) in place of `principal` |
| The dashboard API client (`@chamvi/ui-kit`) | ui-kit exported `createApiClient`, `IApiClient`, `ApiError`, `toApiError`, `asApiError`, `retryDelayOf`, `path`, `pageQuery`, `withQuery`, `runListQuery`, `RunListFilter`, `PageQuery`, the wire types (`RunWire`, `ConnectionWire`, `UiPageWire`, ...), the SSE helpers (`parseEventStream`, `sleep`, `RECONNECT_DELAYS_MS`, `FATAL_STREAM_STATUSES`), `createConnectionsApi`, `createConnectionConfigApi`, `openConnectionStream`, `IConnectionsApi` and `IConnectionConfigApi`; `AppContext.client` was an `IApiClient` with flat methods (`listRuns`, `getRun`, `me(token)`, `send()`) | Import them from the new `@chamvi/http-kit`. `AppContext.client` is its `IClient`, one API per domain: `client.run.getMany(query)`, `client.run.getOne(id)`, `client.account.getMe({ token })`, `client.connection.getMany()`, ...; `useConnections()`, `useConnection()` and `ConnectionPanel` take `client.connection`, `useConnectionForm()` the client. List queries are [rapiq](https://github.com/tada5hi/rapiq) input (`{ filters, pagination, sorts }`); the dashboard's runs URLs carry rapiq parameters (`filter[agent]`, `page[offset]`), so an old `?agent=&status=&page=` link opens unfiltered |
| `IClock.now()` (`@chamvi/core`) | Returned a `Date` | Returns epoch milliseconds (`number`); wrap it in `new Date(clock.now())` where a `Date` is needed. A custom `IClock` returns `Date.now()` or its own milliseconds |
| `IClock.setTimeout()` (`@chamvi/core`) | `setTimeout(fn, ms, { keepAlive? })` returning `{ clear }`; `systemClock` timers never held the process unless `keepAlive` was set | `setTimeout(fn, ms)` returning `ClockTimer` (`{ clear(), unref?() }`); `ClockTimerOptions` is removed. A `systemClock` timer holds the process until `unref()` is called: call `timer.unref?.()` after arming a timer that must not keep the process alive |
| `ControllableClock` (`@chamvi/test-kit`) | `now()` returned a `Date`; the constructor took a `Date` | `now()` returns epoch milliseconds; the constructor takes a `Date` or milliseconds (default 0); its timers have no `unref()` |
| `toolPolicy` | `(toolName, { run }) => boolean` | `(toolName, { run, now }) => boolean \| Promise<boolean>` (a synchronous policy keeps working) |
| Skill discovery in a `prepareSkills()`/`gitSkills()` source (`@chamvi/skills`) | The whole repository tree was searched, so a vendored copy of a selected skill made it ambiguous | The standard locations are searched (root, `skills/`, agent skill folders, plugin manifests), the whole tree only when those hold no skill. Move a selected skill that lives elsewhere into `skills/`, or the name fails as missing |
| Submodules in a `prepareSkills()`/`gitSkills()` source (`@chamvi/skills`) | Submodule gitlinks were not checked | The SDK initialises them; a submodule at, inside or around a selected skill folder refuses the source. Move the submodule or vendor its files. Tracked symlinks anywhere in the source still refuse it |
| Private `prepareSkills()`/`gitSkills()` sources (`@chamvi/skills`) | One clone, which could fall back to the host's `gh` login or SSH keys | A second, file-less fetch of the pinned commit runs with plain Git and no fallback. Configure Git credentials for the source before upgrading; a source reachable only through `gh` fails with the retryable `skill_preparation_failed`. See the [skills reference](/reference/skills) |
| Body order on routes with a body (`@chamvi/http`) | An authenticated caller without the permission, or one addressing a missing resource, got 403 or 404 before the body was read | The body is read after authentication and before the permission and existence checks: such a caller gets 400, 413 or 415 for a malformed or oversized body. Anonymous callers still get 401 before any read |
| Reserved route segments (`@chamvi/http`) | An extra route (`routes`) could use the first segment `docs` or `openapi.json` | Both are built-in routes: an extra route at `/docs`, `/openapi.json` or below them (in any letter case), for example the dashboard at `uiRoutes({ basePath: '/docs' })`, refuses to boot with `InvalidAgentDefinitionError` (`Route path "/docs" collides with a built-in route.`), also with `openapi: false`. Move the route |
| Reserved route segment `components` (`@chamvi/http`) | An extra route or a contributed controller could use the first segment `components` | `GET /components` is a built-in route: an extra route or controller at `/components` or below refuses to boot with `InvalidAgentDefinitionError`. Move the route |
| `chamvi_component_read` (`@chamvi/access`) | Thirteen `chamvi_*` names | A new name, covered by `"*"`: grant it to a principal with a list of bindings that should see `GET /components` and the dashboard's Components page (hidden without it) |
| Background jobs (`@chamvi/app`, `@chamvi/knowledge`) | The store purge and the agents dir watcher ran as the lifecycle hooks `chamvi:purge` and `chamvi:agents-watcher`; `knowledgeModule()` began indexing in a `started` hook | They are [components](/guide/app#background-components) (`store-purge`, `agents-watcher`, `agents-packages`, `knowledge-managed`) of the new built-in `chamvi:components` module: they start after `engine.start()` and before the `started` hooks, and stop in the `stopping` phase, before the drain. A module that replaced or listed those hooks contributes to `AppToken.COMPONENTS` instead; a module that replaces `chamvi:components` must run them |
| `@routup/decorators` (`@chamvi/http`, `@chamvi/app`) | A dependency of `@chamvi/http` | A peer dependency (`^5.3.0`), for the [controllers](/guide/controllers) an app contributes. npm 7 and later and pnpm 8 and later install it: nothing to do. An app installed without automatic peers (npm with `--legacy-peer-deps`, Yarn Berry, pnpm before 8) lists `@routup/decorators` in its `package.json`; otherwise it fails at startup with a module-not-found error |
| Errors of `GET /connections/:name`, `GET`/`PUT /connections/:name/config` (`@chamvi/http`) | A 403, and on the config routes every error, had no `cache-control` | Every response the route itself produces (after authentication and the body read), a 403 or 404 included, carries `cache-control: private, no-store` |
| Metric `path` labels (`@chamvi/http`) | Every channel shared `/channels/:name/*`; a request with a method no route of its path serves (`OPTIONS` included) was labelled by the path's route | One label per mounted channel, `/channels/<name>/*` (`/channels/github/*`); such a request is labelled `/_unmatched`. Update the dashboards and alerts that select `path="/channels/:name/*"` |
| A TypeScript entry (`@chamvi/cli`): `chamvi dev`, and `start`, `run-job` or `migrate` with `--entry src/index.ts` | Loaded through Node's type stripping, without tsdown | The CLI transforms it with the rolldown of tsdown and the app's `tsconfig.json` ([TypeScript entries](/reference/cli#typescript-entries)); without tsdown the command exits 2 with `The entry is TypeScript: install tsdown ^0.23.4 to load it.` Install tsdown as a devDependency (`npm install --save-dev tsdown`) wherever such a command runs. A built entry (`dist/index.mjs`) needs nothing, so an image that runs it with dev dependencies pruned keeps starting |

### Stored types moved to `@chamvi/store`

The shapes the store holds moved from `@chamvi/core` to the new package `@chamvi/store`, which core and every store depend on; core does not re-export them. Import these from `@chamvi/store` (or `@chamvi/app`, which re-exports both packages) instead of `@chamvi/core`. The shapes are unchanged.

| Export | Kind |
|---|---|
| `Run`, `RunStatusLiteral`, `Usage`, `RunTaint` | type |
| `RunStatus` | enum |
| `WaitPoint`, `ApprovalWaitPoint`, `DispatchWaitPoint` | type |
| `ApprovalOption` | type |
| `TriggerEnvelope`, `Invoker`, `TriggerParent`, `TriggerSource` | type |
| `Artifact` | type |
| `Step`, `Checkpoint` | type |
| `AgentRevision` | type |
| `Connection` | type |
| `ConversationIdentity`, `ConversationScope`, `ConversationBinding` | type |
| `ConversationItem`, `ConversationNote`, `ConversationNoteSource`, `ConversationNoteOperation`, `ConversationSnapshot` | type |
| `normalizeEnvelope`, `normalizeWaitPoint` | function |

`@chamvi/store` lists `ai` as an optional peer dependency, for the `ModelMessage` of `Checkpoint` and `ConversationSnapshot`. It also holds the repository ports, the stored row types (`CheckpointRecord`, `EffectRecord`, `ArtifactRecord`, `StateEntry`, `StateDocument`, `StateDocumentPage`, `Lock`, `IdempotencyKey`, `AgentRevisionRecord`, `ConnectionRecord`, `ConnectionEntryRecord`, `ConnectionSecretRecord`, `ConversationRecord`, `ConversationItemRecord`, `ConversationNoteRecord`, `ConversationOperationRecord`) and the storage errors.

### Services in place of the store aggregate

<!-- removed-api -->
The store aggregate is gone: `IStore`, `createMemoryStore()` and `MemoryStoreOptions` (`@chamvi/core`), `createDatabaseStore()`, `DatabaseStoreOptions` and `DatabaseStore` (`@chamvi/store-db`), `EngineOptions.store`, `IEngine.store` (`engine.store`) and `AppToken.STORE` (`@chamvi/app`) are removed.
<!-- /removed-api -->

Every rule lives in a service of `@chamvi/core`, each over the repository ports of `@chamvi/store` that only store and read. `new Engine()` takes each service by name and exposes it as a property of the engine.

| Service (engine option and property) | Ports (`@chamvi/store`) | Memory (`@chamvi/store-memory`, `{ registry }`) | PostgreSQL (`@chamvi/store-db`, `(dataSource)`) |
|---|---|---|---|
| `RunService` (`runService`, required) | `IRunRepository` | `MemoryRunRepository` | `DatabaseRunRepository` |
| `StepService` (`stepService`, required) | `IStepRepository` | `MemoryStepRepository` | `DatabaseStepRepository` |
| `CheckpointService` (`checkpointService`, required) | `ICheckpointRepository` | `MemoryCheckpointRepository` | `DatabaseCheckpointRepository` |
| `EffectService` (`effectService`, required) | `IEffectRepository` | `MemoryEffectRepository` | `DatabaseEffectRepository` |
| `ArtifactService` (`artifactService`, required) | `IArtifactRepository` | `MemoryArtifactRepository` | `DatabaseArtifactRepository` |
| `StateService` (`stateService`, required) | `IStateRepository`, `IStateDocumentRepository` | `MemoryStateRepository`, `MemoryStateDocumentRepository` | `DatabaseStateRepository`, `DatabaseStateDocumentRepository` |
| `LockService` (`lockService`, required) | `ILockRepository` | `MemoryLockRepository` | `DatabaseLockRepository` |
| `IdempotencyService` (`idempotencyService`, required) | `IIdempotencyRepository` | `MemoryIdempotencyRepository` | `DatabaseIdempotencyRepository` |
| `AgentRevisionService` (`agentRevisionService`, required) | `IAgentRevisionRepository` | `MemoryAgentRevisionRepository` | `DatabaseAgentRevisionRepository` |
| `ConnectionService` (`connectionService`, optional; the engine only exposes it) | `IConnectionRepository` with `entries`, `secrets` | `MemoryConnectionRepository` | `DatabaseConnectionRepository` |
| `ConversationService` (`conversationService`, optional; required by `conversations`) | `IConversationRepository` with `items`, `notes`, `operations` | `MemoryConversationRepository` | `DatabaseConversationRepository` |

Build every memory repository on one `MemoryRegistry`: it enforces the references the database's foreign keys do, and the connection fence reads the lock rows there. Specs and examples build all of it with `createTestEngine()` of `@chamvi/test-kit` (an engine on memory repositories, `replicaOf` for a second replica on the same services); an app gets it from `@chamvi/app` (below).

| Before | Replacement |
|---|---|
| `new Engine({ store: createMemoryStore({ clock }), agents })` | `new Engine({ runService, stepService, checkpointService, effectService, artifactService, stateService, lockService, idempotencyService, agentRevisionService, connectionService?, conversationService?, agents })`, each service on its repository (see [Memory repositories](/repositories/memory) and [Database store](/repositories/database)) |
| `engine.store.runs.insert(run)` | `engine.runService.create(run)` (resolves `false` for a stored id, as before) |
| `engine.store.runs.findOne`, `findOneOrFail`, `update`, `find`, `findOrFail`, `claim`, `renewClaim` | The same methods on `engine.runService`; `runService.list(query)` also takes a rapiq query |
| `engine.store.steps.insert(step)`, `find`, `findOrFail` | `engine.stepService.create(step)`, `find`, `findOrFail` |
| `engine.store.checkpoints.save`, `findOne`, `findOneOrFail` | The same methods on `engine.checkpointService`; `save` resolves the checkpoint the run holds afterwards |
| `engine.store.effects.findOne`, `findOneOrFail`, `save` | The same methods on `engine.effectService`; `save` resolves `{ result }` |
| `engine.store.artifacts.insert(artifact, data, key?)` | `engine.artifactService.create(artifact, data, key?)` (resolves `false` when the id, or the key in the run, is taken) |
| `engine.store.artifacts.save`, `findOne`, `findOneOrFail`, `findOneByKey`, `read`, `find`, `findOrFail` | The same methods on `engine.artifactService` |
| `engine.store.state.findOne`, `findOneOrFail`, `set`, `find`, `findOrFail`, `findDocuments`, `findDocumentsOrFail`, `upsertDocument`, `deleteDocument` | The same methods on `engine.stateService` (`set` resolves the stored value, `upsertDocument` `{ id, doc }`), plus `list(agent, query)` and `listDocuments(agent, collection, query)` |
| `engine.store.locks.acquire`, `renew`, `release`, `purgeExpired` | The same methods on `engine.lockService`, plus `holds(key, owner)`; `purgeExpired` resolves the number of rows deleted, on memory too |
| `engine.store.idempotency.claim`, `purgeExpired` | The same methods on `engine.idempotencyService` |
| `engine.store.agentRevisions.findOne`, `save`, `delete`, `find` | The same methods on `engine.agentRevisionService` (plus the `OrFail` forms); `save` resolves the stored marker |
| `engine.store.connections.insert(connection)` | `engine.connectionService.create(connection)` (resolves `false` for a taken name) |
| `engine.store.connections.findOne`, `findOneOrFail`, `find`, `delete`, `replace`, `findEntry`, `findEntries`, `writeEntries` | The same methods on `engine.connectionService` |
| `engine.store.conversations.resolve`, `beginTurn`, `endTurn`, `prepareEmit`, `confirmEmit`, `pendingEmits`, `findItems`, `findNotes`, `findOneNote`, `applyNote`, `reset`, `delete`, `prune` and the `OrFail` forms | The same methods on `engine.conversationService` |
| `IConversations.repository` (the engine's conversation capability) | `IConversations.service`, the `ConversationService` |
| `IRunRepository`, `IStepRepository`, `ICheckpointRepository`, `IEffectRepository`, `IArtifactRepository`, `IStateRepository`, `ILockRepository`, `IIdempotencyRepository`, `IAgentRevisionRepository`, `IConnectionRepository`, `IConversationRepository` from `@chamvi/core` | The ports of the same names from `@chamvi/store` (each the generic entity port, see [Writing a third-party store](#writing-a-third-party-store)), plus `IStateDocumentRepository`; `RunFindOptions`, `RunUpdateOptions`, `StateFindOptions`, `StateDocumentFindOptions` stay in `@chamvi/core` |
| `MemoryRunRepository`, `MemoryStepRepository`, ..., `MemoryConnectionRepository({ clock?, holdsLock })`, `MemoryConversationRepository({ clock?, hasRun? })` from `@chamvi/core`, `MemoryRunReferenceOptions`, `MemoryConversationRepositoryOptions` | The `Memory*Repository` classes of `@chamvi/store-memory`, each `new ...({ registry })`; the clock belongs to the services |
| `new DatabaseRunRepository({ dataSource, clock? })` and the other database repositories with options | `new DatabaseRunRepository(dataSource)` and the others with the data source alone |
| `@chamvi/core/conversation/persistence` (the shared policy for custom stores) | Removed: the policy belongs to `ConversationService` |
| `createAgentState(agent, schema, store.state)`, `wrapToolsForRun(tools, ctx, store.effects)`, `findApprovalWaitBelow(store.runs, run)` | `createAgentState(agent, schema, engine.stateService)`, `wrapToolsForRun(tools, ctx, engine.effectService)`, `findApprovalWaitBelow(engine.runService, run)` |
| `createConnectionVault({ store, keyring, clock? })` | `createConnectionVault({ connectionService, lockService, keyring, clock? })`; without a connection service it throws `InvalidAgentDefinitionError` |
| `createRepositoryScheduleLock(store.locks, owner)` (`@chamvi/channel-cron`) | `createRepositoryScheduleLock(engine.lockService, owner)` |
| `githubChannel({ app, locks? })` (`@chamvi/github`) with `store.locks` or a channel-local memory lock | `locks` is required, a `LockService` (or a `Pick` of `acquire` and `release`): `githubChannel({ app, locks: engine.lockService })`; `githubModule()` passes `AppToken.LOCK_SERVICE` |
| `createKnowledge({ locks: store.locks })` (`@chamvi/knowledge`) | `createKnowledge({ locks: engine.lockService })`; `knowledgeModule()` takes `AppToken.LOCK_SERVICE` |

### `@chamvi/app`: the store module and the tokens

`storeModule()` registers the repositories: the database repositories over `DATABASE_URL` (or a given data source), else memory repositories on one registry. In the same setup step the app builds every service from the registered repositories and registers each under a token of its own; the engine module passes them to the engine, and the lock and idempotency services get the hourly purge (`CHAMVI_PURGE_INTERVAL_MS`), on memory too.

| Before | Replacement |
|---|---|
| `storeModule({ store, url?, dataSource? })`, `StoreModuleOptions` with `store` | `storeModule({ url?, dataSource? })` |
| `AppToken.STORE` | A token per repository and per service: `RUN_REPOSITORY`, `RUN_SERVICE`, `STEP_REPOSITORY`, `STEP_SERVICE`, `CHECKPOINT_REPOSITORY`, `CHECKPOINT_SERVICE`, `EFFECT_REPOSITORY`, `EFFECT_SERVICE`, `ARTIFACT_REPOSITORY`, `ARTIFACT_SERVICE`, `STATE_REPOSITORY`, `STATE_DOCUMENT_REPOSITORY`, `STATE_SERVICE`, `LOCK_REPOSITORY`, `LOCK_SERVICE`, `IDEMPOTENCY_REPOSITORY`, `IDEMPOTENCY_SERVICE`, `AGENT_REVISION_REPOSITORY`, `AGENT_REVISION_SERVICE`, and, while the store keeps them, `CONNECTION_REPOSITORY`, `CONNECTION_SERVICE`, `CONVERSATION_REPOSITORY`, `CONVERSATION_SERVICE`; `STORE_KIND` says where the rows live (`memory` or `database`) |
| A module asked `container.resolve(AppToken.STORE).connections !== undefined` | It asks `container.has(AppToken.CONNECTION_SERVICE)` |
| A module replacing the store module (`ModuleName.STORE`) registered `AppToken.STORE` | It registers the repository tokens and, if it likes, `STORE_KIND`; the app builds the services (see [Writing a third-party store](#writing-a-third-party-store)) |
| `migrateStore()` and `assertStoreNotLegacy()` (`@chamvi/store-db`) threw a `ChamviError` (code `store_legacy_schema`) | `LegacySchemaError` of `@chamvi/store-db` (an ebec `BaseError`, the same code and message); `@chamvi/store-db` has no `@chamvi/core` peer dependency any more |

`@chamvi/app/testing` adds `memoryStoreModule({ registry?, connections?, conversations? })`: the built-in memory store on a given `MemoryRegistry` (a second app on the same registry sees the rows of the first), without the connection or conversation repository when the flag is `false`. A spec reaches a repository or a service through its token on the harness's container.

### A database for an app's own tables

New in `@chamvi/app`: `databaseModule({ entities, migrations, migrationsDirectory, migrationsTableName, name? })`, `dataSourceToken(name?)`, `DatabaseToken`, `readDatabaseDescriptors(app)` and `APP_MODULES` (the symbol an App lists its modules under); in `@chamvi/store-db`: `buildDatabaseOptions`, `connectDatabase`, `synchronizeDatabase`, `closeDatabase`, `migrateDatabase`, `pendingDatabaseMigrations`, `findUntypedColumns`, `queueDataSource`, `DatabaseDriverMissingError`, `DatabaseOptionsError` and `DatabaseBusyError`. See [Database](/guide/database) and, for specs, [Testing](/guide/testing#an-app-s-database). On SQLite the module's data source takes one statement, transaction or whole operation at a time on its one connection; inside a transaction opened by hand on a query runner use that runner or its manager, and end it: work that waits 30 seconds (`databaseModule({ waitTimeoutMs })` changes it) behind one open transaction, or an operation that does not return, is refused with `DatabaseBusyError` (its `holder` says which). `connectDatabase(options, queue?)` takes the same wait limit and clock. New in `@chamvi/store-db` for `chamvi migration`: `runMigrationOperation`, `isSameDatabase`, `MIGRATION_OPERATIONS`, `STORE_DATABASE`, `MIGRATION_DATABASE_URL_VARIABLE` and `DATABASE_LOCK_PREFIX`; `migrateDatabase` resolves with the names of the migrations it ran; `databaseModule` refuses the name `store`. A `drained` lifecycle hook now runs also when the engine's drain failed. An app without a database module is unchanged. Without `DATABASE_URL` the module needs the optional peer `better-sqlite3`.

List endpoints and test support for it, new: `defineSchema()`, `decodeQuery()` and `scopeQuery()` in `@chamvi/http` (re-exported by `@chamvi/app`), with the types `ListSchema`, `ListSchemaOptions`, `ListSchemaEntity`, `ListSchemaKey`, `ListFilterOperator` and `ListSortDirection`; `databaseModule({ schemas })` checks each schema against its entity at start; in `@chamvi/store-db`: `applyQuery`, `validateEntitySchemas`, `dateToISOStringTransformer` and the types `ApplyQueryOptions`, `ApplyQueryResult`, `EntityListSchema`; `migrateStore` resolves with the names of the migrations it ran; in `@chamvi/test-kit`: `createTestDataSource({ entities, url? })` with the type `TestDataSourceOptions` (on its first call it loads `typeorm` and the driver, optional peers, and `@chamvi/store-db`, which is in no dependency field of the kit: it is resolved from the kit, then from the app's folder, so the app lists it in its devDependencies). A service spec runs on `MemoryEntityRepository` of `@chamvi/store-memory` (its new option `dates` filters a date field as the instant a value names, as a database date column is filtered; on both a value naming no instant is refused with `EntityQueryError`); there is no fake repository.

### Writing a third-party store

Implement each port of `@chamvi/store` on your storage. A port is the generic entity port `IEntityRepository<T>` on the port's stored type, plus at most one finder (`IRunRepository.findByWaitKind`, `IStateDocumentRepository.findContaining`, `IArtifactRepository.readData`, `ILockRepository` and `IIdempotencyRepository` `removeExpiredBy(time)`, `ILimitRepository` `sumWeight(scope, since)` and `removeCreatedBefore(time)`, `IConnectionRepository.findFence`) and the child repositories of connections and conversations, bound to the parent's transaction. A repository decides nothing: no status or owner compare, limit, default, time stamp or choice of error.

- `findMany(query)` runs a rapiq query (fields, filters, sorts, pagination) and resolves `{ data, meta: { total, limit?, offset? } }`; with a field selection it reads those fields only. A row it read with a field selection is refused by `upsert` and `upsertMany` (it would clear the other columns); `save` of it writes only what changed.
- `findOneById`, `findOneBy(where)`, `findManyBy(where)`: an `EntityWhere<T>` holds a value, `null` or an array of values (any of) per property; inside `transaction(fn)` a single-row read locks the row until the transaction ends.
- `create` and `merge` store nothing; `save` inserts an object `create()` returned and updates one a read returned (its changed properties only), decided by object identity.
- `upsert`, `upsertMany(entities)` (one transaction, in as few statements as the storage allows, a later entity of a key replaces an earlier one), `remove`, `removeMany`, `removeManyBy(where)` (one statement, resolves the count, never an empty where), `validateRelations`, `checkUniqueness`, `transaction(fn)`.
- Six storage errors, each with the entity's label and a fixed message, never a value: `EntityNotFoundError` (`entity_not_found`), `EntityConflictError` (`entity_conflict`, a unique key), `EntityRelationError` (`entity_relation_invalid`, a missing referenced row), `EntityDeadlockError` (`entity_deadlock`), `EntityQueryError` (`entity_query_invalid`: a where with a property set to `undefined`, `findOneById(undefined)`, `removeManyBy({})`, an upsert of a field-selected row, an operation a port does not offer such as a step upsert), `EntityInvalidError` (`entity_invalid`: a value the table refuses, such as a missing required column, a failed check or a value too long; it names the operation and the column or constraint, never the value).
- `ConversationItemRecord.bytes` is the UTF-8 byte length of the item's text, set by `ConversationService`; a repository stores and returns it as given (the recall selects by it, reading `id` and `bytes` only, then the text of the selected items).

`MemoryEntityRepository` (`@chamvi/store-memory`) and `EntityRepositoryAdapter` (`@chamvi/store-db`, for a TypeORM driver) implement all of it; a repository built on either implements only its mapping. Prove each port with its suite of `@chamvi/test-kit`: `describeEntityRepositoryContract` and `describeRunRepositoryContract`, `describeStepRepositoryContract`, `describeCheckpointRepositoryContract`, `describeEffectRepositoryContract`, `describeArtifactRepositoryContract`, `describeStateRepositoryContract`, `describeLockRepositoryContract`, `describeIdempotencyRepositoryContract`, `describeAgentRevisionRepositoryContract`, `describeConnectionRepositoryContract`, `describeConversationRepositoryContract({ name, create, untilBlocked })`. Then give `@chamvi/app` a module named `ModuleName.STORE` that registers each repository token (`RUN_REPOSITORY`, `STEP_REPOSITORY`, `CHECKPOINT_REPOSITORY`, `EFFECT_REPOSITORY`, `ARTIFACT_REPOSITORY`, `STATE_REPOSITORY`, `STATE_DOCUMENT_REPOSITORY`, `LOCK_REPOSITORY`, `IDEMPOTENCY_REPOSITORY`, `AGENT_REVISION_REPOSITORY`; `CONNECTION_REPOSITORY` and `CONVERSATION_REPOSITORY` optional): it replaces the built-in one, and the app builds the services. A missing required token fails the setup with `InvalidAgentDefinitionError` naming it.

| Before | Replacement |
|---|---|
| `describeRepositoryContract((clock) => store)`, `RepositoryContractStore` | The suite per port listed above, and the services' own specs for the rules |
| `describeConversationRepositoryContract((clock) => repository)` (the conversation rules) | `describeConversationRepositoryContract({ name, create, untilBlocked })`, `create` resolving `{ repository, runs, checkpoints }`: storage behaviour only |

### Behaviour changes

- A read leaves out a property set to `undefined` (the memory store kept the key with an `undefined` value): `toMatchObject({ claim: undefined })` on a read run fails, `not.toHaveProperty('claim')` holds.
- Every change reads its row locked first and then the clock: a lease renewal that waited for the row compares a fresh time. A test that moves a `ControllableClock` by a whole `claimTtlMs` at once loses the lease of a running run; move it in steps so the renewals run.
- `effectService.save(key, undefined)` stores `null` on memory too. `findDocuments` lists by document id in code-point order on memory too, and its `where` matches a top-level value when it is deeply equal on both drivers: PostgreSQL used containment (`{ tags: ['a'] }` matched `tags: ['a', 'b']`), memory compared with `===` (a nested value never matched).
- The purge of expired locks and idempotency keys (`CHAMVI_PURGE_INTERVAL_MS`) runs on a memory store too.
- A background component whose stop does not settle within `CHAMVI_DRAIN_TIMEOUT_MS` is logged, the shutdown goes on to the drain, and `stop()` rejects with `app_stop_failed` (the CLI exits 1). The components' stop and the drain share that one budget: the drain gets what the stop left, so the shutdown takes no longer than before.
- A start (or `run-job`) with `CHAMVI_MIGRATE=false` on a store with pending migrations fails with `store_not_migrated`, naming how many are pending, and writes nothing (it started and failed on the first write to a missing column): run `chamvi migrate` before the app starts.
- On PostgreSQL a held lock or a claimed idempotency key is refused on one `SELECT`; acquiring a free lock or claiming a fresh key takes four statements (it took one), a renewal or release four, a takeover of an expired lease or key five.
- Connections: a fenced write (an entry batch, a replace, a fenced delete) locks the connection row, then reads the lease's lock row locked, then the clock; on memory a takeover, renewal or release of the lease in flight is waited for as on PostgreSQL. `writeEntries` on an absent connection is `RepositoryNotFoundError` on both stores (PostgreSQL answered `LeaseLostError`). On PostgreSQL an entry batch is one upsert statement per chunk of rows, and a clear, replace or delete removes the entries and secrets with one `DELETE` each.
- Conversations: every change reads the conversation row locked first (PostgreSQL `FOR NO KEY UPDATE`), then the clock. A memory run or checkpoint bound to a conversation scope the store does not hold is refused with `EntityRelationError` as on PostgreSQL. `beginTurn` of a malformed run id while another run holds the turn answers `busy` on both stores (PostgreSQL threw `RunNotFoundError`). Memory scope ids are uuid v7 as on PostgreSQL; the identity's digest is the row's unique `key`. `resolve` is insert-if-absent: it never revives a deleted generation. The recall reads the sizes of the sent items first and the text of the selected items only; its result is unchanged.

### The HTTP API on the services

`createHttpApp({ engine })` reads everything through the engine's services (`engine.runService`, `engine.stateService`, ...; the connection configurations through `engine.connectionService`, so `connectionConfigs` needs an engine with a connection service). Routes, requests and answers are unchanged, except that a storage error reaching a route is no longer a 500: it answers with its code and a fixed message, never the error's own: `404 entity_not_found`, `409 entity_conflict`, `400 entity_relation_invalid`, `400 entity_query_invalid`, `400 entity_invalid`, `409 entity_deadlock`, `503 database_unavailable` (`@chamvi/store-db`'s `DatabaseUnavailableError`, reported to `onError` as every 5xx). The run listing orders runs the sorts leave equal by `id` (`createdAt`, then `id`, without sorts).

### New variables

Each is optional and names a field of a named instance; the default instance keeps its variables.

| Variables | Read by |
|---|---|
| `CHAMVI_GITHUB_<NAME>_APP_ID`, `_APP_PRIVATE_KEY`, `_WEBHOOK_SECRET`, `_INSTALLATION_ID`, `_APP_SLUG`, `_API_URL` | `githubModule({ name })` |
| `CHAMVI_DISCORD_*`, `CHAMVI_DISCORD_<NAME>_*` | [`discordModule()`](/deployment/discord#with-chamvi-app) |

### Steps

1. Add `chatWhatsappUiModule()` if the app uses `whatsappModule()`, and the other `*-ui` modules for the connections you want to configure in the dashboard.
2. Set `CHAMVI_ENCRYPTION_KEYS` if the dashboard will save connections.
3. A dashboard not at `/ui`: pass the same value as `uiBase` to every `*-ui` module.
4. Replace any reference to the old GitHub module id.
5. Drain the app before the upgrade, so no stored run carries an invoker with old permission strings; rewrite `CHAMVI_TOKENS` and the authup roles ([Permissions and authup](/guide/permissions#upgrading)).
6. Stop every replica of the previous version, then run the migrations (a default start or `chamvi migrate`) before the app serves: on a large conversation items table the byte-length backfill holds that table's lock for its duration (above).
7. Code that builds an engine by hand or reads the store aggregate: move to the services ([Services in place of the store aggregate](#services-in-place-of-the-store-aggregate)); a custom store: [Writing a third-party store](#writing-a-third-party-store).

## Upgrading to 0.8

The Postgres store (`@chamvi/store-db`) now gives every table a single `id` primary key, a time-ordered UUID v7 (the append-only steps and conversation items use a bigint). Run ids, artifact ids and, in Postgres, conversation scope ids are UUIDs. The eight earlier migrations are replaced by one baseline migration, and **an existing database cannot be upgraded in place: the new version needs a new, empty database.** The in-memory store is unaffected.

### Breaking changes

| Change | Before | Replacement |
|---|---|---|
| Database | Schema built by the eight earlier migrations | A new, empty database; the baseline `UuidBaseline1794096000000` creates the schema. Runs, steps, state, documents, artifacts and conversation memory of the old database are not carried over |
| `migrateStore(dataSource)` on an old database | Applied the pending migrations | Refuses it before changing anything, with an error (code `store_legacy_schema`) that names this guide |
| `chamvi start --check` on an old database | Exit 0 (with the default `CHAMVI_MIGRATE=true`) | Exit 1 with the same message, whatever `CHAMVI_MIGRATE` says |
| Run and artifact ids | Run ids from `randomUUID()`; artifact ids `<runId>.0000` for attachments and `<runId>.k.<hash>` for keyed puts | UUID v7 for both. Treat ids as opaque strings. A keyed `artifacts.put({ key })` keeps its stored id when a later put replaces it |
| `keyedArtifactId()` (`@chamvi/core`) | Exported | Removed. `IArtifactRepository.insert(artifact, data, key?)` and `save(artifact, data, key)` take a private key; `findOneByKey(runId, key)` looks one up. A custom store must implement them (`describeRepositoryContract()` checks it) |
| Malformed ids in the HTTP API | n/a | A run or artifact id that is not a UUID is a 404 on the database store, as for any unknown id |

### Steps

1. Create a new, empty Postgres database (a new database, not a new schema in the old one, keeps the rollback below simple).
2. Drain the old deployment: stop ingress and run-job CronJobs, and let in-flight runs settle or answer their approvals. Nothing from the old database is read by the new version.
3. Point `DATABASE_URL` at the new database and deploy the new version. With the default `CHAMVI_MIGRATE=true` the first start creates the schema; with `CHAMVI_MIGRATE=false`, run `chamvi migrate` first.
4. Check before switching traffic: `chamvi start --check` with the new `DATABASE_URL` exits 0. Pointed at the old database it exits 1 and prints the message that names this guide.

The old database is left untouched. To roll back, redeploy the previous chamvi version with the old `DATABASE_URL`; the old schema and its data are intact. Keep it for as long as you may need that, and drop it when you do not.

The check that refuses an old database covers `migrateStore()` (so a default start and `chamvi migrate`), `chamvi start --check` and a start with `CHAMVI_MIGRATE=false`. Each exits 1 with the same message.

The check is temporary: the chamvi version after this one removes it, and an old database then fails on `CREATE TABLE` with a raw Postgres error instead.

## Upgrading to 0.7

### Breaking changes

[Simple agents](/guide/dispatch#simple-agents) (`defineSimpleAgent({ run })`, no model) and [generated dispatch tools](/guide/dispatch#generated-dispatch-tools) arrived ([#131](https://github.com/chamvi/chamvi/issues/131)).

| Change | Before (0.6) | Replacement (0.7) |
|---|---|---|
| `defineAgent()` | Builds every agent | Removed: `defineModelAgent()` takes the same input and runs the same checks (rename the call). A definition with `run` is refused there: build it with `defineSimpleAgent()` |
| `Agent` | `{ name, definition }` | A union of `ModelAgent` and `SimpleAgent`, told apart by `agent.kind` (`'model'` or `'simple'`), which narrows `agent.definition` as well. An agent built by hand needs `kind`: the engine refuses one whose `kind` is neither or disagrees with its definition. A folder or package agent built by an older core (no `kind`) loads as a model agent |
| `AgentDefinition` | One shape, `instructions` required | A union of `ModelAgentDefinition` and `SimpleAgentDefinition`: on the union, `agent.definition.instructions`, `model`, `output`, `conversation` and `skills` read as possibly `undefined`, `run` and `description` are new. Check `agent.kind === 'model'` before reading the model fields |
| Hand-written dispatch tools | A `defineTool()` around `dispatch()` that only forwarded the call | Still works; `dispatchTools({ roles })` generates the same tool from the role, with `agent.on({ idempotencyKey, concurrencyKey, address, description })` deciding what the tool did. The hooks see only the payload: keep the hand-written tool when it derives a key or the address from anything else (the trigger's `receivedAt`, the run), or put that value into the payload |

## Upgrading to 0.6

### Breaking changes

Hand-offs became [dispatch](/guide/dispatch): a tool starts runs of its own or another agent and may wait for them ([#129](https://github.com/chamvi/chamvi/issues/129), [#76](https://github.com/chamvi/chamvi/issues/76)). No alias is left for the hand-off names.

| Change | Before (0.5) | Replacement (0.6) |
|---|---|---|
| Subscription | `handoff.on(opts?)`, at most one per agent, subscription id `handoff` | `agent.on(opts?)`, one per role; the role is the subscription id, default `'default'` (`DEFAULT_DISPATCH_ROLE`). `agent.on({ role: 'handoff' })` keeps the old id (stored runs carry it as `trigger.trigger`) |
| Starting a run | `startHandoff(ctx, input)` | `dispatch(ctx, input)`; `input.role` picks the role. `dispatchTo(ctx, { agent, ... })` reaches another agent |
| Types | `HandoffInput`, `HandoffResult`, `HandoffSubscriber`, `HandoffSubscriptionOptions` | `DispatchInput`, `DispatchResult`, `AgentSubscriber`, `AgentSubscriptionOptions` |
| Constants | `HANDOFF_SUBSCRIPTION_ID`, `MAX_HANDOFF_DEPTH` (1), `DEFAULT_MAX_HANDOFFS_PER_RUN` (100) | `DEFAULT_DISPATCH_ROLE`, `DEFAULT_DISPATCH_MAX_DEPTH` (1, per role through `agent.on({ maxDepth })`, at most `DISPATCH_DEPTH_MAX` 8), `DEFAULT_MAX_DISPATCHES_PER_RUN` (100) |
| Per-run limit | `maxPerRun` counted every hand-off of the run (`handoff-count:<runId>`) | Counted per target agent and role (`dispatch-count:<runId>:<agent>:<role>`) |
| Keys | Effect `<runId>:handoff:<hash>`, idempotency claim `handoff:<key>` | `<runId>:dispatch:<hash>` (the hash also covers the agent and the role), `dispatch:<role>:<key>` |
| Lineage | `trigger.parent: { kind: 'handoff', runId, agent, depth }` | `{ kind: 'dispatch', runId, agent, role, depth }`, plus `run.parentRunId` and `run.subtreeUsage`. The migration rewrites stored hand-off parents to role `handoff` |
| Wait point | `run.waiting` (`WaitPoint`) was always an approval | A union on `kind`: `ApprovalWaitPoint` (`kind: 'approval'`, plus the generic `id`, equal to `approvalId`) or `DispatchWaitPoint` (`kind: 'dispatch'`, `runIds`). Narrow on `kind === 'approval'` before reading `title`, `approvalId` or `options` |
| MCP `run_<agent>` result | `waiting: { toolName, title, ... }` | `waiting.kind` `'approval'` (with `runId` and `agent`: the run to answer, possibly a descendant) or `'dispatch'` (`get_run` only) |
| Custom repositories | | `Run.parentRunId` (set by `insert` from `trigger.parent.runId`, a missing parent throws `RunNotFoundError`), `Run.subtreeUsage`, `RunFindOptions.ids`, `parentRunId`, `parentRunIds`, `hasParent` and `waitKind`, `RunUpdateOptions.expectWaitId` and `keepUpdatedAt`, both wait point kinds read back through `normalizeWaitPoint()`. `describeRepositoryContract()` checks each ([Lineage and wait points](/repositories/writing-a-repository#lineage-and-wait-points)) |

Drain hand-off trees before upgrading: a parent that replays a `startHandoff()` call under the new effect keys can start a second child, and a stored child of subscription id `handoff` matches no role unless the agent declares `agent.on({ role: 'handoff' })`.

### Database migration

0.6 ships `1792800000000-run-lineage.ts` (`RunLineage1792800000000`): `chamvi_runs.parent_run_id` (indexed, a self foreign key, `NOT VALID` so legacy children of a deleted parent stay) and `subtree_usage`, the `parent_run_id` backfill from `trigger.parent.runId`, the hand-off parent rewrite, and the generic `id` on every pending approval wait point, so an approval that waits across the upgrade can still be answered. See [Migrations](/repositories/database#migrations).

## Upgrading to 0.5

### Breaking changes

| Change | Before (0.4) | Replacement (0.5) |
|---|---|---|
| Node | `>=24.3.0` | `>=26.0.0` |
| Base image | `ghcr.io/chamvi/node:24` | `ghcr.io/chamvi/node:26`; build stages move to `node:26-trixie-slim`. The `24` tag stops receiving rebuilds |
| `chamvi build` target | `node24` | `node26` |
| Sandbox image `ghcr.io/chamvi/sandbox-node:24` | Rebuilt as a deprecated workspace image | Not built anymore; use the default `ghcr.io/chamvi/sandbox-dev` (`mise use -g node@26`) or your own image |

## Upgrading to 0.4

### Breaking changes

| Change | Before (0.3) | Replacement (0.4) |
|---|---|---|
| Store package renamed | `@chamvi/store-typeorm` | `@chamvi/store-db`; replace the dependency and every import. Tables and migration history keep their names |
| Store aggregate | `new MemoryStore(options)`, `new TypeormStore(options)`, facade methods such as `engine.store.getRun(id)` | `createMemoryStore(options)`, `createDatabaseStore(options)`, role methods such as `engine.store.runs.findOne(id)`; every method is mapped on [Stores and repositories](/repositories/#updating-existing-callers) |
| Repository interfaces | `IRunStore`, `IStepStore`, `ICheckpointStore`, `IIdempotencyStore`, `ILockStore`, `IEffectStore`, `IStateStore`, `IArtifactStore`, `IAgentRevisionStore`; `IStore` extended them | `IRunRepository`, `IStepRepository`, `ICheckpointRepository`, `IIdempotencyRepository`, `ILockRepository`, `IEffectRepository`, `IStateRepository`, `IArtifactRepository`, `IAgentRevisionRepository`; `IStore` holds one of each (`store.runs`, `store.steps`, ...) |
| Database store options | `TypeormStoreOptions` | `DatabaseStoreOptions`; `createDatabaseStore()` returns `DatabaseStore` |
| Purging expired rows | `store.purgeExpired(now?)` resolving `PurgeResult` | `store.idempotency.purgeExpired(now?)` and `store.locks.purgeExpired(now?)`, each resolving the number of deleted rows (`@chamvi/app` schedules both) |
| Agent instructions | `AgentDefinition.instructions: string` | `instructions: AgentInstructions` (a string or an array of system, user and assistant messages). A string still works; code that reads `agent.definition.instructions` as a string must handle the array form |
| Channel context | `ChannelContext.engine: Engine`; no conversation intake | `ChannelContext.engine: IEngine` (type against the interface, not the class); `ChannelContext.dispatchConversation(envelope, target)` is required: a hand-built context needs one, get both from `engine.channelContext(channel)` |
| Engine typing in apps | `AppTokens.ENGINE: Engine`, `ILifecycleHook.engineCreated(engine: Engine)` | Both typed `IEngine`. Cast to `Engine` only where you need a member outside `IEngine` |
| `Engine.stop()` | Stopped polling and the channels | Also halts the queue and waits for an in-flight `start()` and `prepare()` (skill preparation). A skill provider that ignores cancellation holds `stop()` until it settles |
| Cron schedule lock | `createStoreScheduleLock(store, owner)` | `createRepositoryScheduleLock(store.locks, owner)` (`@chamvi/channel-cron`, takes an `ILockRepository`) |
| Engine concurrency option | `new Engine({ maxConcurrentRuns })` | `new Engine({ concurrencyMaxRuns })`; the variable `CHAMVI_MAX_CONCURRENT_RUNS` is unchanged |
| App config concurrency | `readConfig(env).engine.maxConcurrentRuns` | `readConfig(env).engine.concurrencyMaxRuns` (`AppConfig`); the variable `CHAMVI_MAX_CONCURRENT_RUNS` is unchanged |
| Run references (memory, database and custom stores) | `steps.insert`, `checkpoints.save` and `conversations.beginTurn` accepted any run id on the memory store; Postgres failed with a raw foreign key error | All three throw `RunNotFoundError` for a run the store does not hold and write nothing, on memory and Postgres alike. `describeRepositoryContract()` checks it, so a custom store must implement it to pass ([Run references](/repositories/writing-a-repository#run-references)). Insert the run first; a test that spreads `{ ...createMemoryStore(), runs: custom }` builds `steps`/`checkpoints`/`conversations` with `hasRun` over `custom` (see [Memory repositories](/repositories/memory)) |
| Node | `>=22` | `>=24.3.0` |
| Git credential mode (`@chamvi/sandbox`) | `credentialMode` (`CredentialMode`) and `CHAMVI_GIT_CREDENTIAL_MODE` chose tools-only or workspace-installed credentials | Removed; a set variable or option is refused with `InvalidAgentDefinitionError` naming them: unset the variable and drop the option. Workspace-installed credentials are the only mode; `PushPolicy` binds `git_push` only, so restrict writes through token scope and branch protection |
| Image requirements (`@chamvi/sandbox`) | `IMAGE_REQUIREMENTS` `['sh', 'git', 'timeout']` | `['sh', 'git', 'timeout', 'head', 'base64', 'tr']`: the image probe also refuses an image without `/bin/sh` or without `head`, `base64` and `tr` in `/usr/bin` or `/bin` (coreutils or busybox provide them; `ghcr.io/chamvi/sandbox-dev` has them) |
| `write_file` over a file holding an issued token | Wrote a literal `[redacted]` over the token | Each `[redacted]` the model read is restored in order; content whose markers do not line up, or with `[redacted]` over an existing file that cannot be read as text, is refused (`ValidationError`) and nothing is written |
| Event-started runs (`github`, `webhook`) | A delivery started a run whose write tools ran at once, so an event-driven auto-merge or auto-reply flow acted without a human | The `github` and `webhook` channels are untrusted ingress: their runs are tainted from the first step, and `github_merge_pull_request`, `github_create_pull_request`, `github_create_issue`, `github_propose_change`, `git_push` and a `github_create_comment` on another issue than the source one wait for an approval (the source issue gets a generic "An outbound operation requires review" comment, never the arguments). Answer it in the approval inbox or through `POST /runs/:id/approve` (MCP `approve_run`). An agent whose own policy already decides opts out per tool: `trust: { tools: { github_merge_pull_request: { guardWhenTainted: false } } }` ([Approvals in event-started runs](/deployment/github-app#approvals-in-event-started-runs)) |
| Run taint | No taint column | Database migration `ConversationsRunTaint1792713600000` adds `chamvi_runs.taint` and backfills unfinished runs; it needs downtime (below). Custom stores must persist `Run.taint` ([Persist run taint](/repositories/writing-a-repository#persist-run-taint)) |

### New in 0.4

Run taint, the outbound gates and repository guidance are new, so 0.3 apps have nothing to migrate beyond the rows above. In their final 0.4 form:

- The coding read and shell tools (`read_file`, `grep`, `glob`, `list_files`, `git_diff`, `bash`, `bash_output`) taint the run in every workspace, repo-less ones included; opt a tool out with `trust.tools: { bash: { taint: false } }` only where its output is trusted.
- `git_push` with `push: { mode: 'approve' }` asks once in a tainted run: the outbound gate's private approval carries the push title and commit log (`ToolTrust.approvalDetail`, `outboundApproved(ctx)`) and is answered in the approval inbox or API; `push.channel` is not asked then. A push the policy refuses is denied before the gate asks.
- A failing repository guidance collection gives `instructions: null` plus `instructionsError` in `create_workspace` and `read_file`; `read_file` in a repo-less workspace omits `instructions`.
- `ghcr.io/chamvi/sandbox-dev` ships the GitHub CLI (`gh`, the current release at build time); pin the image digest for a fixed version.

Conversation memory is opt-in and new, so 0.3 apps have nothing to migrate: storage is the engine's `conversationService` (both built-in stores carry a conversation repository), policy is `createApp({ conversations: { authorize } })` or `EngineOptions.conversations`. See [Conversations](/guide/conversations) for the setup.

### Database migration

0.4 ships one new migration, `1792713600000-conversations-run-taint.ts` (`ConversationsRunTaint1792713600000`): the conversation tables, the run and checkpoint conversation bindings, the foreign keys (the two on legacy steps and checkpoints `NOT VALID`, see [Validating the legacy constraints](/repositories/database#validating-the-legacy-constraints)), indexes on the new foreign key columns, `chamvi_runs.taint` and the backfill that taints every `queued`, `running`, `waiting` and `interrupted` run with `{ at: <migration time>, source: 'migration:legacy-run' }`.

::: warning Development databases
A database that ran a pre-release build of this branch recorded `Conversations1792713600000` (and maybe `RunTaint1792800000000`). Migrating it fails with "relation already exists". Recreate the disposable database; never reset a production one for this.
:::

### Upgrade procedure (downtime)

Old and new runtimes must never share the store, not even during a rolling update. An old approval poller can post a tainted run's private approval body to its source channel, and an old worker or job can create or checkpoint untainted runs after the one-time backfill. Claims and locks do not prevent this.

1. **Suspend the run-job CronJobs** (`kubectl patch cronjob <name> -p '{"spec":{"suspend":true}}'`, or `suspend: true` on each `cronJobs[]` entry of the `agent-app` chart) and wait for running job pods to finish. A `Recreate` Deployment does not cover CronJobs, and `CHAMVI_MIGRATE` defaults to `true` in job mode too: a 0.3 job pod started during the upgrade writes runs the backfill never sees.
2. **Stop every old process**: scale the Deployment to 0 (ingress, workers, approval pollers) and wait for the pods to exit. Draining executions alone is not enough.
3. **Migrate in a maintenance window**: run `chamvi migrate` once with the new image (`DATABASE_URL` set). Alternatively start the new Deployment with the default `CHAMVI_MIGRATE=true`; with `CHAMVI_MIGRATE=false` everywhere, `chamvi start --check` refuses the unmigrated database.
4. **Start only 0.4 binaries**: scale the Deployment up, then resume the CronJobs with the new image. Resumed legacy runs are tainted, so their guarded tools ask for approval.

See [Multiple replicas](/deployment/replicas#upgrading-to-untrusted-content-gates) for why each step matters.

### Release-time owner actions

These are not code changes; the maintainer does them when 0.4.0 is published:

- After the first `@chamvi/store-db` publish: `npm deprecate @chamvi/store-typeorm "renamed to @chamvi/store-db"`.
- Check that the `NPM_TOKEN` used by `release.yml` (monoship) may create new packages: `@chamvi/skills` and `@chamvi/store-db` publish for the first time.
- `@chamvi/skills` depends on a Git URL (`git+https://github.com/tada5hi/skills-cli.git#<sha>`): registry-only proxies and the agent-template lockfile check refuse it. Publish or vendor the fork before relying on it ([#97](https://github.com/chamvi/chamvi/issues/97)).
- Downstream: bump [chamvi/helm](https://github.com/chamvi/helm) and [chamvi/agent-template](https://github.com/chamvi/agent-template) from `^0.3.x` to `^0.4.0` after publishing (Node 24, the CronJob suspend note in the chart README, no `CHAMVI_GIT_CREDENTIAL_MODE`).
