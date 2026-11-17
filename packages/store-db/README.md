<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/store-db" width="128" height="128" />
</p>

<h1 align="center">@chamvi/store-db</h1>

<p align="center">
    <b>Database store for chamvi (PostgreSQL), with TypeORM repositories.</b><br>
    Runs, checkpoints, claims and state survive restarts, and several replicas<br>
    share one database without a leader.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/store-db"><img src="https://img.shields.io/npm/v/@chamvi/store-db" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/store-db/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/store-db" alt="License" /></a>
</p>

<p align="center">
    <a href="#installation"><b>Installation</b></a>
    ·
    <a href="#usage">Usage</a>
    ·
    <a href="#options">Options</a>
    ·
    <a href="#api">API</a>
    ·
    <a href="#notes">Notes</a>
</p>

---

## Why @chamvi/store-db?

The memory repositories of `@chamvi/store-memory` lose every queued run, waiting approval and checkpoint with the process, and they cannot be shared between replicas. This package's repositories keep the same aggregates in Postgres and pass the same port suites of `@chamvi/test-kit`, so the engine behaves the same on both.

| Concern | Memory repositories | Database repositories |
|---|---|---|
| **Restarts** | Everything is gone | Runs, steps, checkpoints, effects and state stay in Postgres; `recover()` picks interrupted runs up |
| **Replicas** | One process only | Claims, idempotency keys and locks are read with a row lock in a transaction (or inserted, a taken key reported as a conflict), atomic across processes |
| **Schema** | None | Versioned migrations, applied by `migrateStore()` under an advisory lock, so replicas booting at once migrate once |
| **Time** | From the injected `IClock` | From the injected `IClock` too, passed to every query as a parameter (never the database's `now()`) |
| **Housekeeping** | `purgeExpired()` of the lock and idempotency services deletes expired rows | The same, one `DELETE` per table |

## Installation

```bash
npm install @chamvi/store-db @chamvi/core typeorm pg
```

- ESM only, Node.js 26.0.0 or newer.
- `@chamvi/core`, `typeorm` (`^1.1.2`) and `pg` (`^8`) are peer dependencies.
- Postgres only.

## Usage

Create the data source with the store's entities and migrations, run the migrations, and build the repositories on it:

```typescript
import type { LanguageModel } from 'ai';
import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    EffectService,
    Engine,
    IdempotencyService,
    LockService,
    RunService,
    StateService,
    StepService,
    defineModelAgent,
    systemClock,
} from '@chamvi/core';
import {
    DatabaseAgentRevisionRepository,
    DatabaseArtifactRepository,
    DatabaseCheckpointRepository,
    DatabaseEffectRepository,
    DatabaseIdempotencyRepository,
    DatabaseLockRepository,
    DatabaseRunRepository,
    DatabaseStateDocumentRepository,
    DatabaseStateRepository,
    DatabaseStepRepository,
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    migrateStore,
} from '@chamvi/store-db';
import { DataSource } from 'typeorm';

export async function startEngine(model: LanguageModel) {
    const triage = defineModelAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue.',
    });

    const dataSource = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: STORE_ENTITIES,
        migrations: STORE_MIGRATIONS,
    });
    await dataSource.initialize();
    await migrateStore(dataSource);

    const engine = new Engine({
        // runs, steps, checkpoints, effects, artifacts, state, locks and idempotency keys: services over the database repositories
        runService: new RunService({ repository: new DatabaseRunRepository(dataSource), clock: systemClock }),
        stepService: new StepService({ repository: new DatabaseStepRepository(dataSource) }),
        checkpointService: new CheckpointService({ repository: new DatabaseCheckpointRepository(dataSource) }),
        effectService: new EffectService({ repository: new DatabaseEffectRepository(dataSource) }),
        agentRevisionService: new AgentRevisionService({ repository: new DatabaseAgentRevisionRepository(dataSource) }),
        artifactService: new ArtifactService({ repository: new DatabaseArtifactRepository(dataSource) }),
        stateService: new StateService({
            repository: new DatabaseStateRepository(dataSource),
            documentRepository: new DatabaseStateDocumentRepository(dataSource),
        }),
        lockService: new LockService({ repository: new DatabaseLockRepository(dataSource), clock: systemClock }),
        idempotencyService: new IdempotencyService({ repository: new DatabaseIdempotencyRepository(dataSource), clock: systemClock }),
        agents: [triage],
    });
    await engine.start();

    // the repositories never destroy the data source: drain first, then close it
    const shutdown = async () => {
        await engine.drain();
        await dataSource.destroy();
    };

    return { engine, shutdown };
}
```

- `migrateStore()` runs the pending migrations under the Postgres advisory lock `chamvi:migrations`. Several replicas may call it at once: they wait for each other and the migration is recorded once. Each call uses one pooled connection: it migrates on the connection that holds the lock.
- The repositories take the data source as it is and never initialize or destroy it.
- The database must exist. Create it beforehand, for example with `createDatabase()` from `typeorm-extension`.

### Housekeeping

Expired idempotency keys and locks are taken over by the next caller, so they never block anything, but they stay in their tables until purged:

```typescript
// e.g. every hour; clear the interval on shutdown
const purge = setInterval(() => {
    Promise.all([engine.idempotencyService.purgeExpired(), engine.lockService.purgeExpired()])
        .catch((e: unknown) => console.error(e));
}, 60 * 60 * 1000);
purge.unref();
```

Each service's `purgeExpired(now?)` deletes its rows expired at `now` (default: the clock's time, through the repository's `removeExpiredBy(time)`) and returns the number removed. Effects have no expiry and are never purged.

## Options

Each repository takes one argument, an initialized Postgres data source that lists `STORE_ENTITIES` and `STORE_MIGRATIONS` (or a manager of it). The repositories take no clock: the services of `@chamvi/core` do.

## API

| Export | Kind | Purpose |
|---|---|---|
| `migrateStore` | function | Runs the migrations under the advisory lock `MIGRATION_LOCK_NAME`; resolves with the names of those it ran |
| `applyQuery` | function | Applies a rapiq query to a TypeORM select query builder, as every repository's `findMany` does: field paths renamed (`fields`), a non-uuid value on a uuid column dropped, a value on a date-time column written as the driver stores it (the instant an ISO string with any offset names; one naming no instant is refused with `EntityQueryError`), matching case-sensitive, relations joined, the page set; `@rapiq/adapter-typeorm` loads on the first call. Decode a client's query with `decodeQuery` of `@chamvi/http` first |
| `validateEntitySchemas` | function | Checks list schemas (`defineSchema` of `@chamvi/http`) against their entities in an initialized data source: a field, filter, sort, default sort or key that is no column, or a relation that is no relation, is a `DatabaseOptionsError` naming the schema and the name. `databaseModule({ schemas })` runs it at start |
| `dateToISOStringTransformer` | constant | A date column's `transformer`: a `Date` reads and writes as its ISO 8601 UTC string, a string passes through |
| `STORE_ENTITIES` | array | The entity classes for the data source's `entities` |
| `STORE_MIGRATIONS` | array | The migrations for the data source's `migrations` |
| `MIGRATION_LOCK_NAME` | constant | `'chamvi:migrations'` |
| `buildDatabaseOptions`, `connectDatabase`, `synchronizeDatabase`, `closeDatabase`, `migrateDatabase`, `pendingDatabaseMigrations`, `findUntypedColumns`, `queueDataSource` | functions | An app's own database, used by `databaseModule()` of `@chamvi/app`: options without I/O (PostgreSQL pinned to UTC, else SQLite in memory; a URL that is not PostgreSQL, a migrations table that is no plain identifier, is `migrations` or starts with `chamvi_` or `typeorm_metadata`, no URL in production or to migrate are `DatabaseOptionsError`), connect (a better-sqlite3 data source is guarded for concurrent use, `queueDataSource`: one statement, transaction or whole operation at a time on its one connection, work inside a transaction joins it, and work that waits 30 seconds behind one open transaction is refused with `DatabaseBusyError`; an entity mistake is `DatabaseOptionsError` with TypeORM's message, as is a migration class without a timestamp in its name when migrating), synchronize (SQLite), close (after the work queued before it; behind a transaction that is never ended it closes at that deadline, which rolls the transaction back), migrate under an advisory lock of the app's into its own migrations table; failures are `DatabaseUnavailableError` (operation, driver code and a failing migration's class name only), a missing driver package `DatabaseDriverMissingError` |

