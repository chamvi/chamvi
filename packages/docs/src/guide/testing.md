# Testing

`@chamvi/test-kit` holds what chamvi's own packages test with: scripted models, a controllable clock, an engine on memory repositories, the repository port suites and a data source for an app's database code. Nothing in it reaches a model provider, a real timer or the network.

```bash
npm install --save-dev @chamvi/test-kit @chamvi/store-memory vitest
```

## An engine

`createTestEngine(options)` builds an `Engine` with every service on memory repositories of one registry. Its options are the engine's (`agents`, `channels`, `clock`, `conversations`, ...) without the services; `replicaOf: engine` builds a second engine on the same services and clock, as a second replica on one database or a process after a restart.

<<< @/snippets/testing.ts#engine

- `mockModel(responses)` scripts one model call per response (text, tool calls, usage); `textModel(text)`, `approvalModel(toolName, input)` and `failingModel()` cover the common flows.
- Seed and read through the engine's services (`engine.runService`, `engine.checkpointService`, `engine.stateService`, ...); `engine.idle()` waits until nothing is running.
- Time moves only through the `ControllableClock`: `clock.advance(ms)` fires every timer due in order. Every service reads the clock after its locked read, so move it in steps when a run must keep its lease: one jump over a whole `claimTtlMs` loses the lease of a running run.

<<< @/snippets/testing.ts#clock

## An app

`app.start({ env })` takes the environment instead of `process.env` and `createApp({ models })` replaces a provider, so a whole app runs in a test ([Testing an app](/guide/app#testing-an-app)). `createModuleHarness({ modules })` of `@chamvi/app/testing` runs the real lifecycle of the modules you list without a port; `memoryStoreModule({ registry? })` from the same entry is the built-in store on memory repositories, and two apps on one `MemoryRegistry` see each other's rows. A spec reaches a repository or a service through its token on the harness's container (`AppToken.RUN_SERVICE`, ...).

## An app's database

A service of an app's [database](/guide/database) takes a port, so one spec body runs on every driver: on `MemoryEntityRepository` of `@chamvi/store-memory` and on the app's database repository over `createTestDataSource()`:

<<< @/snippets/database/memory.ts#memory

<<< @/snippets/database/spec.ts#spec

- `MemoryEntityRepository` takes what a database knows from the entity: `key` (the primary key fields), `unique` (field groups no two rows may share), `references` (a field holding another entity's key: a missing row is `EntityRelationError`), `upsertKey`, and `dates`, the fields that hold an instant. List `dates` by hand to match the entity's date columns: a filter on them is then compared as the instant a value names, as a database compares a date column; on a field not listed it is a plain string compare.
- `createTestDataSource({ entities })` is SQLite in memory, its tables synchronized from the entities and guarded for concurrent callers as the app's own SQLite data source is, so a compare-and-set in a transaction holds as in the app. `createTestDataSource({ entities, url })` creates a new database of its own on the PostgreSQL server `url` names (its user may create databases) and drops it again on `destroy()`. Each call is a database of its own; the caller destroys it.
- It loads `@chamvi/store-db`, `typeorm` and the driver (`better-sqlite3` or `pg`) on its first call: install them as devDependencies of the app (the kit lists `@chamvi/store-db` in no dependency field and resolves it from the app's folder).
- Rules whose outcome depends on the driver (concurrent writes, orderings, large batches) belong on PostgreSQL too: run the same body with `url`, for example against a [testcontainers](https://node.testcontainers.org/) PostgreSQL.

## A repository of your own

A third-party store proves each port with its suite (`describeRunRepositoryContract`, `describeLockRepositoryContract`, ...); see [Writing a Repository](/repositories/writing-a-repository#prove-it-with-the-contract-suite).
