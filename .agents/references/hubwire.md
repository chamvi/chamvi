# hubwire

[tada5hi/hubwire](https://github.com/tada5hi/hubwire), package `hubwire`. Pinned to **0.2.3** (tag `hubwire-v0.2.3`, commit `8d72996`); `@hubwire/test` 0.1.3 is a devDependency of `@chamvi/channel-cron`. `@chamvi/core` and `@chamvi/http` never depend on hubwire: they type what they read structurally.

## Map

| hubwire (`packages/hubwire/src/`) | chamvi caller | Notes |
|---|---|---|
| `clock/types.ts` `IClock`, `ClockTimer`; `clock/module.ts` `systemClock` | `packages/core/src/clock/types.ts` `IClock` | Same shape (`now()` epoch ms, `setTimeout(fn, ms)` returning `{ clear, unref? }`), so `engine.clock` passes straight into every `clock` option; no adapter. A wall-time clock only: a `performance.now()` clock drifts and must not drive a locked cron job. |
| `component/scheduled.ts` `defineScheduledComponent` | `packages/channel-cron/src/scheduler/helpers.ts` (`buildComponentOptions`, one component per cron subscription), `scheduler/module.ts` (`assertSchedulable`, a throwaway component without a clock) | Default `unref` (timers hold the process). `runOnStart: false`. `hooks.onSkip` is not wired: N - 1 replicas skip every tick as `locked`. |
| `component/types.ts` `IScheduleLock` | `packages/channel-cron/src/lock/module.ts` `createRepositoryScheduleLock()` | Over core's `LockService.acquire`, never released. |
| `component/interval.ts` `defineIntervalComponent` | `packages/app/src/modules/service/purge.ts` (`store-purge`), `modules/agents/watcher.ts` (`agents-watcher`), `modules/agents/retry.ts` (`agents-packages`), `packages/knowledge/src/knowledge/module.ts` (`knowledge-managed`, `runOnStart: true`) | Every one passes `unref: true` and `engine.clock`. A pass that failed throws after logging (no `hooks.onError`, except knowledge's), so `lastErrorAt` is set and `lastSuccessAt` is not. |
| `group/module.ts` `defineComponentGroup` | `packages/app/src/modules/components/module.ts` | Start in add order, rollback of a failed start, the reverse stop sweep and `status()` are hubwire's; chamvi bounds the group's `stop()` by `CHAMVI_DRAIN_TIMEOUT_MS`. |
| `component/types.ts` `ComponentStatus` | core `ChannelStatus` (`channel/types.ts`), http `HttpComponent` (`components/types.ts`) | Structural: epoch ms `lastSuccessAt`, `lastErrorAt`, `lastRunAt`, `runningSince`. |

## Known gap (0.2.3)

`defineIntervalComponent` (`component/interval.ts`): a `start()` that lands after a pass's promise `finally` cleared the pass and before `follow()` ran sees no pass in flight, so `requested` stays false, while `looping` is still true, so it begins nothing; a `follow({ done: true })` then halts the loop and that start is lost. Unreachable in chamvi: the packages poller adds a retry only in `boot()` (before the start) or inside a pass (seen by the pass's own result). Raise it upstream before a caller can call `start()` from outside a pass while the loop may end.
