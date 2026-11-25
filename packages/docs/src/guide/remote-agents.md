# Remote Agents

An agent can run in another chamvi app, its **peer**. The calling app declares it with `defineRemoteAgent()`, and its runs dispatch to it like to any local agent. The peer runs the agent with its own model, tools, sandbox and approvals. A personal assistant app hands coding tasks to a developer app, which owns the repositories and the sandbox. The developer app can call back to the assistant app the same way.

```bash
npm install @chamvi/peer
```

`@chamvi/peer` has the transport and `peerModule()`. `defineRemoteAgent()` comes from `@chamvi/core` (re-exported by `@chamvi/app`).

## Two apps

The calling app, `assistants`, declares `developer` as a remote agent at the peer `dev`:

<<< @/snippets/remote-agents.ts#caller

The receiving app, `dev`, runs `developer`. It accepts the call through an `agent.on()` role whose `from` names the peer and the calling agent:

<<< @/snippets/remote-agents.ts#receiver

- A run of `developer` in `assistants` is a **stand-in**. It calls no model and runs no tools. It starts the remote run, waits for it, and settles with the remote run's outcome. `alfred` dispatches to it and waits for it as for a local agent ([Dispatch](/guide/dispatch)), and the stand-in shows in the dashboard, the REST API and MCP like any run.
- The receiver decides who may call. A `from` entry `<peer>/<agent>` matches only a run of `<agent>` in that peer. The peer name comes from the credential the request carries, never from the request body. A local name in `from` never matches a peer. All other role rules apply unchanged: `schema`, `maxPerRun`, `maxDepth`, keys.
- Both directions use the same configuration. Each app lists the other under `peers`, with `outgoing` to call it and `incoming` to recognize its calls. A one-way peer leaves one of them out, but the receiver needs `outgoing` to wake the caller (see [Deadlines](#deadlines)).

`defineRemoteAgent()` takes:

| Option | Meaning |
|---|---|
| `name` | The agent's name here |
| `peer` | A peer configured in `peerModule({ peers })`. An unknown peer stops the app at start (`InvalidAgentDefinitionError`), and `chamvi start --check` reports it too |
| `agent` | The agent at the peer, default `name` |
| `role` | Its `agent.on()` role at the peer, default `default` |
| `channels` | The subscriptions here, usually `agent.on({ from })` for the local callers |
| `output` | A Standard Schema the remote output is validated against here. A mismatch fails the stand-in with `ValidationError` |
| `timeoutMs` | The deadline of the whole remote run, see [Deadlines](#deadlines) |
| `approvals` | `{ channel, address }`: where approvals of the remote run are announced, see [Approvals](#approvals) |
| `description`, `private`, `concurrencyMaxRuns` | As for any agent |

A remote agent has no `model`, `instructions`, `tools`, `hooks`, `state` or `budget`. Those belong to the peer's agent.

## Peers

`peerModule({ peers })` goes into the app's `modules`. Each peer has a name, which follows the agent-name rule:

| Option | Default | Meaning |
|---|---|---|
| `url` | required | The peer's public URL, its origin plus its `basePath` (http or https) |
| `outgoing` | none | How this app authenticates at the peer: `{ token }` or `{ authup: { url, clientId, clientSecret } }` |
| `incoming` | none | How the peer authenticates here: `{ token: '<static token id>' }` or `{ authupClient: '<client id>' }` |
| `pollMs` | `60000` | How often a remote run is read, at least `1000` |
| `untrusted` | `false` | Every result from this peer taints the run that receives it, and every run this peer starts here is tainted from the start |
| `approvals` | none | `{ channel, address }`: where this app announces approvals of runs the peer started |

`approvalUrl` is this app's approval link, which the peer shows to its users. It defaults to the dashboard link built from `PUBLIC_URL`, and stays unset without one. A misconfigured peer throws `InvalidAgentDefinitionError` when `peerModule()` is called.

## Credentials

A peer authenticates like any other client. No principal kind is specific to peers.

- **Static token.** At the receiver, the peer is an ordinary `TOKENS` entry. `incoming: { token: '<id>' }` names that entry's `id`. The caller sends the entry's secret as `outgoing: { token }`.
- **authup.** The caller fetches a token with client credentials (`outgoing: { authup: { url, clientId, clientSecret } }`). The token is cached until shortly before it expires and fetched again once after a 401. The receiver recognizes the client with `incoming: { authupClient: '<client id>' }`. Only a client signed in through the receiver's `authup()` authenticator matches.

A run started by a peer acts with the grants of the peer's credential. The calling app's name is shown on the run for display only. The start needs `chamvi_agent_run` for the agent. An agent the peer may not start answers 404, like a missing agent, so the peer cannot find out which agents exist. Reading, cancelling and waking a run the peer started needs no further grant. On every other route the peer's credential is an ordinary principal: `chamvi_agent_run` for an agent also reads that agent's non-private runs. **Give a peer token the narrowest grants it needs**, usually `chamvi_agent_run` for the agents it calls:

```bash
export TOKENS='[
  { "value": "<admin secret>", "id": "admin", "permissions": "*" },
  { "value": "<peer secret>", "id": "peer-assistants", "permissions": [
    { "permission": { "name": "chamvi_agent_run" }, "policies": [{ "type": "attributes", "query": { "name": "developer" } }] }
  ] }
]'
```

The transport sends a request only to the peer's own origin and never follows a redirect, so the bearer reaches no other host. No secret appears in an error message or a log.

## How a call runs

1. The stand-in sends one start. The start is an effect keyed by the stand-in's run id, so a start whose answer was lost is sent again and reaches the same remote run. Once the remote run id is recorded, no start is sent again, also after a restart on another replica.
2. The stand-in waits (`waiting`, kind `remote`). Every `pollMs`, one replica reads the remote run (`GET /runs/:id`, the peer's view of the runs it started). When the remote run settles or waits on an approval, the peer sends a wake (`POST /runs/:id/wake`, no content). The wake makes the next poll happen at once. Every peer gets 202 for a wake, also for a stand-in that settled meanwhile; only a request from a credential that is no peer gets 404.
3. The stand-in settles with the remote outcome. A completed run gives its output, validated by `output` when given. A failed run gives its error (`remote_failed` when the peer reports none). A cancelled run cancels the stand-in.

Cancelling the stand-in cancels the remote run, best effort. A start that the peer answers with 400, 401, 403, 404, 415, a 413 without `Retry-After` (the start, with its attachments, is above the peer's body limit), a 409 or a redirect has a problem a resend does not fix, so the stand-in fails with `ValidationError` at once. A start answered with a 429, a 5xx, a network error, a 413 with `Retry-After` or a 409 for a passing condition (`entity_conflict`, `entity_deadlock`, `agent_replaced`, `invalid_run_state`) is sent again. A failed read is reported to `onError` and tried again in the next window, or after the peer's `Retry-After` when that is longer. Both stop at the deadline.

The stand-in adds no dispatch level. The start sends the depth of the calling run, so `alfred`'s call lands at depth 1 in `dev`, as a local dispatch would. The default `maxDepth` of 1 allows it.

## Trust

Taint crosses peers in both directions ([Untrusted content](/guide/tools#untrusted-content-and-outbound-tools)):

- A tainted caller starts a tainted remote run (`peer:<peer>`), and so does any caller from a peer the receiver configured `untrusted`. The remote agent's outbound tools are gated from its first step.
- A stand-in is tainted (`peer:<peer>/<remoteRunId>`) when the remote run was tainted, or when the peer is configured `untrusted`. The taint is stored before the output reaches the caller, so the waiting parent is tainted before it sees the result.

A peer's results and requests are only as trustworthy as the peer. Mark a peer you do not operate yourself `untrusted: true`.

## Approvals

An approval inside the remote run, or in a run it dispatched, belongs to the app that runs it. **It is answered only there**, in that app's dashboard or API. The calling app shows it on the stand-in: the title and the peer's link. It never answers it: the receiver refuses an answer from a peer's credential with 404, whatever grants that credential holds.

- `defineRemoteAgent({ approvals: { channel, address } })` announces each remote approval once through that channel, with the title and the peer's link. Without it, nothing is sent, and the approval shows only on the stand-in.
- `peers.<name>.approvals` announces, at the receiver, approvals of runs that peer started.

Both destinations are fixed in code. A remote approval never goes to the source of an ancestor run, such as the chat the request came from, because a peer could otherwise reach that conversation.

## Deadlines

| Deadline | Value |
|---|---|
| A peer request (start, read, cancel, wake) | 30 s |
| The poll of a remote run | Every `pollMs` (60 s) across all replicas; at once after a wake |
| The whole remote run (`timeoutMs`) | 24 h by default, at most `APPROVAL_TIMEOUT_MAX_MS` |

`timeoutMs` counts from the stand-in's creation: a stand-in that has not started its remote run by then fails with `Timeout`, and its wait expires at that same deadline, however long the start took. When the wait expires, the stand-in fails with `Timeout` and sends the remote run one cancel, best effort. A stand-in that never started its remote run has no remote run id, so nothing is cancelled there.

## Errors

| Code | Where | Meaning |
|---|---|---|
| `remote_failed` | The stand-in's `run.error` | The remote run failed without an error of its own |
| `peer_start_busy` | 503 on `POST /agents/:name/runs` from a peer, with `Retry-After` | Another start of the same parent and role holds the count. The caller retries |
| `peer_request` | `onError` | A retryable peer request failure (`PeerRequestError` of `@chamvi/peer`) |

## In the dashboard

A waiting stand-in shows `<peer>/<agent>`, the remote run id and, while the remote run waits on an approval, its title and a link that opens the peer's approval page in a new tab. A remote agent's card reads `remote: <peer>/<agent>`. Stand-ins never fill the approvals inbox: the approval is answered at the peer.
