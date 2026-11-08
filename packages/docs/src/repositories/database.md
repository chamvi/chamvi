# Database store

`@chamvi/store-db` (formerly `@chamvi/store-typeorm`) keeps everything the engine persists in Postgres through TypeORM. It passes `describeRepositoryContract` unchanged, so the engine behaves the same on memory and on Postgres, also with several replicas on one database.

```bash
npm install @chamvi/store-db typeorm pg
```

`@chamvi/core`, `typeorm` (`^1.1.2`) and `pg` (`^8`) are peer dependencies.

## Setup

<<< @/snippets/store-db.ts#setup

`createDatabaseStore({ dataSource, clock? })` assembles all capabilities, including conversations, over the same `DataSource`. Each role is a separate class: `DatabaseRunRepository`, `DatabaseStepRepository`, `DatabaseCheckpointRepository`, `DatabaseIdempotencyRepository`, `DatabaseLockRepository`, `DatabaseEffectRepository`, `DatabaseStateRepository`, `DatabaseArtifactRepository`, `DatabaseAgentRevisionRepository` and `DatabaseConversationRepository`. The repositories take an initialized `DataSource` and never initialize or destroy it. The database must exist; create it beforehand, for example with `createDatabase()` from `typeorm-extension`.

On shutdown, drain the engine before destroying the data source:

<<< @/snippets/store-db.ts#shutdown

| Option | Type | Default | Description |
|---|---|---|---|
| `dataSource` | `DataSource` | required | An initialized Postgres data source that lists `STORE_ENTITIES` and `STORE_MIGRATIONS` |
| `clock` | `IClock` | `systemClock` | Time source for claims, keys, locks and `updatedAt` |

## Migrations

`migrateStore(dataSource)` runs the pending migrations under the Postgres advisory lock `chamvi:migrations` (`MIGRATION_LOCK_NAME`). Call it on every boot: replicas that start at once wait for each other, and each migration is applied and recorded once. Each call uses one pooled connection, the one holding the lock, for the migrations as well. chamvi is pre-1.0, so a new version may ship a new migration.