Runs, steps, checkpoints, effects, artifacts, state, locks, idempotency keys and agent revision markers are repositories of the ports of `@chamvi/store`, built on `EntityRepositoryAdapter`: `new DatabaseRunRepository(dataSource)`, `DatabaseStepRepository`, `DatabaseCheckpointRepository`, `DatabaseEffectRepository`, `DatabaseArtifactRepository`, `DatabaseStateRepository`, `DatabaseStateDocumentRepository`, `DatabaseLockRepository`, `DatabaseIdempotencyRepository`, `DatabaseAgentRevisionRepository`, `DatabaseConnectionRepository` (its `entries` and `secrets` are `DatabaseConnectionEntryRepository` and `DatabaseConnectionSecretRepository` on the same manager in a transaction; `findFence` reads the lease's `chamvi_locks` row `FOR SHARE`) and `DatabaseConversationRepository` (its `items`, `notes` and `operations` are `DatabaseConversationItemRepository`, `DatabaseConversationNoteRepository` and `DatabaseConversationOperationRepository` on the same manager in a transaction; its locked read takes `FOR NO KEY UPDATE`), the repositories of the services (`@chamvi/core`). Use the same data source for all repositories so their foreign keys share one database.

The adapter keeps every statement below the driver's bind-parameter limit (65 535 on PostgreSQL, 32 766 on better-sqlite3): `upsertMany` sends one `INSERT ... ON CONFLICT` per chunk of rows (a new one where a key repeats), `removeMany` and a `findManyBy` or `removeManyBy` with a long array split it, and `removeManyBy` is one `DELETE ... WHERE` otherwise, however many rows it removes; several statements of one call outside a transaction run in one of their own (all or nothing). The kept primary key of an `upsertKey` row is matched by its upsert key (`RETURNING` on PostgreSQL, a read by the key on better-sqlite3).

## Notes

- **Tables are prefixed `chamvi_`:** `chamvi_runs`, `chamvi_steps`, `chamvi_checkpoints`, `chamvi_idempotency_keys`, `chamvi_locks`, `chamvi_effects`, `chamvi_kv`, `chamvi_docs`, `chamvi_artifacts`. They live in the data source's default schema.
- **Identifiers have length limits** (the memory repositories have none): run and artifact ids 128 characters; `concurrencyKey`, `address`, claim owners, step names, document collections and document ids 255; idempotency, lock, effect and state keys 512; idempotency scopes 1024 (`<agent>:<source>:<kind>:<id>` with the invoker URI-encoded, leaving about 950 characters for the encoded `kind` and `id`). A longer value makes the write fail with the driver's `value too long` error, so validate user-supplied keys before they reach `dispatch` (a rejected run with an `idempotencyKey` keeps its key reserved until the key expires).
- **Artifact bytes are `bytea`** in `chamvi_artifacts` (indexed by `run_id`), read only by `read`; `findOne` and `find` never load them. Postgres caps a `bytea` value at 1 GB, and the whole value travels in one query, so keep artifacts small enough for memory.
- **Only the latest checkpoint is kept** per run; an equal `stepIndex` replaces it.
- **Opaque values are JSON.** A run's `output`, a step's `input`/`output`/`error`, checkpoint messages, effect results and state values are stored as `jsonb`, so a `Date` inside them comes back as a string, `undefined` or `Map` values are lost and a typed array such as `Uint8Array` comes back as an object keyed by index. A `BigInt` or a circular structure makes the write throw a `TypeError` (the memory repositories accept both). The run's own dates, `trigger.receivedAt`, `waiting.expiresAt` and `waiting.notifiedAt` come back as `Date`.
- **NUL characters and lone surrogates become U+FFFD** in opaque values (keys and strings alike), because `jsonb` cannot hold them. A literal backslash sequence such as the text `\u0000` is kept.
- **`null` in an optional property reads back as absent:** a run `output` of `null` and a step `input`, `output` or `error` of `null` are stored as SQL `NULL`. `effectService.save(key, undefined)` and `upsertDocument(..., undefined)` store `null`, as on memory.
- **`findDocuments` `where` matches by top-level equality, as on memory:** `jsonb` containment (`@>`) narrows the rows through the GIN index and `doc -> key = value` keeps exact matches, so a nested object or array matches an equal one only. A key whose value is `undefined` matches object documents that lack the key. Documents are returned ordered by document id in code-point order, as on memory.
- **`ArtifactService.find` and run lists (`RunService.find`) sort `createdAt`, then `id`** through rapiq on both drivers, strings by code point.
- **`StateService.find` orders keys by byte order** (`chamvi_kv.key` is `COLLATE "C"`, migration `KvKeyCollation1792540800000`), the code-point order memory sorts by too.
- **The schema may still change before 1.0.** New versions ship new migrations; run `migrateStore()` on every boot.

## License

Published under [Apache License 2.0](./LICENSE).

Conversation memory uses the same PostgreSQL DataSource as runs. Foreign keys connect its active owner, transcript items, note sources and note-operation receipts to their runs. Run and checkpoint scope bindings reference the local conversation row. Checkpoints and steps require their parent run to exist. Existing orphan rows will block migration validation; migrations do not silently delete them.

Idempotency reservations and staged artifacts can precede their run row. A pending emit can also precede its effect receipt, and an uncertain send may never have one. These reserved identifiers intentionally have no immediate foreign key.
