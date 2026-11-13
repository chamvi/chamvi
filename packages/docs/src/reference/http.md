# @chamvi/http

REST, SSE, MCP, the `http`, `mcp` and `webhook` channels and the `/channels/<name>` mount for chamvi agents, on routup. The public API of `packages/http/src/index.ts`.

```bash
npm install @chamvi/http @chamvi/core --save
```

`@chamvi/core` is a peer dependency. See [HTTP API & MCP](/guide/http) for the behaviour.

## createHttpApp

```ts
function createHttpApp(options: HttpAppOptions): App; // routup App
```

The store, the agents and the clock come from `engine` (`engine.store`, `engine.listAgents()`, `engine.clock`). The agents are read from the engine on every request, so an agent registered, replaced or removed at runtime gets (or loses) its routes, webhook subscriptions, `GET /agents` entry, schedules and MCP `run_<agent>` tool at once; a `run_<agent>` definition is built once per agent object, and one that fails for an agent registered after construction goes to `onError` and that tool is left out. `agents` narrows the served agents to the named ones, checked at construction: the others, also agents registered later, get no routes or MCP tools in this app (a mounted channel serves every agent subscribing to it), and a named agent removed from the engine answers 404. `agentIssues` lists agents that failed to load as `GET /agents` `issues`. `HttpRouteContext.agents` is read from the engine on every access. Throws `InvalidAgentDefinitionError` for a name in `agents` the engine lacks or that is given twice, an empty `auth` array and an invalid `routes` entry (a path that is not static, a duplicate method and path, a first segment of a built-in route such as `agents`, `runs` or `channels`, or the metrics path, all compared case-insensitively).

<<< ../../../http/src/app/types.ts#options{ts}

