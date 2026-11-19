<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/peer" width="128" height="128" />
</p>

<h1 align="center">@chamvi/peer</h1>

<p align="center">
    <b>Connects chamvi apps as peers.</b><br>
    The resolver of the configured peers and the transport that starts, reads,<br>
    cancels and wakes runs at another chamvi app, for core's remote agents.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/peer"><img src="https://img.shields.io/npm/v/@chamvi/peer" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/peer/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/peer" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [Module](#module)
- [Credentials](#credentials)
- [Errors](#errors)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamvi/peer @chamvi/core --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/core` is a peer dependency; the requests go through [`@chamvi/http-kit`](../http-kit/README.md).

## Usage

A remote agent (`defineRemoteAgent()` of `@chamvi/core`) runs at another chamvi app, its peer. The engine takes the peers as an `IPeerResolver` (`new Engine({ peers })`); `createPeerResolver()` builds one from options:

```typescript
import { systemClock } from '@chamvi/core';
import type { IClock, IPeerResolver } from '@chamvi/core';
import { createPeerResolver } from '@chamvi/peer';

export function createPeers(options: { clock?: IClock; fetch?: typeof fetch } = {}): IPeerResolver {
    const { CHAMVI_PEER_DEV_TOKEN } = process.env;

    if (!CHAMVI_PEER_DEV_TOKEN) {
        throw new Error('Set CHAMVI_PEER_DEV_TOKEN.');
    }

    return createPeerResolver({
        peers: {
            dev: {
                // the peer's public URL: its origin plus its basePath
                url: 'https://dev.example',
                // the bearer this app sends to dev (a static token of dev's CHAMVI_TOKENS)
                outgoing: { token: CHAMVI_PEER_DEV_TOKEN },
                // dev calls this app as the static token principal "peer-dev"
                incoming: { token: 'peer-dev' },
            },
        },
        clock: options.clock ?? systemClock,
        fetch: options.fetch,
        // this app's approval link, shown to dev for runs it started here
        approvalUrl: ({ runId, approvalId }) => `https://assistants.example/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
    });
}
```

`outgoing` is what this app needs to call the peer (start, read, cancel, wake), `incoming` what it needs to accept the peer's calls; either may be absent for a one-way peer.

## Module

In an app on [`@chamvi/app`](../app/README.md), add `peerModule()` from `@chamvi/peer/module` to the app's `modules`. It takes the same options, with `clock` and `approvalUrl` optional overrides (defaults: the app's clock and `approvalUrlOf(config)`, the dashboard link from `CHAMVI_PUBLIC_URL`), registers the resolver as `AppToken.PEERS`, and the engine module passes it to the engine:

```typescript
import { createApp } from '@chamvi/app';
import { peerModule } from '@chamvi/peer/module';

export default createApp({
    modules: [
        peerModule({
            peers: {
                dev: {
                    url: 'https://dev.example',
                    outgoing: { token: process.env.CHAMVI_PEER_DEV_TOKEN ?? '' },
                    incoming: { token: 'peer-dev' },
                },
            },
        }),
    ],
});
```

The options are checked when `peerModule()` is called. A remote agent naming a peer the app does not configure fails the start and `chamvi start --check`. The guide on [chamvi.dev](https://chamvi.dev/guide/remote-agents) covers both directions, grants, trust and approvals.

## Credentials

- **Outgoing** `{ token }`: a fixed bearer, the secret of a static token at the peer. `{ authup: { url, clientId, clientSecret } }`: an authup client; the bearer comes from client credentials at `<url>/token`, cached on the clock until 30 s (`PEER_TOKEN_REFRESH_MARGIN_MS`) before its `expires_in`, and fetched afresh once when the peer answers 401.
- **Incoming** `{ token: '<principal id>' }`: the id of the static token principal the peer uses here (a `CHAMVI_TOKENS` entry with narrow permissions). `{ authupClient: '<client id>' }`: the authup client the peer signs in as. Two peers cannot share one.
- Every request goes to the peer's own origin and never follows a redirect, so the bearer reaches no other host. No secret appears in an error message.

## Errors

The transport honours the caller's signal (the engine's request deadline) and adds no timer of its own beyond http-kit's answer deadline.

| Answer | Error |
|---|---|
| 400, 401, 403, 404, 415, 413 without `Retry-After`, 409, any redirect | `ValidationError` of `@chamvi/core`: permanent (a resend does not fix it) |
| 409 with the code `entity_conflict`, `entity_deadlock`, `agent_replaced` or `invalid_run_state`; 413 with `Retry-After` | `PeerRequestError`: retryable (a passing condition at the peer) |
| 401 with an authup credential | the token is dropped and the request sent once more with a fresh one; a second 401 is permanent |
| authup token endpoint: 4xx (but 429), a redirect, an answer without `access_token` | `ValidationError`: permanent |
| 429, 503 (peer or token endpoint) | `PeerRequestError` with `retryAfterMs` from `Retry-After` (seconds or an HTTP date); none without the header |
| other 5xx, a network error (also while reading the authup token answer) | `PeerRequestError`: retryable |
| the caller's abort | the signal's reason |

## Options

| Option | Default | Meaning |
|---|---|---|
| `peers.<name>.url` | required | The peer's public URL: origin plus basePath (http or https) |
| `peers.<name>.outgoing` | none | `{ token }` or `{ authup: { url, clientId, clientSecret } }` |
| `peers.<name>.incoming` | none | `{ token }` or `{ authupClient }` |
| `peers.<name>.pollMs` | `60000` | The poll window of a remote run, at least `1000` |
| `peers.<name>.untrusted` | `false` | Every result from this peer taints the run |
| `peers.<name>.approvals` | none | `{ channel, address }`: where this app announces approvals of runs the peer started |
| `clock` | required | The `IClock` of the token cache and of `Retry-After` dates |
| `fetch` | global `fetch` | The fetch of every request |
| `approvalUrl` | none | This app's approval link, for the peer view and notifications |

A peer name follows the agent-name rule. Misconfiguration throws `InvalidAgentDefinitionError`.

## API

| Export | Purpose |
|---|---|
| `createPeerResolver(options)` | The `IPeerResolver` of the configured peers |
| `PeerRequestError` | A retryable peer request failure (`code` `peer_request`, `retryAfterMs`) |
| `PEER_POLL_DEFAULT_MS`, `PEER_POLL_MIN_MS` | The default and the shortest poll window |
| `PEER_TOKEN_REFRESH_MARGIN_MS` | How long before expiry an authup token is fetched again |
| `PEER_REQUEST_ERROR_CODE` | `peer_request` |

## License

Published under [Apache License 2.0](./LICENSE).
