# Dispatch

A tool can start runs of its **own agent** or of **another agent** of the app, and can wait for them to settle:

- `dispatch(ctx, { role?, payload, idempotencyKey?, concurrencyKey?, address? })` starts a run of the calling run's own agent.
- `dispatchTo(ctx, { agent, role?, payload, ... })` starts a run of `agent` (the calling run's own agent behaves exactly as `dispatch()`).
- `waitForDispatch(ctx, runs, { timeoutMs? })` pauses the calling run until every listed run settled and returns their outcomes.

The new run (the child) has its own budget, its own approvals and its own concurrency key. A dispatch alone is fire and forget: the tool gets `{ runId, deduplicated }` and the calling run (the parent) goes on at once. With `waitForDispatch()` the parent waits durably, across restarts and replicas, and continues with the children's outcomes. A daily run that finds ten pull requests needing work dispatches one run per pull request instead of fixing them all inline under one budget; an audit fans out one run per area, waits for all of them and hands their findings to a reporter agent.

## Roles

An agent accepts dispatches only through `agent.on()` subscriptions in its channels, one per **role**. The child comes in on the channel `agent`, with the role as its subscription id, which `agentChannel()` registers:

<<< @/snippets/dispatch.ts#agent

<<< @/snippets/dispatch.ts#engine

With [`@chamvi/app`](/guide/app) the engine module contributes `agentChannel()`, so the name `agent` is taken (a user channel of that name clashes at setup). A dispatch to a role the agent does not declare is a `ValidationError` tool error: `Agent "<a>" has no dispatch role "<r>": add agent.on({ role: '<r>' }) to its channels.`

`agent.on(options?)` takes:

| Option | Meaning |
|---|---|
| `role` | The role, default `DEFAULT_DISPATCH_ROLE` (`'default'`). It is the subscription id, so it shares the agent's subscription ids (`http`, `cron:<expression>`, `webhook:<path>`, ...): two subscriptions with one id are an `InvalidAgentDefinitionError`. Role names follow the channel-name rule |
| `schema` | A Standard Schema the payload goes through; the child gets the parsed value. A failing payload is a `ValidationError` tool error and starts nothing. Without one the payload passes unchanged |
| `maxPerRun` | How many dispatches of this role one run may start over all its executions, default `DEFAULT_MAX_DISPATCHES_PER_RUN` (100). A positive integer, else `InvalidAgentDefinitionError` (also for a subscription built by hand, when the agent is registered) |
| `from` | The other agents whose runs may dispatch to this role (agent names; names not registered yet are allowed). The own agent always may |
| `maxDepth` | The deepest a run of this role may sit in a dispatch tree (a root run has depth 0), default `DEFAULT_DISPATCH_MAX_DEPTH` (1), at most `DISPATCH_DEPTH_MAX` (8) |
| `concurrencyMaxRuns` | A shared-store execution cap for runs of this role, as on every subscription ([Concurrency](/guide/concurrency#shared-agent-and-subscription-ceilings)) |
| `concurrencyKey(payload)` | The child's concurrency key when the call gives none |
| `idempotencyKey(payload)` | The child's idempotency key when the call gives none |

## Starting a run

<<< @/snippets/dispatch.ts#tool

- `payload` is required; `role` is a non-empty string; `idempotencyKey`, `concurrencyKey` and `address` are optional non-empty strings without NUL (the concurrency key and the address at most 255 characters). Anything else is a `ValidationError` tool error.
- The child's envelope is `{ agent: <target>, trigger: <role>, channel: 'agent', payload, idempotencyKey, concurrencyKey?, address?, invoker?, parent }`. The model sees the channel, the role and the payload, like any run.
- `dispatch()` and `dispatchTo()` run inside a tool call only; in the tools factory they throw `InvalidRunStateError`.

## Another agent

`dispatchTo()` reaches a role of another agent only when that role lists the caller in `from`: the receiving agent decides who may start its runs, the caller declares nothing. Otherwise it is a `ValidationError` tool error: `Agent "<target>" role "<r>" accepts no dispatches from agent "<caller>".` An agent the engine does not hold is a `ValidationError` too.

A parent run with an invoker (a REST or MCP caller) dispatches to another agent only when that invoker holds `agent:<target>:run` (the permission `POST /agents/:name/runs` checks); the child carries the invoker unchanged, so a dispatch never widens grants. A run without an invoker (a cron run) passes.

## Waiting for the outcomes

<<< @/snippets/dispatch.ts#fan-out

`waitForDispatch()` takes run ids or dispatch results: one in, one `DispatchOutcome` out; a list in, the outcomes in its order (duplicates kept, `[]` for an empty list).

```ts
type DispatchOutcome = {
    runId: string;
    agent: string;
    role: string;
    status: 'completed' | 'failed' | 'cancelled' | 'timeout';
    output?: unknown;                           // completed: the child's run.output
    error?: { code: string; message: string };  // failed, cancelled or timed out
};
```

- When every listed run settled already, it returns at once. Otherwise the parent pauses in `waiting` like an [approval](/guide/approvals#asking-from-a-tool): the step ends, the wait point `run.waiting` is `{ kind: 'dispatch', id, toolName, toolCallId, runIds, expiresAt }`, and the parent frees its claim and slot.
- The last child that settles requeues the parent (on any replica); `tick()` heals a parent whose children settled while no engine pushed it, so the parent resumes exactly once. The parent's tool call then **runs again from the start**, as after an approval: `dispatch()` returns the recorded children and `waitForDispatch()` the recorded outcomes. Keep code before it free of side effects, or make them [effect tools](/guide/effect-tools).
- `output` is the child's stored `output`: its agent's [structured output](/guide/agents#structured-output), else the final text. Stages that return different shapes are different agents.
- Only runs this run dispatched may be waited on (its own children, or a run another parent dispatched under the same idempotency key, which this run got back with `deduplicated: true`); any other id is a `ValidationError` before the run pauses.
- `timeoutMs` defaults to `DEFAULT_DISPATCH_WAIT_TIMEOUT_MS` (24 h), from 1 to `APPROVAL_TIMEOUT_MAX_MS`. At expiry the engine cancels the unsettled children this run dispatched itself; they come back `cancelled` with `error.code` `Timeout`. A child running on another replica (or interrupted) first has to see the cancel: the wait is answered once it settled, or after one more claim TTL (`claimTtlMs`), when it comes back `timeout`. A deduplicated run another parent owns keeps running and comes back `timeout`.
- A tainted child taints the parent before its outcome reaches the parent's model ([Tools & Tool Errors](/guide/tools#untrusted-content-and-outbound-tools)).
- Like `approve()`, it runs in a tool call only (in the tools factory and in a streaming tool's body it throws `InvalidRunStateError`). `engine.approve()` refuses a dispatch wait (`InvalidRunStateError`, HTTP 409); the approval inbox shows only children that wait for a human.

## Keys and dedupe across runs

The claimed idempotency key is `dispatch:<role>:<key>` (or `sha256:<hex>` of it when it is longer than 255 characters), so two roles of one agent never share a child, where `<key>` is the call's `idempotencyKey`, else the role's `idempotencyKey(payload)`, else `<parent run id>:<hash of agent, role, payload, concurrency key and address>`.

A given key is **not** scoped to the parent run: a second run that dispatches the same key (the job run again, a replica) gets the first child back with `deduplicated: true`. Key it by what makes the work unique, for example the pull request and the day (`${pr}@${day}`), taking the day from `ctx.run.trigger.receivedAt` so a redo keeps the same key. Without a key, the default is scoped to the parent, so another parent with the same payload starts its own child. The idempotency scope is `<target agent>:agent` (plus the invoker), apart from every other channel's. A dispatch whose key deduplicates into the caller itself or a run up its lineage is refused (`ValidationError`): waiting on it would be a cycle that nothing settles.

The concurrency key works as for any run: two children with the same key never run at the same time, so one key per pull request keeps two fixes of one pull request apart. A dispatch whose child would take the agent and concurrency key that the caller or a run up its lineage holds is refused (`ValidationError`), since the child could never start while that run waits.

## The effect record

Each call is recorded under the effect key `<runId>:dispatch:<hash of agent, role, payload, key, concurrency key and address>` with the value `{ runId, deduplicated }`, so a step redone after a crash, an approval or a wait returns the recorded result and starts nothing. Identical calls in one step (parallel tool calls) share one dispatch. Dispatch is idempotent by itself, so a crash between the dispatch and the record still yields one child (the redo reads `deduplicated: true`).

## Limits

- **Per run and role**: at most `maxPerRun` dispatches per target agent and role, counted durably across executions (the effect `dispatch-count:<runId>:<agent>:<role>`), so a run that paused keeps its count. The count goes up before the dispatch, also for a deduplicated one; a crash in between spends that call's slot, and its redo reuses the slot (it never fails at the limit). Past the limit: `Run <id> reached its <n> dispatches of agent "<a>" role "<r>" (agent.on({ maxPerRun })).`
- **Depth**: a child's depth is its parent's plus one, across agents. A role refuses a child deeper than its `maxDepth` (`Agent "<a>" role "<r>" accepts dispatches up to depth <n>.`), so with the default 1 a dispatched run cannot dispatch again.
- **Subtree tokens**: with `budget.maxSubtreeTokens` on an agent, a run of it (or any run below it) starts no new dispatch once that run's subtree usage reached it, summed from its children at the dispatch, never only the stored `subtreeUsage` (a `BudgetExceeded` tool error, see [Budgets](/guide/budgets#subtree-tokens)). Children already running are not stopped.
- **The invoker** is inherited: the child gets the parent's invoker snapshot (none for a cron parent), so `requireToolPermission()` decides the same in the child as in the parent. The agent, the invoker and the parent come from the engine's copy of the run, so tool code that writes to `ctx.run` cannot change what a dispatch starts.

## Cancelling

Cancelling a run cancels the children it dispatched that have not settled, awaited or not, and theirs in turn (also when a registry change cancels it). A cascade lost to a store failure is completed by the engine's next poll, which cancels every unsettled run whose parent was cancelled. A run that completes or fails leaves its fire-and-forget children running. A run another parent dispatched under a shared idempotency key is never cancelled by a run that merely waited on it.

## Outbound in a child

The `agent` channel has no `out`, so `ctx.channels.findOne()` without a name is `undefined` in a child, and its approvals go to the inbox and the API. Tools of a child name their channel and address, for example `ctx.channels.findOneOrFail('github').approve({ address: 'o/r#5', title: 'Merge?' })`. The `address` given to the dispatch becomes the child's `trigger.address` and `run.address` (shown in the dashboard), so a tool can read it back from `ctx.run.trigger.address`.

## Lineage

The child's `trigger.parent` is `{ kind: 'dispatch', runId, agent, role, depth }` (`TriggerParent`), and the store keeps the parent's id as `run.parentRunId`. Only `dispatch()` and `dispatchTo()` set it: `engine.dispatch()` and a channel's `ctx.dispatch()` drop a `parent` a caller passes, so nobody forges lineage.

`run.subtreeUsage` is the sum of every descendant's token usage, recomputed from the children when one settles. `GET /runs?filter[parent]=<id>` lists a run's children ([HTTP API](/guide/http#routes)), and the [dashboard](/guide/ui)'s run page links the parent, lists the children and shows the subtree total.

## Under `chamvi run-job`

A [one-shot job](/guide/scheduler#one-shot-jobs) starts a whole engine over the shared store, so it runs the children its run dispatched too. A job whose run waits on its children does not end until they settle; it ends when the run or one of its descendants (also a run it waits on that another run dispatched) waits on an approval (`RunJobResult.waitingRunId` names the descendant). The drain at the end of the job interrupts fire-and-forget children still running; they requeue through recovery on the deployment and go on from their latest checkpoint.
