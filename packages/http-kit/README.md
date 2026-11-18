# @chamvi/http-kit

A typed client for the chamvi REST API, for the browser and Node.js: a [hapic](https://github.com/tada5hi/hapic) `Client` with one API per domain, a hook that adds and refreshes the bearer token, `ApiError` for every failed call, list queries through [rapiq](https://github.com/tada5hi/rapiq) and an SSE reader for the run and connection streams. The chamvi dashboard (`@chamvi/ui`) and its `*-ui` pages are built on it.

## Installation

```bash
npm install @chamvi/http-kit
```

ESM only. `@chamvi/core`, `@chamvi/http` and `@chamvi/store` are peer dependencies for their types.

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

The domains are `account`, `authorization`, `agent`, `run`, `artifact`, `schedule`, `component`, `state`, `connection`, `connectionType` and `uiPage`. Every method takes a last `{ signal, timeout, token }`: `token` fixes the credential of that call, which then neither refreshes nor calls `onUnauthorized` (checking a pasted token must not sign out the current session).

## Behaviour

- A request without an answer within `timeoutMs` (default 45 s) fails as `ApiError` `timeout` (status 0). The deadline bounds the answer only, never the body of a stream; it is composed by hand because the dashboard's browser target has no `AbortSignal.any()`.
- A 401 asks `refresh()` once and retries; a 401 that stands calls `onUnauthorized()` and rethrows.
- A failed call is an `ApiError` with the body's `code`, `message` and `issues`, else `http_<status>`; `network_error` when no answer arrived, `invalid_response` for a 2xx body that is no JSON. A caller's abort stays the caller's abort reason.

## License

Apache-2.0
