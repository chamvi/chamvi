# Database store

`@chamvi/store-db` (formerly `@chamvi/store-typeorm`) keeps everything the engine persists in Postgres through TypeORM. Its repositories pass the port suites of `@chamvi/test-kit` unchanged, so the engine behaves the same on memory and on Postgres, also with several replicas on one database.

```bash
npm install @chamvi/store-db typeorm pg
```

`typeorm` (`^1.1.2`) and `pg` (`^8`) are peer dependencies; the services that use the repositories come from `@chamvi/core`.

## Setup

<<< @/snippets/store-db.ts#setup

Every aggregate is a repository of its own over the same `DataSource`, the ports' repositories `DatabaseRunRepository`, `DatabaseStepRepository`, `DatabaseCheckpointRepository`, `DatabaseEffectRepository`, `DatabaseArtifactRepository`, `DatabaseStateRepository`, `DatabaseStateDocumentRepository`, `DatabaseIdempotencyRepository`, `DatabaseLimitRepository`, `DatabaseLockRepository`, `DatabaseAgentRevisionRepository`, `DatabaseConnectionRepository` and `DatabaseConversationRepository` (each `new ...(dataSource)`, the services of `@chamvi/core` on them; the connection repository's `entries` and `secrets` share its manager in a transaction, and `findFence` reads the lease's lock row `FOR SHARE`; the conversation repository's `items`, `notes` and `operations` share its manager too, and its locked read takes `FOR NO KEY UPDATE`, which does not hold off the rows referencing the conversation). The repositories take an initialized `DataSource` and never initialize or destroy it. The database must exist; create it beforehand, for example with `createDatabase()` from `typeorm-extension`.

On shutdown, drain the engine before destroying the data source:

<<< @/snippets/store-db.ts#shutdown

Each repository takes one argument, an initialized Postgres data source that lists `STORE_ENTITIES` and `STORE_MIGRATIONS` (or a manager of it). The repositories take no clock: the services do (`RunService`, `LockService`, `IdempotencyService`, `ConnectionService` and `ConversationService` take `clock`), for claims, keys, locks, fences, retention and `updatedAt`.

## Migrations

`migrateStore(dataSource)` runs the pending migrations under the Postgres advisory lock `chamvi:migrations` (`MIGRATION_LOCK_NAME`). Call it on every boot: replicas that start at once wait for each other, and each migration is applied and recorded once. Each call uses one pooled connection, the one holding the lock, for the migrations as well. chamvi is pre-1.0, so a new version may ship a new migration.

