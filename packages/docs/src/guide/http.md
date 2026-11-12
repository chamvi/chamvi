# HTTP API & MCP

[`@chamvi/http`](/reference/http) turns a chamvi app into one [routup](https://github.com/routup/routup) `App`: humans start and follow runs over REST and server-sent events, channels take deliveries at `/channels/<name>` (webhooks with bearer tokens, signed GitHub deliveries), and agents (OpenClaw, Claude, any MCP client) start runs as MCP tools. It also serves `/healthz`, `/readyz` and `/metrics`, and ships the graceful shutdown helper.

```bash
npm install @chamvi/http @chamvi/core --save
```

<<< @/snippets/http.ts#app

Every HTTP or MCP start ends in `engine.dispatch()`; nothing runs synchronously in a request. Errors are always JSON `{ status, code, message, issues? }`, unmatched routes included; a 5xx body says `Internal Server Error` and the cause goes to `onError`. An issue carries the `received` value only when it is small (at most 256 characters as JSON), so a 400 for an oversized list, a long string or a large file never echoes the body back.

## Channels

The package ships three channels; register them on the engine (`new Engine({ channels })`) like any other:

| Channel | Subscription | Served at | Envelope |
|---|---|---|---|
| `httpChannel()`, `mcpChannel()` | `http.on({ schema? })` (id `http`, at most one per agent) | `POST /agents/:name/runs`, MCP `run_<name>` | `trigger: 'http'`, channel `http` (REST, UI) or `mcp` |
| `webhookChannel({ auth, name?, bodyLimit? })` | `webhook.on(path, { schema?, idempotencyKey?, concurrencyKey? })` (id `webhook:<path>`) | `POST /channels/webhook/<agent><path>` | `trigger: 'webhook:<path>'`, channel `webhook` |

An agent without `http.on()` answers 404 on REST and gets no MCP tool; the engine refuses the subscription unless it holds `httpChannel()`. The subscription's `schema` validates the payload; a failure answers 400 with `issues` and dispatches nothing. A webhook is served on its own path under the agent: `webhook.on('/issues')` on agent `intake` is `POST /channels/webhook/intake/issues` (a path of `/` is `/channels/webhook/intake`); `GET /agents` lists each `hook` URL. A delivery needs a principal of the channel's `auth` (one authenticator or a chain, required, since the app never authenticates channel routes) holding `chamvi_agent_run` for the agent, checked before the body is read; webhook runs carry no invoker.

`createHttpApp({ channels })` mounts `POST /channels/<name>` and everything below it for exactly the listed channels: each needs an `in` and must be the object the engine holds under its name (`InvalidAgentDefinitionError` otherwise), and any other `/channels/...` path is 404. The mount is rate-limited but never authenticated by `auth`: each channel checks its own credentials. `in({ request, subpath }, ctx)` gets the raw request, its body unread (`readRequestBody(request, { limit })` from `@chamvi/http` reads it; above the limit it answers 413 and closes the connection), and the raw subpath (`''` for the bare path, else starting with `/`, still percent-encoded). Its `Response` is sent as is; a thrown error renders like any route's error. See [Channels & the Envelope](/guide/channels).

## Routes

| Method and path | Permission | Answer |
|---|---|---|
| `POST /agents/:name/runs` | `chamvi_agent_run` | `202 { runId, deduplicated }`; body `{ payload?, idempotencyKey?, address?, attachments? }` (or an `Idempotency-Key` header); runs carry channel `http` |
| `GET /runs` | the read rule of each listed run's agent ([below](#permissions)) | `200 { data, meta: { total, limit, offset } }` |
| `GET /runs/:id` | `chamvi_agent_read` for the run's agent, or for a public agent also `chamvi_run_read` or `chamvi_agent_run` ([private agents](#private-agents)) | The run with its `steps` |
| `GET /runs/:id/stream` | as `GET /runs/:id` | SSE |
| `GET /runs/:id/artifacts` | as `GET /runs/:id` | `200 { data: Artifact[] }` |
| `GET /runs/:id/artifacts/:artifactId` | as `GET /runs/:id` | The bytes, as a download |
| `POST /runs/:id/cancel` | `chamvi_run_cancel` | `202 { runId, status }` |
| `POST /runs/:id/approve` | `chamvi_agent_approve` for the run's agent | `202 { runId, status: 'queued' }`; body `{ approvalId, approved, reason?, selected? }`; answers the run's current wait point without a token (409 for another `approvalId`, an expired wait point, a run waiting on dispatched runs or a run not waiting; 400 for a `selected` that does not fit the wait point's [options](/guide/approvals#offering-options)) |
| `POST /channels/<name>[/...]` | the channel's own | Whatever the channel's `in` answers; only for the channels in `channels` |
| `GET /agents`, `GET /schedules` | `chamvi_run_read` (the agents it reaches) | `{ data, issues }`: agent summaries and the [agent folders](/guide/agent-folders) that failed to load (`{ agent, message, at }`); agent summaries list their `kind` (`model`, or `simple` for a [simple agent](/guide/dispatch#simple-agents)) and subscriptions `{ channel, id, hook? }`; cron subscriptions with their channel and next fire time |
| `GET /agents/:name/state/kv` | `chamvi_state_read` | `200 { data: Array<{ key, value }> }` in key code-point order; `page[limit]` (default 50, at most 100), `page[offset]` |
| `GET`, `PATCH /agents/:name/state/kv/:key` | `chamvi_state_read`, `chamvi_state_write` | `{ key, value }` |
| `GET /agents/:name/state/collections/:collection` | `chamvi_state_read` | Documents (`{ id, ...fields }`, or `{ id, doc }` for a non-object); top-level equality filters (`filter[issue]=42` matches a number, `filter[issue]="42"` the string; `filter[id]` is 400, `id` being the store id), `page[limit]` (no offset) |
| `GET /connections` | `chamvi_connection_read` or `chamvi_connection_write`, per connection | `200 { data: [{ name, type, status }] }`: the [connections](/deployment/whatsapp#session-store) the app's modules expose that the caller may read, never their widgets |
| `GET /connections/:name` | `chamvi_connection_read` or `chamvi_connection_write` | `{ name, type, status, widgets?, canReset? }`; `widgets` (the pairing QR) and `canReset` (the connection offers a reset) only with write |
| `GET /connections/:name/events` | `chamvi_connection_write` | SSE: `status` (`{ status }`) and `widgets` (`{ widgets }`) at open and on every change, `ping` to keep proxies open; the run stream's limits |
| `POST /connections/:name/reset` | `chamvi_connection_write` | `202 { name, type, status }` once the reset started (the live stream carries its outcome, a failure goes to `onError`); clears the connection's session and reconnects (404 when it has no reset, 409 while it is `held_elsewhere`) |
| `GET /me` | authenticated | `200 { id, kind, name?, bindings, identity? }`: the caller itself, with its own permission bindings, for a client to evaluate with `@chamvi/access` |
| `/mcp` | authenticated | MCP endpoint |
| `GET /healthz`, `/readyz`, `/metrics` | none | Liveness, readiness, Prometheus |

`GET /runs` takes rapiq's URL syntax: `filter[agent]=triage`, `filter[status]=queued,running`, `filter[parent]=<run id>` (the runs that run [dispatched](/guide/dispatch#lineage), one id; an agent-scoped reader adds `filter[agent]`), `filter[waiting]=approval` or `filter[waiting]=dispatch` (the runs whose wait point is of that kind, so an inbox pages approvals only), `page[limit]` (default 50, at most 100), `page[offset]`, `sort=createdAt` (oldest first, the default) or `sort=-createdAt` (newest first). Bodies are JSON of at most `bodyLimit` bytes (default 1 MiB). A protected route checks the bearer token before it reads the body. Runs leave the API without their internal `claim`, and the run's invoker and a `wait` step's approver without their `bindings` (see [Invoker](#invoker)).

## Files

`POST /agents/:name/runs` takes `attachments`: at most 16 objects `{ mediaType, filename?, data }`, `mediaType` of the form `type/subtype` (no parameters), `filename` 1 to 255 characters, `data` strict base64 (padded, standard alphabet, no whitespace). A bad entry answers 400 `validation_error` with the path of the field (`['attachments', 0, 'data']`) and dispatches nothing. Base64 travels in the JSON body, so `bodyLimit` (default 1 MiB) bounds the files too; raise it for larger ones. The files become [attachments](/guide/channels#attachments) of the run.

<<< @/snippets/http.ts#attachments

`GET /runs/:id/artifacts` lists the run's artifacts (attachments and files its tools stored, see [Files](/guide/agents#files)) as metadata. `GET /runs/:id/artifacts/:artifactId` answers the bytes with the stored media type as `content-type`, `content-length`, `content-disposition: attachment` (with `filename` and an RFC 5987 `filename*` when the artifact has a filename), `x-content-type-options: nosniff` and `cache-control: private, no-store`, so a stored HTML or SVG file is downloaded, never rendered in the API's origin. Both follow the run read rule (404 for an unknown run before 403); an unknown artifact, or one of another run, is 404 `artifact_not_found`.

## Following a run

`GET /runs/:id/stream` sends `run.updated` with the current run, then each step as `step.appended` (`id` is the step index, so `Last-Event-ID` resumes), then live events; it ends once the run is `completed`, `failed` or `cancelled`. The engine's events only cover runs executing in this process, so the stream also polls the store every `stream.pollMs` (2 s) and sees a run that [another replica](/guide/concurrency) executes; an idle poll sends `ping`. A client that disconnects unsubscribes at once, and the app ends open streams on shutdown.

While the model writes, the stream also sends `delta` events, `data: { step, kind, text }` with `kind` `text` or `reasoning` (the engine's [`run.delta`](/guide/execution#streaming)). `step` is the checkpoint step index of the `llm` step being generated (one per model call), not the `step.appended` `id`, which also counts `tool` and `wait` rows. They carry no `id`, so `Last-Event-ID` stays a step index, and they are live only: a reconnect or a late subscriber gets the stored `llm` step instead, never the deltas it missed. Only the replica executing the run has them; a stream served by another replica sees the steps through its store poll and no deltas.

To resume, send `Last-Event-ID` with the last step id you saw, or the query `?after=<step index>` (a non-negative integer, else 400). If both are present, a valid `Last-Event-ID` wins: it is the client's progress on a reconnect, while the URL stays the one of the first connect.

The stream takes bearer tokens only, and browser `EventSource` cannot send an `Authorization` header. In a browser, read the stream with a fetch-based SSE reader (`fetch` plus an SSE parser over the response body) that sends `Authorization` and, on reconnect, `Last-Event-ID` (or `?after=`).

An app holds at most `stream.maxOpen` (1000) open streams plus waiting MCP `run_<agent>` calls, on one counter. Over the cap a stream answers 503 with `Retry-After: 5`; retry after that many seconds.

## Authentication and permissions

`auth` takes one authenticator or a chain; the first principal wins. A resolved principal needs a non-empty `id` and `kind`, a `bindings` array of [permission bindings](/guide/permissions) and, when given, an `identity` of type `user` or `client` with a non-empty `id`; anything else is a server misconfiguration (500, reported to `onError`) and ends the chain.

<<< @/snippets/http.ts#auth

- `staticTokens({ tokens: [{ value, id, permissions }] })`: bearer tokens (`value`, at least 16 characters, each given once), each with a non-empty `id` (the principal and run invoker id; several tokens may share one, e.g. while rotating). `permissions` is `'*'` (every `chamvi_*` permission, unrestricted) or an array of bindings; anything else, an old string such as `agent:triage:run` included, throws `InvalidAgentDefinitionError`. Put it before `authup()` and `oidc()`: `authup()` in remote mode introspects every bearer that is not a JWT, so a static token placed after it is sent to the authup server.
- `authup({ verifier, catalog, realm })`: authup tokens through `@authup/server-adapter-web`. Only tokens with the `global` scope and a user or client subject grant their permissions; others authenticate and get 403. Grants need remote verification (introspection); a cached result lives until the token's `exp`. Each grant keeps its authup policies, resolved against the catalog `catalog()` reads (`GET /authorization`), and counts only when its realm reach covers `realm()`, the realm of chamvi's own authup client. A catalog that cannot be read grants nothing and goes to `onError`. See [Permissions and authup](/guide/permissions).
- `oidc()`: any OIDC issuer through [vouchly](https://github.com/tada5hi/vouchly). Every issuer needs an `audience`, and `principal` is required: a public issuer such as GitHub Actions lets anyone mint a token for your audience, so the mapper decides which claims get which grants. A mapper result without a non-empty `id` and `kind` and a `bindings` array of permission bindings is a server error (500, reported to `onError`), not a client one.

Permission names are static (`chamvi_agent_run`, `chamvi_run_read`, ...); a policy on a grant narrows it to some resources, e.g. one agent. The names, their resource attributes and the authup setup are in [Permissions and authup](/guide/permissions).

### Permissions

A route on one resource checks with that resource's attributes. An agent route checks before it answers 404, so a restricted principal cannot probe agent names; an agent the app does not hold counts as `private: true`. A run route loads the run first: an unknown run answers 404, a run of a private agent the principal may not read answers the same 404, and any other run it may not read answers 403. A collection route (`GET /agents`, `GET /schedules`, `GET /runs` and `GET /connections`) first asks whether the principal may do it to some resource, then checks each row with its own attributes. A client that may start a public agent's runs (`chamvi_agent_run`) or holds `chamvi_agent_read` for it can follow them without `chamvi_run_read`. `GET /runs` without `filter[agent]` lists every run only for an unrestricted `chamvi_agent_read` (or every public agent's run for an unrestricted `chamvi_run_read`), otherwise the runs of the registered agents the principal may read.

### Private agents

An agent defined with `private: true` keeps its runs and state from everyone without `chamvi_agent_read` for it (`chamvi_run_read`, `chamvi_agent_run`, `chamvi_state_read` and `chamvi_state_write` do not cover it). Such a principal gets 404 for the agent's runs (`GET /runs/:id`, `/stream`, `/artifacts*`, MCP `get_run`), as for an unknown run, so run ids cannot be probed. `GET /runs` and MCP `list_runs` leave the agent's runs out (`filter[agent]=<name>` is 403), its state routes answer 403, and MCP `run_<agent>` returns only `{ runId, status, deduplicated }`. A run whose agent the app no longer registers is treated as private. `chamvi_agent_run` still starts runs, and `chamvi_agent_approve` still answers approvals. `GET /agents` lists each agent's `private` flag, every run (REST, SSE, MCP `get_run`) carries its agent's as `agentPrivate` (`true` for an agent the app no longer registers), and a policy can match it (`{ "private": false }`).

`POST /runs/:id/approve` needs the approve permission for the run's agent (no read permission); it loads the run (404), checks the permission (403) and only then reads the body, and passes the `approvalId` it was shown, so a stale or concurrent answer is a 409 rather than an answer to a newer call.

## Invoker

`POST /agents/:name/runs` and MCP `run_<agent>` record the authenticated principal as the run's invoker (`run.trigger.invoker`): its `id`, `kind`, `bindings`, `identity` (when the authenticator set one) and a `name` from the `name` or `preferred_username` claim (never `email`, since every reader of the run sees the name; static tokens have no name). An agent's [`toolPolicy`](/guide/tools#restricting-tools-per-invoker) and tool code read it. `POST /runs/:id/approve` and MCP `approve_run` record the principal that answered as the `wait` step's `output.approver`. Webhook and GitHub runs have no invoker, and neither ever comes from a request body.

The invoker is a snapshot: a run keeps the grants it was started with, even when a grant is revoked while it waits on an approval; their policies are evaluated again at each check, so a `time` policy uses the engine clock of that moment. Responses (REST, SSE, MCP) carry the invoker and the approver without their `bindings`, so a `chamvi_run_read` holder never learns another principal's grants.

## MCP

`/mcp` is a streamable HTTP endpoint (MCP TypeScript SDK v2; 2025-era clients are served statelessly), authenticated like REST. Each client sees the tools its principal may use:

- `run_<agent>` for each agent with `http.on()` it may run (runs carry channel `mcp`): `{ payload?, idempotencyKey?, address?, waitSeconds? }`. With `waitSeconds` (capped by `mcp.maxWaitSeconds`, default 60) it waits for `completed`, `failed`, `cancelled` or `waiting` and returns the output, the error or the pending approval. A run that waits on runs it [dispatched](/guide/dispatch) keeps the call waiting; it returns once the run settles or the run or one of its descendants waits on an approval (`waiting.kind` `'approval'`, `waiting.runId` the run to answer with `approve_run`). `get_run` of a run waiting on its children shows `waiting: { kind: 'dispatch', toolName, runIds, expiresAt }`. A wait counts against `stream.maxOpen`: over the cap the call does not wait and answers at once with `{ runId, status, deduplicated }`, as with `waitSeconds: 0`; the run is already dispatched and goes on.
- `get_run`, `list_runs`: the REST read rule applies.
- `approve_run`: `{ runId, approvalId, approved, reason?, selected? }` (the `approvalId` of the run's `waiting`, from `get_run`; `selected` the chosen ids of `waiting.options`), with the approve permission; a run waiting on dispatched runs is refused (`invalid_run_state`). A `run_<agent>` result's `waiting` carries `options` and `multiple` too.

An MCP start dedupes its `idempotencyKey` under `<agent>:mcp:<kind>:<id>`, a REST start under `<agent>:http:<kind>:<id>` (the principal's `kind` and `id`, URI-encoded): one key used over both transports, or by two principals, creates two runs. A client registers the endpoint like any HTTP MCP server:

<<< @/snippets/http.ts#mcp

This is the "MCP in" half of the [OpenClaw](/deployment/openclaw) integration.

## Extra routes

`routes` adds routes that other packages provide, served under `basePath` beside the built-in ones. A route is a static path with a method and a fetch-style handler: it gets the request (URL, method, headers and signal, without the body) and a `readBody()` that returns the raw bytes (the app's `bodyLimit`, 413 and 415 apply; repeated calls return the same bytes), and answers `{ status, body? }` (an object, array, number or boolean as JSON, a string as `text/plain`, no `body` or `null` as an empty body). Extra routes are not authenticated by `auth` unless the handler calls `request.authorize(permission?, attributes?)`, which runs `auth` once per request and answers 401 or 403 like the built-in routes; any permission name works, an app's own included, checked for the resource in `attributes` (without them: for some resource). Intake of runs belongs in a [channel](/guide/channels) (the `/channels/<name>` mount), not in an extra route. Thrown errors render like those of every other route. `rateLimit: false` takes a route out of the rate limit, for senders that never retry a refused request. Paths match case-insensitively, like routup's routing: a route may not differ from a built-in segment or another route only by case.

A route can also answer headers and bytes: `headers` is set on the response (a `content-type` there wins over the body's default) and a `Uint8Array` body is sent as is (`application/octet-stream` unless `headers` names a type), with the CORS and rate limit headers kept. `prefix: true` makes the route serve its `path` and everything below `path/` for its method (a static file server, such as a dashboard's assets): the handler reads the rest as `request.subpath` (`''` for the path itself, else the raw, still percent-encoded rest with its case, never the query), and metrics label it `<path>/*`. A route of the same method at or under a prefix route, or a prefix route at or above the metrics path, is refused at construction. The route context carries the app's `basePath` to build links with.

`@chamvi/ui` is such a route: `routes: uiRoutes()` serves the [dashboard](/guide/ui) at `/ui`.

## Operations

- `/metrics` is unauthenticated: keep it off the public ingress (a NetworkPolicy, or an internal listener) or set `metrics: false`. Each app has its own `prom-client` registry, labelled by route template (`/runs/:id`, `/runs/:id/artifacts/:artifactId`; unknown paths share `/_unmatched`); SSE streams and rate-limited requests are not timed.
- The rate limit (300 requests per minute per client, health, metrics and CORS preflights excluded) keys on the socket address. Behind a reverse proxy set `trustProxy`, or every client shares the proxy's bucket; `X-Forwarded-For` is never trusted otherwise.
- CORS is off unless `cors` is given.
- `/readyz` fails while shutting down, while the engine drains and when the store does not answer within `readyTimeoutMs` (2 s).

## Shutdown

<<< @/snippets/http.ts#shutdown

`createShutdown()` fails readiness, waits `readinessDelayMs` for load balancers, runs the `onShutdown` callbacks (the app ends its SSE streams and `run_<agent>` waits, which answer with the run id, and closes MCP there; new streams and MCP requests then answer 503), stops accepting connections, drains the engine (which stops every channel first, then waits `drainTimeoutMs`, 30 s, for the runs) and waits at most `closeTimeoutMs` (5 s) for open connections before closing them. Every call returns the same promise. Pass `gracefulShutdown: false` to `serve()` so srvx does not handle the signal itself.