`channels` lists the channels mounted at `POST /channels/<name>` (each needs an `in` and must be the object the engine holds under its name, else `InvalidAgentDefinitionError`). `connections` returns the connection handles (`IConnectionHandle` of `@chamvi/core`: `name`, `type`, `status()`, `widgets()`, `subscribe()`, `actions.reset?`) served at [`/connections`](/guide/http#routes); it is called per request, and `@chamvi/app` passes every `AppToken.CONNECTIONS` contribution. `routes` takes extra routes from other packages, such as the dashboard of `@chamvi/ui`:

<<< ../../../http/src/app/types.ts#routes{ts}

The app's authenticators do not guard an extra route. A handler that needs them calls `request.authorize(permission?)`: it resolves the caller's `Principal` (the authenticator chain runs once per request), answers 401 with `WWW-Authenticate: Bearer` without one and 403 when the principal lacks `permission`.

## Channel HTTP request limits

`channelRateLimits?: Record<string, false | ChannelRateLimitOptions>` selects the HTTP intake policy for each mounted channel, without changing run execution capacity:

- An omitted entry inherits the general `rateLimit` bucket (default 300 requests per 60 seconds per client IP), shared with REST and other unconfigured channels.
- `{ max, windowMs? }` replaces that bucket for the channel with its own per-client bucket, separate from REST and other configured channels. `windowMs` defaults to 60,000. Explicit channel limits also work when the general `rateLimit` is `false`.
- `false` removes request limiting only for that channel's mounted `POST /channels/<name>` and subpaths. It does not disable authentication, signatures or body-size checks. Other methods and unknown channel paths do not gain the exemption.

The keys must exactly name mounted input channels. `max` must be a positive safe integer; `windowMs` a positive integer no greater than 2,147,483,647. Invalid policies throw `InvalidAgentDefinitionError` before serving. Buckets are local to this HTTP app, not coordinated through the run store. Refusals remain JSON `429` responses with `Retry-After` and rate-limit headers.

The same options pass through `httpModule()` in `@chamvi/app`. See [GitHub intake behind an ingress](/deployment/github-app#bursts-and-http-intake) for finite and disabled examples. `trustProxy` defaults to trusting no forwarded headers; restrict it to known proxy source addresses or CIDRs, never blindly trust arbitrary client headers.

## OpenAPI document

Every app serves the OpenAPI 3.2 document of its REST API at `GET <basePath>/openapi.json` and a Swagger UI over it at `<basePath>/docs`. The document describes the built-in REST routes only: MCP, the `/channels/<name>` mount and extra routes are not in it. It is generated from the controllers when `@chamvi/http` is built (`dist/swagger.json` in the published package), never at runtime; its `servers` entry is the app's `basePath`. A missing or unreadable document serves neither path and is reported once to `onError`; a UI that cannot be mounted leaves only `/docs` unserved, reported the same way; the API still starts.

- `openapi: { ui: false }` serves the document without the UI; `openapi: false` serves neither. With `@chamvi/app`, pass it through `httpModule({ openapi: false })`; there is no environment variable for it.
- Both are unauthenticated, rate-limited like every other route and labelled `/openapi.json`, `/docs` and `/docs/*` in the metrics. Turn them off, or keep them off the public ingress, if the shape of the API should not be public.
- The UI answers `GET` and `HEAD` at `<basePath>/docs` (lower case) and the five files its page loads, everything else under `/docs` with the JSON 404. The page loads nothing from another origin: its Content-Security-Policy allows only same-origin files and, of inline code, exactly the blocks of its own page by hash.
- `docs` and `openapi.json` are reserved first path segments: an extra route there is refused at construction, also with `openapi: false`.
- The UI's npm dependency `swagger-ui-dist` installs `@scarf/scarf`, whose install script reports install analytics. Set `SCARF_ANALYTICS=false` in the environment that runs `npm install` (an image build stage, CI), or `"scarfSettings": { "enabled": false }` in the app's `package.json`, to turn it off.

## Channels

```ts
function httpChannel(options?: HttpChannelOptions): IChannel;   // name 'http': REST runs; no in, no out
function mcpChannel(options?: HttpChannelOptions): IChannel;    // name 'mcp': MCP run_<agent> runs; no in, no out
// HttpChannelOptions { untrusted?: boolean }: true taints every run the channel starts (default trusted)
function webhookChannel(options: WebhookChannelOptions): WebhookChannel; // in at /channels/<name>/<agent><path>; on() bound to its name
function readRequestBody(request: Request, options: ReadRequestBodyOptions): Promise<Uint8Array>; // for a channel's in: 413 above options.limit

const http: HttpSubscriber;       // http.on({ schema? }): id 'http', at most one per agent
const webhook: WebhookSubscriber; // webhook.on(path, options?): id 'webhook:<path>'

const HTTP_CHANNEL_NAME: 'http';
const MCP_CHANNEL_NAME: 'mcp';
const WEBHOOK_CHANNEL_NAME: 'webhook';
```

<<< ../../../http/src/channels/types.ts{ts}

<<< ../../../http/src/subscriptions/types.ts{ts}

`httpChannel({ untrusted: true })` and `mcpChannel({ untrusted: true })` opt the REST and MCP intake into the [run-taint boundary](/guide/tools#untrusted-content-and-outbound-tools), for callers that relay text written by others (an OpenClaw MCP principal forwarding chat messages): every run they start is tainted (`channel:http`/`channel:mcp`), so outbound tools wait for approval. Both default to trusted, since the caller is an authenticated principal. In an `@chamvi/app` app, configure the built-in http module: `httpModule({ untrusted: { mcp: true } })` (or `http: true`) in `createApp({ modules })`.

The engine refuses an `http.on()` subscription unless it holds `httpChannel()` (REST and MCP keep separate idempotency scopes through the two channel names), and a `webhook.on()` one unless it holds the webhook channel. `webhook.on()` throws `InvalidAgentDefinitionError` for a path that does not start with `/`. See [Channels](/guide/http#channels).

## Authenticators

```ts
type Authenticator = (request: Request) => Promise<Principal | undefined>;

function staticTokens(options: StaticTokensOptions): Authenticator;
function authup(options: AuthupOptions): Authenticator;
function oidc(options: OidcOptions): Authenticator;
```

An authenticator resolves `undefined` for a request it does not recognize and throws a 401 for credentials it rejects. `staticTokens` throws `InvalidAgentDefinitionError` for an empty `tokens` array, a token `value` shorter than 16 characters, a missing `id` or a `value` given twice; `oidc` for an empty `issuers` list, an issuer without `audience` or a missing `principal`.

<<< ../../../http/src/auth/types.ts{ts}

<<< ../../../http/src/auth/authup/types.ts{ts}

## Permissions

```ts
function assertMcpRunTool(agent: Agent): void; // throws InvalidAgentDefinitionError like createHttpApp
```

`assertMcpRunTool` builds the agent's `run_<agent>` MCP tool definition and throws what `createHttpApp` would throw for it (a tool name above 64 characters, a payload schema MCP cannot compile); the app runs it on every folder agent before registering it. `createHttpApp` reports a folder agent's failure (one the engine holds at a revision) to `onError` and skips its tool instead of throwing.

The routes check `Permission` names of `@chamvi/access` with `can(principal, name, { attributes, now })` (one resource) and `canSome(principal, name, { now })` (a collection), `now` from the engine clock. The names and their attributes are in [Permissions and authup](/guide/permissions#names).

## createShutdown

```ts
function createShutdown(options: ShutdownOptions): IShutdown;

const DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS: 30_000;
const DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS: 5_000;
```

<<< ../../../http/src/shutdown/types.ts{ts}

## Wire types

```ts
type InvokerView = Omit<Invoker, 'bindings'>;
type RunView = Omit<Run, 'claim' | 'trigger' | 'conversation'> & {
    trigger: Omit<TriggerEnvelope, 'invoker'> & { invoker?: InvokerView };
    agentPrivate: boolean; // the agent's `private` as the server checks it (an agent the app does not hold: true)
};
type RunSummary = Pick<Run, 'id' | 'agent' | 'status' | 'createdAt' | 'finishedAt' | 'error'>;
type RunToolResult = {
    runId: string;
    status: RunStatusLiteral;
    deduplicated: boolean;
    output?: unknown;
    error?: { code: string; message: string };
    waiting?: RunToolApprovalWait | RunToolDispatchWait;
};
type RunToolApprovalWait = { // the run, or a descendant it waits on, waits on an approval
    kind: 'approval';
    runId: string; // the run to answer with approve_run
    agent: string;
    toolName: string;
    title: string;
    body?: string;
    artifacts?: string[];
    options?: ApprovalOption[]; // the choices to answer with approve_run's selected
    multiple?: boolean; // true when several options may be selected
    expiresAt: string;
};
type RunToolDispatchWait = { // the run waits on the runs it dispatched (get_run only: run_<agent> keeps waiting)
    kind: 'dispatch';
    toolName: string;
    runIds: string[];
    expiresAt: string;
};
type ApproveBody = { // POST /runs/:id/approve; approve_run takes the same fields plus runId
    approvalId: string;
    approved: boolean;
    reason?: string;
    selected?: string[]; // the chosen option ids of a wait point with options, none on a denial
};
```

`GET /runs` takes `filter[parent]=<run id>` (once, else 400 `filter[parent] takes one run id.`) next to `filter[agent]`, `filter[status]` and `filter[waiting]` (`approval` or `dispatch`, once, else 400 `filter[waiting] takes approval or dispatch.`; the wait point's kind): the runs whose `parentRunId` it is, under the same read rule (an agent-scoped reader adds `filter[agent]`). Runs carry `parentRunId` and `subtreeUsage` when set; `POST /runs/:id/approve` answers a run waiting on dispatched runs with 409 `invalid_run_state`, and `approve_run` refuses it.

`selected` follows `engine.approve()`'s rules (see [Approvals](/guide/approvals) and [HTTP](/guide/http)): a selection that does not fit the wait point is `400 validation_error`.

`GET /agents` answers `{ data: AgentSummary[], issues: AgentIssue[] }`, `GET /schedules` `{ data: ScheduleSummary[] }`:

<<< ../../../http/src/agents/types.ts#summaries{ts}
