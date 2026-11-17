# Memory repositories

The memory repositories of `@chamvi/store-memory` keep every aggregate in one process, for development and tests: `MemoryRunRepository`, `MemoryStepRepository`, `MemoryCheckpointRepository`, `MemoryEffectRepository`, `MemoryArtifactRepository`, `MemoryStateRepository`, `MemoryStateDocumentRepository`, `MemoryLockRepository`, `MemoryIdempotencyRepository`, `MemoryAgentRevisionRepository`, `MemoryConnectionRepository` and `MemoryConversationRepository`, all on one `MemoryRegistry`. Build each service of `@chamvi/core` on its repository and pass it to `new Engine()`; `createTestEngine()` of `@chamvi/test-kit` builds all of it for tests, and `@chamvi/app` without `DATABASE_URL` does the same.

```ts
import { MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import { RunService, systemClock } from '@chamvi/core';

const registry = new MemoryRegistry();
const runService = new RunService({ repository: new MemoryRunRepository({ registry }), clock: systemClock });
```

The registry enforces the references the database's foreign keys do, both ways: a step, a checkpoint or a conversation turn of a run the registry does not hold is refused (the services throw `RunNotFoundError`), and a run or checkpoint bound to a conversation it does not hold is `EntityRelationError`. Build every repository on the same registry. The connection repository's fence reads the lock rows of its registry: build the lock service on a lock repository of the same registry. `MemoryConversationRepository` keeps its `items`, `notes` and `operations` child repositories in the registry too.

## How it keeps the contract

- **Copies:** every value is stored and returned as a `structuredClone`.
- **Atomicity:** inside `transaction(fn)` every row read stays locked until the transaction ends (a lock cycle is `EntityDeadlockError`), so two callers never interleave between a read and its save in one process.
- **Expiry:** the services compare claims, keys and locks against `clock.now()` with the shared rule (expired at exactly `T + ttlMs`).

Each repository passes the same port suite every other implementation must pass.

## When to use it

- Tests, with a `ControllableClock` from [`@chamvi/test-kit`](/reference/test-kit) passed to the services and the engine.
- Local development and scripts.
- A single process where losing queued and waiting runs on restart is acceptable.

::: warning Not durable
Everything is gone with the process: queued runs, waiting approvals, checkpoints, recorded effects, agent state and artifacts. It also cannot be shared between replicas. Use the database repositories to survive restarts or to run more than one replica.
:::

## In tests

<<< @/snippets/testing.ts#clock
