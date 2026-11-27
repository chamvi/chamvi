<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/http-kit" width="128" height="128" />
</p>

<h1 align="center">@chamvi/http-kit</h1>

<p align="center">
    <b>Typed HTTP client for the chamvi API, with a hook that adds and refreshes the bearer token.</b><br>
    One API per domain over a <a href="https://github.com/tada5hi/hapic">hapic</a> client, for the browser and Node.js:<br>
    no hand-built URLs, token headers, error parsing or SSE readers in your dashboard or script.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/http-kit"><img src="https://img.shields.io/npm/v/@chamvi/http-kit" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/http-kit/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/http-kit" alt="License" /></a>
</p>

---

**Table of Contents**
- [Why @chamvi/http-kit?](#why-chamvihttp-kit)
- [Installation](#installation)
- [Usage](#usage)
- [Domains](#domains)
- [Authentication](#authentication)
- [Errors](#errors)
- [List queries](#list-queries)
- [Streams](#streams)
- [Options](#options)
- [API](#api)
- [Notes](#notes)
- [License](#license)

## Why @chamvi/http-kit?

The REST API of [`@chamvi/http`](../http/README.md) is plain JSON over bearer tokens, so `fetch` reaches it. What a client then writes around `fetch` is the same in every dashboard and script; the kit holds it once. The chamvi dashboard (`@chamvi/ui`) and its `*-ui` pages are built on it.

| Concern | With `fetch` | With `@chamvi/http-kit` |
|---|---|---|
| Routes and bodies | Build `/runs/${encodeURIComponent(id)}/approve` and its body by hand, untyped | `client.run.approve(id, { approvalId, approved })`, typed from `@chamvi/http` |
| Bearer token | Add the header per call, refresh on a 401, retry, sign out when it stands | `token`, `refresh` and `onUnauthorized` once in `createClient()` |
| Failures | Tell a 4xx body from a proxy page, a dropped connection, a non-JSON 2xx | One `ApiError` with `status`, `code`, `message`, `issues` and `retryAfter` |
| Timeouts | Compose your abort signal with a deadline (`AbortSignal.any()` is missing on the dashboard's browser target) | Every call has a deadline (45 s) next to your `signal` |
| List queries | Encode filters, sorts and pagination in the server's query dialect | A [rapiq](https://github.com/tada5hi/rapiq) query object |
| Streams | `EventSource` cannot send `Authorization`; parse SSE from a fetch body, reconnect, honour `Retry-After` | `client.run.stream()` plus `parseEventStream()`; `openConnectionStream()` reconnects for you |

## Installation

```bash
npm install @chamvi/http-kit
```

ESM only, Node.js `>=26.0.0` or a browser. `@chamvi/core-kit` is a peer dependency for the record and wire types. hapic, rapiq (`@rapiq/core`, `@rapiq/codec-url`), `@ebec/core` and `smob` are installed with the package.

## Usage

```ts
import { ApiError, createClient } from '@chamvi/http-kit';

const client = createClient({
    baseURL: 'https://agents.example.com/api',
    token: async () => sessionStorage.getItem('token') ?? undefined,
    refresh: async () => false,
    onUnauthorized: () => location.assign('/login'),
});

const page = await client.run.getMany({
    filters: { agent: 'triage', status: ['waiting'] },
    pagination: { limit: 20 },
});

try {
    await client.run.cancel(page.data[0]!.id);
} catch (error) {
    if (error instanceof ApiError && error.status === 409) {
        // already settled
    }
}
```

`baseURL` is the app's origin plus its `basePath`. A script that holds a static token passes `token: async () => process.env.CHAMVI_TOKEN` and leaves out `refresh` and `onUnauthorized`.

## Domains

The client has one API per domain. Every method takes a last `options` argument `{ signal, timeout, token }` (see [Options](#options)); the streams take their signal directly.

| Property | Methods | Routes |
|---|---|---|
| `account` | `getMe()` | `GET /me`: `{ id, kind, name?, identity? }` |
| `authorization` | `check(names?)` | `POST /authorization/check`: which `chamvi_*` permissions the principal may attempt |
| `agent` | `getMany()`, `startRun(name, { payload, idempotencyKey? })` | `GET /agents` (`{ data, issues }`), `POST /agents/:name/runs` (`{ runId, deduplicated }`) |
| `run` | `getMany(query?)`, `getOne(id)`, `cancel(id)`, `approve(id, body)`, `stream(id, { signal, lastEventId? })` | `/runs`, `/runs/:id` (with its steps), `/runs/:id/cancel`, `/runs/:id/approve`, `/runs/:id/stream` |
| `artifact` | `getMany(runId)`, `read(runId, artifactId)` | `/runs/:id/artifacts`, `/runs/:id/artifacts/:artifactId` (a `Blob`) |
| `state` | `getKv(agent, query?)`, `getDocs(agent, collection, query?)` | `/agents/:name/state/kv`, `/agents/:name/state/collections/:collection` |
| `schedule` | `getMany()` | `GET /schedules`: the cron subscriptions |
| `component` | `getMany()` | `GET /components`: the background jobs |
| `connection` | `getMany()`, `getOne(name)`, `getConfig(name)`, `create(type, body)`, `save(name, body)`, `test(name)`, `reset(name)`, `delete(name)`, `stream(name, signal)` | `/connections`, `/connections/:name` with `/config`, `/test`, `/reset`, `/events`; `create` posts to `/connection-types/:type/connections` |
| `connectionType` | `getMany()` | `GET /connection-types`: the connection types the app knows |
| `uiPage` | `getMany()` | `GET /ui-pages`: the dashboard pages (`*-ui` packages) the app serves |

Answers are typed as they arrive over the wire: the `*Wire` types are the `@chamvi/http` views with every `Date` as an ISO string (`Wire<T>`).

## Authentication

`createClient()` attaches a `ClientAuthenticationHook` to the client:

- **Per request** it asks `token()` and sets `Authorization: Bearer <token>`; `undefined` sends no header.
- **A 401** asks `refresh()` once and, when it answers `true`, retries the request with the new token. A throwing `refresh()` counts as `false`.
- **A 401 that stands** (no `refresh`, `false`, or the retry is a 401 again) calls `onUnauthorized()` and rethrows the error.
- **A fixed token** (`{ token }` on a call) is sent as is: that call neither refreshes nor calls `onUnauthorized`, so checking a pasted token cannot sign out the current session.

```ts
const me = await client.account.getMe({ token: pastedToken });
```

A `new Client(options)` has no hook; `new ClientAuthenticationHook({ token, refresh, onUnauthorized }).attach(client)` adds it, `detach(client)` removes it, and attaching twice is a no-op.

## Errors

Every failed call rejects with an `ApiError` (an [ebec](https://github.com/tada5hi/ebec) `BaseError`):

| `code` | `status` | When |
|---|---|---|
| the body's `code` | the HTTP status | A non-2xx answer with a chamvi error body; `message` and `issues` come from it |
| `http_<status>` | the HTTP status | A non-2xx answer without one (a proxy page) |
| `timeout` | `0` | No answer within the deadline |
| `network_error` | `0` | No answer at all (DNS, connection refused, CORS) |
| `invalid_response` | the HTTP status | A 2xx answer whose body is no JSON |
| `empty_stream` | the HTTP status | A stream answered without a body |

`retryAfter` holds `Retry-After` in seconds when the answer carried one. `retryDelayOf(error)` turns it into milliseconds for a 429 or 503, and gives a 429 without the header `RATE_LIMIT_BACKOFF_MS` (60 s). A caller's own abort rejects with the signal's `reason`, never with an `ApiError`.

## List queries

`run.getMany()`, `state.getKv()` and `state.getDocs()` take a [rapiq](https://github.com/tada5hi/rapiq) query: an object for `defineQuery()` or a built query.

```ts
const failed = await client.run.getMany({
    filters: { agent: 'triage', status: 'failed' },
    sort: { createdAt: 'DESC' },
    pagination: { limit: 50, offset: 50 },
});
// failed.meta: { total, limit, offset }
```

The query is encoded in rapiq's bracket dialect, falling back to the expression dialect for what brackets cannot express. `run.getMany()` adds `sorts: '-createdAt'` (newest first) to a query object that names no order. `GET /runs` filters by `agent` and `status`, sorts by `createdAt` and caps `limit` at 100. `decodeRunListQuery(search)` parses a URL query string back against that schema (`RUN_LIST_QUERY_SCHEMA`); an invalid one decodes to the empty query. `buildQueryString(query)` gives the encoded `?...` string.

## Streams

`client.run.stream()` answers the `text/event-stream` body of `GET /runs/:id/stream`, sent with the bearer header that browser `EventSource` cannot set; `parseEventStream()` reads its events:

```ts
import { parseEventStream } from '@chamvi/http-kit';

const controller = new AbortController();
const body = await client.run.stream(runId, { signal: controller.signal });

for await (const event of parseEventStream(body)) {
    if (event.event === 'step.appended') {
        // event.data is the step as JSON, event.id its step index
    }
}
```

The events are `run.updated`, `step.appended` (`id` = step index), `delta` (live model output, no `id`) and `ping`; the stream ends once the run settled. To resume after a drop, pass the last `id` you saw as `lastEventId`. The run stream does not reconnect by itself.

`openConnectionStream({ api: client.connection, name, onEvent, onError? })` follows `GET /connections/:name/events` and does reconnect: `status` and `widgets` events go to `onEvent` (pings are skipped), a drop reconnects after `RECONNECT_DELAYS_MS` (1, 2, 5, then every 10 s), a 429 or 503 waits its `Retry-After`. A 400, 401, 403 or 404 stops it and goes to `onError`. Each connect opens with the current state, so nothing is missed. `close()` stops it.

## Options

`createClient(options)` takes hapic's client options plus:

| Option | Type | Default | Description |
|---|---|---|---|
| `baseURL` | `string` | none | The app's origin plus its `basePath`, e.g. `https://agents.example.com/api` |
| `timeoutMs` | `number` | `45_000` (`REQUEST_TIMEOUT_MS`) | How long a call waits for the answer |
| `token` | `() => Promise<string \| undefined>` | required | The bearer token, asked per request |
| `refresh` | `() => Promise<boolean>` | none | Asked once on a 401; `true` retries |
| `onUnauthorized` | `() => void` | none | Called when a 401 stands |

Per call (`APIRequestOptions`):

| Option | Type | Description |
|---|---|---|
| `signal` | `AbortSignal` | Aborts the call; it rejects with the signal's reason |
| `timeout` | `number` | This call's deadline in ms, instead of `timeoutMs` |
| `token` | `string` | A fixed bearer token (see [Authentication](#authentication)) |

## API

| Export | Kind | Purpose |
|---|---|---|
| `createClient` | function | A `Client` with the authentication hook attached |
| `Client` | class | The hapic client with one API per domain (`IClient`) |
| `ClientAuthenticationHook` | class | Adds and refreshes the bearer token on any hapic client |
| `AccountAPI`, `AgentAPI`, `ArtifactAPI`, `AuthorizationAPI`, `ComponentAPI`, `ConnectionAPI`, `ConnectionTypeAPI`, `RunAPI`, `ScheduleAPI`, `StateAPI`, `UiPageAPI` | class | The domain APIs, on `BaseAPI` (`I<Name>API` each) |
| `ApiError` | class | Every failed call |
| `toApiError`, `asApiError`, `retryDelayOf` | function | Build an `ApiError` from a response or any error; the retry delay of one |
| `openConnectionStream` | function | A reconnecting reader of a connection's events |
| `parseEventStream`, `sleep` | function | An SSE parser over a response body; an abortable wait |
| `buildQueryString`, `decodeRunListQuery`, `path` | function | Encode a rapiq query; decode a run list query; join encoded path segments |
| `buildRequestConfig`, `FIXED_TOKEN` | function, constant | The request config of `APIRequestOptions`; the marker of a fixed-token request the hook leaves alone |
| `REQUEST_TIMEOUT_MS`, `RATE_LIMIT_BACKOFF_MS`, `RECONNECT_DELAYS_MS`, `FATAL_STREAM_STATUSES`, `RUN_LIST_QUERY_SCHEMA` | constant | `45_000`, `60_000`, `[1000, 2000, 5000, 10_000]`, `[400, 401, 403, 404]`, the `GET /runs` schema |

Types: `ClientOptions`, `CreateClientOptions`, `ClientAuthenticationHookOptions`, `APIRequestOptions`, `Wire`, `EntityQueryInput`, `SseEvent`, `RunWire`, `StepWire`, `RunDetail`, `RunPage`, `RunListFields`, `RunListQuery`, `ApproveBody`, `RunStreamInit`, `AgentWire`, `AgentIssueWire`, `AgentList`, `StartRunBody`, `StartRunResult`, `ArtifactWire`, `MeWire`, `AuthorizationCheckWire`, `ComponentWire`, `ScheduleWire`, `KvEntry`, `DocEntry`, `UiPageWire`, `ConnectionWire`, `ConnectionDetailWire`, `ConnectionWidgetWire`, `ConnectionSettingsWire`, `ConnectionTestWire`, `ConnectionTypeWire`, `ConnectionStreamEvent`, `ConnectionStreamOptions`, `IConnectionStream`.

## Notes

- **The deadline bounds the answer, never the body.** A stream or an artifact download can run past `timeoutMs` once the headers arrived.
- **Nothing is retried but the one 401.** A 429, a 503 or a network error rejects; `retryDelayOf()` tells you how long to wait. Only `openConnectionStream()` reconnects on its own.
- **The run stream is not resumed for you.** Keep the last `id` and pass it as `lastEventId`; `delta` events carry no `id` and are never replayed.
- **The client never decides a permission.** `authorization.check()` tells which names the principal may attempt; the server checks every call again.
- **The platform `fetch` is looked up per call**, so a `fetch` stubbed or polyfilled after the import is the one used.

## License

Published under [Apache License 2.0](./LICENSE).