The baseline `1794096000000-uuid-baseline.ts` (`UuidBaseline1794096000000`) creates the whole schema with a uuid v7 `id` primary key on every table (see [Tables](#tables)) and validated foreign keys. It cannot upgrade a database created by an earlier chamvi: `migrateStore` refuses such a database, before it changes anything, with an error (`store_legacy_schema`) that names [Upgrading](/guide/upgrading#upgrading-to-0-8). Start on a new, empty database. The migration after it, `ConnectionsRevisionsItemBytes1794230765000`, changes that schema in place: the connection settings and secrets, `chamvi_runs.agent_revision` and `chamvi_conversation_items.bytes` (filled for the stored items under an exclusive lock on that table, see [Upgrading](/guide/upgrading#upgrading-to-0-9)). `LockTokens1795093873329` adds the lock fencing tokens: the table `chamvi_lock_tokens` and the column `chamvi_locks.token`, filled for the stored locks (see [Upgrading](/guide/upgrading#upgrading-to-0-10)).

`pendingMigrations(dataSource)` resolves the names of the migrations not run yet, in order, without writing anything (it never creates TypeORM's `migrations` table); `chamvi start --check` uses it to refuse a database a start with `MIGRATE=false` could not run on (with the default `true` a start migrates, so the check passes). `chamvi start --check` also refuses a database with an earlier schema, whatever `MIGRATE` says.

## Tables

| Table | Holds | Keys and indexes |
|---|---|---|
| `chamvi_runs` | Runs; JSON columns for trigger, output, error, usage, subtree usage, wait point and `taint`; the run's `address` in the `thread` column; claim owner and expiry; the conversation binding; `parent_run_id` | PK `id` (uuid v7); `(agent, status, concurrency_key)`; `(status, created_at, id)`; `conversation_scope_id`; `parent_run_id` (FK to `id`) |
| `chamvi_steps` | Append-only steps | PK `id` (uuid v7); `sequence` (bigserial, database-assigned); `(run_id, step_index, sequence)` |
| `chamvi_checkpoints` | The latest checkpoint per run | PK `id`; unique `run_id`; `conversation_scope_id` |
| `chamvi_conversations` | Conversation identities, generation, active owner and its snapshot | PK `id` (uuid v7); unique `key` (the identity's sha256); `active_run_id` |
| `chamvi_conversation_items` | Transcript items and the send journal, each with the UTF-8 byte length of its text (`bytes`), which the recall selects by | PK `id` (uuid v7); `sequence` (bigserial, database-assigned); unique `(scope_id, generation, key)`; `(scope_id, generation, sequence)`; `run_id` |
| `chamvi_conversation_notes` | Explicit notes | PK `id`; unique `(scope_id, generation, key)`; `expires_at`; `run_id` |
| `chamvi_conversation_operations` | Note operation receipts | PK `id`; unique `(scope_id, generation, operation_id)`; `(scope_id, created_at, operation_id)`; `run_id` |
| `chamvi_idempotency_keys` | Intake keys | PK `id`; unique `(scope, key)`; `expires_at` |
| `chamvi_limit_uses` | Counted tool-limit uses | PK `id`; unique `(scope, key)`; index `(scope, created_at)`; `created_at` |
| `chamvi_locks` | Keyed leases | PK `id`; unique `key`; `expires_at`; `token` (bigint) |
| `chamvi_lock_tokens` | The last fencing token issued | PK `id` (uuid v7, minted once); unique `key` (the constant `lock`, which finds the one row); `value` (bigint) |
| `chamvi_effects` | Recorded effect results | PK `id`; unique `key` |
| `chamvi_kv` | Agent key-value state | PK `id`; unique `(agent, key)`, `key` `COLLATE "C"` |
| `chamvi_docs` | Agent document collections | PK `id`; unique `(agent, collection, document_id)`; GIN index on `doc` |
| `chamvi_artifacts` | Artifact metadata and bytes (`data` `bytea`) | PK `id` (uuid v7); unique `(run_id, key)` (the private write key); `run_id`, with no foreign key because attachments are stored before their run |
| `chamvi_agent_revisions` | One revision marker per folder agent: `hash` varchar(128), `changed_at` | PK `id`; unique `agent` varchar(64) `COLLATE "C"` |
| `chamvi_connections`, `chamvi_connection_entries` | Sealed connection entries and the key that wraps them | PK `id`; unique `name`, unique `(connection_id, key)` (foreign key `ON DELETE CASCADE`) |

Every table has a single `id` primary key, uuid v7. The append-only steps and conversation items also carry a database-assigned `sequence` (bigserial), which every ordered read uses and an upsert keeps; step reads return `id`, never `sequence`. What identifies a row to the store is the unique key listed, and an upsert overwrites its other columns but keeps the stored `id`. A value that is not a UUID is simply not found by `findOne`, `read` or `find({ ids })` (and a step, checkpoint or conversation turn of such a run id fails with `RunNotFoundError`), never a Postgres error.

Conversation rows, active owners, transcript items, notes and operation receipts use foreign keys to their local runs and identities. Steps and checkpoints also require an existing run. Use the same DataSource for every built-in TypeORM role; these relationships do not create a transaction spanning run dispatch, conversation mutation and generic effects. See [Conversation memory](/guide/conversations).

## How it keeps the contract

- **Repositories and query builders.** Every method goes through the entities' TypeORM repositories, find options and query builders. Hand-written fragments remain only where find options cannot express the condition: the `jsonb_exists` key check and the top-level `doc -> key` equality of `DatabaseStateDocumentRepository.findContaining` (TypeORM has neither operator) and the wait point kind of `DatabaseRunRepository.findByWaitKind` (`waiting->>'kind'`, rapiq's TypeORM adapter has no jsonb path).
- **Runs and steps in transactions.** `DatabaseRunRepository` and `DatabaseStepRepository` implement the ports of `@chamvi/store` on `EntityRepositoryAdapter`; `RunService` reads a run `FOR NO KEY UPDATE` in a transaction, decides, then writes the changed columns (the lock never blocks the `KEY SHARE` locks of a step, checkpoint or child run insert). A taken id is `EntityConflictError` (`create` resolves `false`), a missing parent `EntityRelationError` (`RunNotFoundError`).
- **Locks and idempotency keys in transactions.** `LockService.acquire` and `IdempotencyService.claim` first read the row once without a lock: a held lease or an unexpired key is refused on that one statement. A row that read found expired is taken over in a transaction that reads it `FOR UPDATE`, reads the clock and takes the row over only when it is still expired. A key that read found free (or one gone by the locked read) is inserted in a transaction of its own; a unique violation (`EntityConflictError`, the key was taken meanwhile) is followed by the same locked takeover in a new transaction. A renewal and a release read the lock row `FOR UPDATE` too, so a reader that locks the row sees a lease before or after a change, never one in flight. An insert and a takeover first take a fencing token: one `UPDATE chamvi_lock_tokens SET value = GREATEST(value + 1, <now in µs>) ... RETURNING value` in the same transaction, so concurrent acquirers serialize on that row and no token repeats.
- **One statement for each listed atomic operation**, never read-then-write in JavaScript:
  - Effects, state keys, state documents and agent revision markers: an upsert on the natural key (`key`, `(agent, key)`, `(agent, collection, document_id)`, `agent`) that keeps the stored `id` and returns it. A marker needs no atomic compare: the engine reads and writes it under the store lock `agents:<name>`.
- **Checkpoints and keyed artifacts in a transaction.** `CheckpointService.save` reads the run's checkpoint row `FOR UPDATE`, keeps the higher step index and writes; `ArtifactService.save` reads the `(run_id, key)` row the same way and keeps its `id`, `agent` and `created_at`. Two first writes that both found no row insert, the loser's unique violation (`EntityConflictError`) is retried once in a new transaction, which finds the row. `ArtifactService.create` inserts; a taken `id` or `(run_id, key)` is `EntityConflictError` and resolves `false`.
- **Conversation transactions.** Conversation ownership and journal changes use transactions and a `FOR NO KEY UPDATE` lock on the conversation row rather than the single-statement pattern above (the row is never deleted and its key never changes, so the lock does not block the `KEY SHARE` locks of child-row foreign key checks).
- **Missing runs.** A step, checkpoint or conversation turn of a run that does not exist fails the foreign key; the services report it as `RunNotFoundError`, like on memory.
- **Time from the clock.** The services read their `IClock` and hand the repository the finished values; queries never call the database's `now()`.
- **No aliasing.** Values are serialized into the query and parsed out again; nothing is cached in memory.
- **Dates.** Timestamps are `timestamptz`; `trigger.receivedAt`, `trigger.attachments[].createdAt`, `waiting.expiresAt`, `waiting.notifiedAt` and `taint.at` live in JSON and are revived as `Date`.

## Housekeeping

Expired idempotency keys, locks and limit uses never block anyone, but they stay in their tables until purged:

<<< @/snippets/store-db.ts#purge

`engine.idempotencyService.purgeExpired(now?)` and `engine.lockService.purgeExpired(now?)` each delete their expired rows (one `DELETE ... WHERE expires_at <= now`, through `removeExpiredBy`) and return the number removed. `engine.limitService.purgeExpired(now?)` (an engine built with a `limitService`) deletes the limit uses no window counts any more: those created at least the longest window a limit accepts (`APPROVAL_TIMEOUT_MAX_MS`, about 24.8 days) before `now` (one `DELETE ... WHERE created_at <= ...`, through `removeCreatedBefore`). The default time comes from the clock. Effects have no expiry and are never purged. Direct engine users schedule both as above; the app's built-in store module schedules them with `PURGE_INTERVAL_MS`.

## Differences from memory repositories

- **Opaque values are JSON.** A run's `output`, step `input`/`output`/`error`, checkpoint messages, effect results and state lose `Date`, `undefined` and `Map` fidelity, and a typed array such as `Uint8Array` comes back as an object keyed by index. A `BigInt` or a circular structure makes the write throw a `TypeError`.
- **NUL characters and lone surrogates become U+FFFD** in opaque values, keys and strings alike, because `jsonb` cannot hold them.
- **Artifact bytes are `bytea`**, never selected by `findOne` or `find`, and come back from `readData` (`ArtifactService.read`) as a plain `Uint8Array`. Postgres caps a `bytea` value at 1 GB and the whole value travels in one query, so keep artifacts small enough for memory. Nothing purges artifacts yet.
- **Identifiers have length limits** (the memory repositories have none): `concurrencyKey`, `address`, claim owners, step names, document collections and document ids 255; idempotency, lock, effect and state keys 512; idempotency scopes 1024 (`<agent>:<source>:<kind>:<id>` with the invoker URI-encoded, leaving about 950 characters for the encoded `kind` and `id`). A longer value makes the write fail with the driver's `value too long` error, so validate user-supplied keys before they reach `dispatch` (a rejected run with an `idempotencyKey` keeps its key reserved until the key expires).
- **`null` in an optional property reads back as absent:** a run `output` of `null`, and a step `input`, `output` or `error` of `null`, are stored as SQL `NULL`. `effectService.save(key, undefined)` and `upsertDocument(..., undefined)` store `null` on every store.
- **`findDocuments` `where` matches by top-level equality, as on memory:** `jsonb` containment (`@>`, which the GIN index serves) narrows the rows and `doc -> key = value` keeps exact matches only, so a nested object or array matches an equal one, not a superset. A key whose value is `undefined` matches object documents that lack the key. Documents come back ordered by `document_id` (code point) on both stores.
- **`runs.find` ties** on `createdAt` are broken by `id` (uuid order, reversed for `order: 'desc'`); time-ordered ids make that the creation order, as on memory.