There is one migration so far, the baseline `1794096000000-uuid-baseline.ts` (`UuidBaseline1794096000000`), which creates the whole schema with a uuid v7 `id` primary key on every table (see [Tables](#tables)) and validated foreign keys. It cannot upgrade a database created by an earlier chamvi: `migrateStore` refuses such a database, before it changes anything, with an error (`store_legacy_schema`) that names [Upgrading](/guide/upgrading#upgrading-to-the-uuid-baseline). Start on a new, empty database.

`pendingMigrations(dataSource)` resolves the names of the migrations not run yet, in order, without writing anything (it never creates TypeORM's `migrations` table); `chamvi start --check` uses it to refuse a database a start with `CHAMVI_MIGRATE=false` could not run on (with the default `true` a start migrates, so the check passes). `chamvi start --check` also refuses a database with an earlier schema, whatever `CHAMVI_MIGRATE` says.

## Tables

| Table | Holds | Keys and indexes |
|---|---|---|
| `chamvi_runs` | Runs; JSON columns for trigger, output, error, usage, subtree usage, wait point and `taint`; the run's `address` in the `thread` column; claim owner and expiry; the conversation binding; `parent_run_id` | PK `id` (uuid v7); `(agent, status, concurrency_key)`; `(status, created_at, id)`; `conversation_scope_id`; `parent_run_id` (FK to `id`) |
| `chamvi_steps` | Append-only steps | PK `id` (bigint); `(run_id, step_index)` |
| `chamvi_checkpoints` | The latest checkpoint per run | PK `id`; unique `run_id`; `conversation_scope_id` |
| `chamvi_conversations` | Conversation identities, generation, active owner and its snapshot | PK `id` (uuid v7); unique `key` (the identity's sha256); `active_run_id` |
| `chamvi_conversation_items` | Transcript items and the send journal | PK `id` (bigint); unique `(scope_id, generation, key)`; `(scope_id, generation, created_at, id)`; `run_id` |
| `chamvi_conversation_notes` | Explicit notes | PK `id`; unique `(scope_id, generation, key)`; `expires_at`; `run_id` |
| `chamvi_conversation_operations` | Note operation receipts | PK `id`; unique `(scope_id, generation, operation_id)`; `(scope_id, created_at, operation_id)`; `run_id` |
| `chamvi_idempotency_keys` | Intake keys | PK `id`; unique `(scope, key)`; `expires_at` |
| `chamvi_locks` | Keyed leases | PK `id`; unique `key`; `expires_at` |
| `chamvi_effects` | Recorded effect results | PK `id`; unique `key` |
| `chamvi_kv` | Agent key-value state | PK `id`; unique `(agent, key)`, `key` `COLLATE "C"` |
| `chamvi_docs` | Agent document collections | PK `id`; unique `(agent, collection, document_id)`; GIN index on `doc` |
| `chamvi_artifacts` | Artifact metadata and bytes (`data` `bytea`) | PK `id` (uuid v7); unique `(run_id, key)` (the private write key); `run_id`, with no foreign key because attachments are stored before their run |
| `chamvi_agent_revisions` | One revision marker per folder agent: `hash` varchar(128), `changed_at` | PK `id`; unique `agent` varchar(64) `COLLATE "C"` |
| `chamvi_connections`, `chamvi_connection_entries` | Sealed connection entries and the key that wraps them | PK `id`; unique `name`, unique `(connection_id, key)` (foreign key `ON DELETE CASCADE`) |

Every table has a single `id` primary key, uuid v7 except the bigint `id` of the append-only steps and conversation items. What identifies a row to the store is the unique key listed, and an upsert overwrites its other columns but keeps the stored `id`. A value that is not a UUID is simply not found by `findOne`, `read` or `find({ ids })` (and a step, checkpoint or conversation turn of such a run id fails with `RunNotFoundError`), never a Postgres error.

Conversation rows, active owners, transcript items, notes and operation receipts use foreign keys to their local runs and identities. Steps and checkpoints also require an existing run. Use the same DataSource for every built-in TypeORM role; these relationships do not create a transaction spanning run dispatch, conversation mutation and generic effects. See [Conversation memory](/guide/conversations).

## How it keeps the contract

- **Repositories and query builders.** Every method goes through the entities' TypeORM repositories, find options and query builders. Hand-written fragments remain only where find options cannot express the condition: the `jsonb_exists` key check in `findDocuments` (TypeORM has no key-existence operator) the UTF-8 byte-length bound of conversation recall (`octet_length`) and the wait id guard of `runs.update` (`COALESCE(waiting->>'id', waiting->>'approvalId')`, TypeORM has no jsonb path operator).
- **One statement for each listed atomic operation**, never read-then-write in JavaScript:
  - `runs.insert`: an insert with `orIgnore()` (`ON CONFLICT DO NOTHING RETURNING id`).
  - `idempotency.claim` and `locks.acquire`: an insert with `orUpdate()` and an overwrite condition (`ON CONFLICT DO UPDATE ... WHERE expires_at <= now RETURNING`), so an expired key or lock is taken over in the same statement.
  - `runs.claim` and `runs.renewClaim`: a conditional update (`UPDATE ... WHERE ...`) checked by its affected-row count.
  - The `runs.update` guards: a conditional update with `RETURNING *`; when it matches no row, the store reads the run to throw `RunNotFoundError` or `InvalidRunStateError`.
  - `checkpoints.save`: an insert with `orUpdate()` and the overwrite condition `step_index <=` the new index.
  - `artifacts.insert`: an insert with `orIgnore()` returning `id`; a taken `id` and a taken `(run_id, key)` both keep the stored artifact.
  - `artifacts.save`: an upsert on `(run_id, key)` that replaces media type, filename, size and bytes and keeps the stored `id`, `agent` and `created_at`.
  - `agentRevisions.save`: an upsert on `agent`. The marker needs no atomic compare: the engine reads and writes it under the store lock `agents:<name>`.
- **Conversation transactions.** Conversation ownership and journal changes use transactions and a `FOR NO KEY UPDATE` lock on the conversation row rather than the single-statement pattern above (the row is never deleted and its key never changes, so the lock does not block the `KEY SHARE` locks of child-row foreign key checks).
- **Missing runs.** A step, checkpoint or conversation turn of a run that does not exist fails the foreign key; the store reports it as `RunNotFoundError`, like `createMemoryStore()`.
- **Time from the clock.** The injected `IClock`'s time is passed as a parameter; queries never call the database's `now()`.
- **No aliasing.** Values are serialized into the query and parsed out again; nothing is cached in memory.
- **Dates.** Timestamps are `timestamptz`; `trigger.receivedAt`, `trigger.attachments[].createdAt`, `waiting.expiresAt`, `waiting.notifiedAt` and `taint.at` live in JSON and are revived as `Date`.

## Housekeeping

Expired idempotency keys and locks never block anyone, but they stay in their tables until purged:

<<< @/snippets/store-db.ts#purge

`store.idempotency.purgeExpired(now?)` and `store.locks.purgeExpired(now?)` each delete their expired rows and return the number removed. The default time comes from the clock. Effects have no expiry and are never purged. Direct engine users schedule both as above; the app's built-in store module schedules them with `CHAMVI_PURGE_INTERVAL_MS`.

## Differences from memory repositories

- **Opaque values are JSON.** A run's `output`, step `input`/`output`/`error`, checkpoint messages, effect results and state lose `Date`, `undefined` and `Map` fidelity, and a typed array such as `Uint8Array` comes back as an object keyed by index. A `BigInt` or a circular structure makes the write throw a `TypeError`.
- **NUL characters and lone surrogates become U+FFFD** in opaque values, keys and strings alike, because `jsonb` cannot hold them.
- **Artifact bytes are `bytea`**, never selected by `findOne` or `find`, and come back from `read` as a plain `Uint8Array`. Postgres caps a `bytea` value at 1 GB and the whole value travels in one query, so keep artifacts small enough for memory. Nothing purges artifacts yet.
- **Identifiers have length limits** (`createMemoryStore()` has none): `concurrencyKey`, `address`, claim owners, step names, document collections and document ids 255; idempotency, lock, effect and state keys 512; idempotency scopes 1024 (`<agent>:<source>:<kind>:<id>` with the invoker URI-encoded, leaving about 950 characters for the encoded `kind` and `id`). A longer value makes the write fail with the driver's `value too long` error, so validate user-supplied keys before they reach `dispatch` (a rejected run with an `idempotencyKey` keeps its key reserved until the key expires).
- **`null` in an optional property reads back as absent:** a run `output` of `null`, and a step `input`, `output` or `error` of `null`, are stored as SQL `NULL`. `effects.save(key, undefined)` reads back `{ result: null }` and `upsertDocument(..., undefined)` reads back `doc: null`.
- **`findDocuments` `where` uses `jsonb` containment (`@>`).** Primitive values match by top-level equality; a nested object or array matches by containment, where `createMemoryStore()` never matches. A key whose value is `undefined` matches documents that lack the key, as in `createMemoryStore()`. Documents come back ordered by `document_id`, not by insertion.
- **`runs.find` ties** on `createdAt` are broken by `id` (uuid order, reversed for `order: 'desc'`); time-ordered ids make that the creation order, as in `createMemoryStore()`.
