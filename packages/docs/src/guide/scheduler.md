# Cron Scheduling

The cron channel, [`@chamvi/channel-cron`](/reference/channel-cron), fires the `cron.on()` subscriptions of your agents. Every replica registers the same channel; a lock in the shared store elects one replica per tick, and `engine.dispatch()` deduplicates a second firing of the same tick.

```bash
npm install @chamvi/channel-cron @chamvi/core --save
```

<<< @/snippets/cron.ts#channel

`cron.on(expression, options?)` validates the expression (cron-parser) and the timezone and throws `InvalidAgentDefinitionError` for one it refuses. `engine.start()` starts the channel after recovering runs: it creates one [hubwire](https://github.com/tada5hi/hubwire) scheduled component per cron subscription of the engine's agents, and a code agent's subscription it cannot use (an expression croner refuses) fails `engine.start()` with `InvalidAgentDefinitionError`, naming the agent and subscription; an [agent folder](/guide/agent-folders)'s goes to `onError` and leaves that agent unscheduled. The channel follows agents registered, replaced and removed at runtime. With [`@chamvi/app`](/guide/app), `schedulerModule()` contributes the channel.

A second cron channel (`cronChannel({ name: 'cron-eu' })`) has its own `on()`: its subscriptions fire only there, and `cron.on()` ones only on the channel named `cron`.

## One dispatch per tick

For a tick planned at `scheduledAt`, a replica:

1. acquires the store lock `cron:<agent>:<subscriptionId>:<scheduledAt ISO>` for `lockTtlMs` (default 10 minutes). The key is never released, so a replica that fires the same tick late cannot win it again. The other replicas skip the tick.
2. applies the subscription's [overlap policy](#overlap-policies).
3. dispatches through the channel (envelope `channel` the channel's name, `trigger` the subscription id) with payload `options.payload ?? { scheduledAt }` (an ISO string) and the idempotency key `<subscriptionId>@<scheduledAt ISO>`. A subscription's own `idempotencyKey()` is ignored for cron.

Starting or restarting a replica fires nothing: the first dispatch is at the next scheduled tick. Missed ticks are not caught up, neither a tick that falls into a restart nor one whose timer fires `lockTtlMs` or more late. A failing lock store, overlap check or dispatch reaches `onError(error, { agent, subscription })`, and the next tick runs normally.

## Overlap policies

"Active" means a run of the same subscription in `queued`, `running`, `waiting` or `interrupted`.

| Policy | The tick is skipped when | Default `concurrencyKey` |
|---|---|---|
| `skip` (default) | any run of the subscription is active | the subscription id |
| `queue-one` | a run of the subscription is still `queued` | the subscription id |
| `allow` | never | none |

The default concurrency key makes `queue-one` wait: the engine starts one run per agent and key at a time (see [Concurrency](/guide/concurrency)), so the queued run starts when the active one settles. It also makes a race harmless: when a tick checks while the previous tick's dispatch is still in flight, the second run waits instead of running alongside. A `concurrencyKey(payload)` on the subscription wins over the default.

## Timezones

`cron.on(expression, { timezone })` takes an IANA zone; without one, the process's local zone applies. A local time that occurs twice at the fall-back change fires once, at its first occurrence. A local time the spring-forward change skips fires once, an hour later in local time.

## Shutdown

`engine.drain()` (and `engine.stop()`) stop every channel first: the cron channel unschedules its subscriptions and waits for ticks in flight, then the drain waits for the runs. See [Cancel, Drain & Recovery](/guide/recovery#drain).

## One-shot jobs

`runJob()` fires one cron subscription once and waits for its run, for a Kubernetes CronJob instead of a long-lived replica:

<<< @/snippets/cron.ts#job

The tick is dispatched at the current time (the overlap policy applies). The engine is then started with `start({ channels: false })`, so a job never starts cron schedules or any other channel, and runs one approval tick even when the tick is skipped, so leftovers of earlier jobs make progress: a run whose pod was killed is recovered, an interrupted or answered run is executed, and an approval past its timeout is denied. The job returns when the run is `completed` (exit code 0), `waiting` for an approval, its own or a descendant's (0, the pod is not held; `waitingRunId` names a waiting descendant), `queued` behind a run of the same subscription that waits for an approval (0, under `queue-one`), `failed` or `cancelled` (1), or `skipped` by the overlap policy (0). A run that waits on the runs it [dispatched](/guide/dispatch) keeps the job going until they settle. It polls `engine.getRun` every `pollMs`, so a run finished by another replica also ends the job. It never calls `process.exit`. The engine must hold the subscription's cron channel.

::: warning A job runs a full engine
`engine.start()` recovers and executes every queued run of every agent in the shared store, not only the cron run, and the final `drain()` interrupts whatever still runs after `drainTimeoutMs`. `runJob` waits only for its own run, so a leftover run is finished by a long-lived replica or by a later job pod, within that pod's `drainTimeoutMs`. Size `drainTimeoutMs` to the job's runs, and prefer a long-lived deployment with `cronChannel()` when runs are long.
:::
