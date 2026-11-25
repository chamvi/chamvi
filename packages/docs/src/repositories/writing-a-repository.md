# Writing a Repository

Implement the repository ports of `@chamvi/store` and build the services of `@chamvi/core` on them; pass each service to `new Engine({ ..., agents })`. With `@chamvi/app`, a module named `ModuleName.STORE` that registers each repository under its token (`AppToken.RUN_REPOSITORY`, ...) replaces the built-in store module; the app builds the services from them.

## Persist run taint

`Run.taint` is optional and has shape `{ at: Date; source: string }`. Persist it on insert and update, preserve it on unrelated updates, return independent copies, and hydrate `taint.at` as a `Date` on every read, including claims/recovery paths. Do not silently drop it when selecting run columns or serializing JSON. Missing taint remains absent, not an empty object.

The engine owns monotonic, first-write taint: it keeps the first exposure's timestamp/source, shares the persistence write across parallel tool calls, and does not clear it on replay, extraction or dispatch. This is an engine invariant, **not** a new repository compare-and-set API or a claim that arbitrary direct store writes cannot overwrite it. Custom stores must durably apply that field through the normal guarded run updates before untrusted results can be exposed.

`@chamvi/store-db` holds it in the nullable `chamvi_runs.taint` JSONB column of its baseline migration `UuidBaseline1794096000000`, on a new database with no legacy runs to backfill. A custom backend that adds the field to existing data needs equivalent schema support and a conservative backfill before resuming pre-upgrade work: mark legacy unfinished runs (`queued`, `running`, `waiting`, `interrupted`) with `{ at: <migration time>, source: 'migration:legacy-run' }`, because their old checkpoints may already contain unclassified content, and leave terminal legacy runs untainted. Otherwise old content can bypass the new gate. Do not infer trust from an absent field on a legacy unfinished run.

### Upgrade without mixed versions

This upgrade does **not** support rolling deployments with old and new runtimes sharing a store:

1. Stop **all old ingress, workers and approval pollers** on every replica, including scheduled jobs. Wait for them to exit; draining executions alone is not sufficient if an old process can still poll or accept input.
2. Run the migration and unfinished-run backfill while all old processes are stopped.
3. Start **only new binaries** against the migrated store.

The full procedure for an app (CronJobs, `MIGRATE`, `chamvi migrate`) is on [Upgrading to 0.4](/guide/upgrading#upgrading-to-0-4).

An old approval poller can publish the private argument-bearing `waiting.body` from a new automatic gate instead of its safe notification. An old worker can also create or checkpoint untainted runs after the one-time backfill. A notification lock does not make mixed versions compatible. Custom backends must follow the same stop/backfill/start sequence. See [Multiple replicas](/deployment/replicas#upgrading-to-untrusted-content-gates).

## Run references

A repository reports a row that references a missing one as `EntityRelationError` (`@chamvi/store`) naming both labels, and writes nothing: a checkpoint, a conversation item, note or note operation of a missing run names `run`, a run or a checkpoint of a missing conversation names `conversation`. The services turn the run cases into `RunNotFoundError` (`CheckpointService.save`, `ConversationService.beginTurn`); a run or checkpoint bound to a missing conversation stays `EntityRelationError`. The port suites check each reference on your backend.

Match a foreign key violation on structured fields (an error code and the constraint name), never on the message text: PostgreSQL translates it by `lc_messages`.

## Runs and steps

For runs, steps, checkpoints, effects, artifacts and state a backend implements the ports `IRunRepository`, `IStepRepository`, `ICheckpointRepository`, `IEffectRepository`, `IArtifactRepository`, `IStateRepository` and `IStateDocumentRepository` of `@chamvi/store`, and the engine takes the services of `@chamvi/core` built on them (`describeCheckpointRepositoryContract`, `describeEffectRepositoryContract`, `describeArtifactRepositoryContract`, `describeStateRepositoryContract` of `@chamvi/test-kit` check each). The services hold every rule (lineage from `trigger.parent.runId`, the `expectStatus`/`expectOwner`/`expectWaitId` guards, `updatedAt`, the claim lease, the `find` filters, the read of legacy envelopes and wait points); a port only stores and reads:

- **The entity port.** `findOneById`, `findOneBy`, `findManyBy` (a where: a value, `null` or an array of values per property), `findMany(query)` (a rapiq query, case sensitive), `upsertMany` and `removeManyBy` (batches of any size, one transaction), `create`/`save` (insert or update by object identity, changed properties only), `transaction(fn)` with a row lock on a single-row read, and the six storage errors (`EntityNotFoundError`, `EntityConflictError` for a taken id, `EntityRelationError` for a missing parent run or run, `EntityDeadlockError`, `EntityQueryError`, `EntityInvalidError` for a value the table refuses). Extend `MemoryEntityRepository` (`@chamvi/store-memory`) or `EntityRepositoryAdapter` (`@chamvi/store-db`) rather than starting from scratch.
- **`findByWaitKind(kind, query)`.** `findMany(query)` restricted to runs whose `waiting.kind` is `kind`, with the query's filters, sort, pagination and total.
- **Store as given.** No normalization, no time stamp, no derived field: `parentRunId`, `trigger` and `waiting` are stored as the service hands them, dates revived as `Date`.
- **Steps have no public key.** Keep a storage key in insertion order (`id`) that reads never return, so `{ index, id }` sorts a run's steps in the order they were appended.

`describeRunRepositoryContract` and `describeStepRepositoryContract` from `@chamvi/test-kit` prove a port, the concurrent cases included.

## Prove it with the contract suite

`@chamvi/test-kit` ships a Vitest suite per repository port. This one proves a conversation repository, the aggregate with three child tables: it is the suite `MemoryConversationRepository` runs.

```bash
npm install --save-dev @chamvi/test-kit vitest
```

<<< @/snippets/repository-contract.ts#contract

`create()` returns a fresh, empty conversation repository with the run and checkpoint repositories of the same storage (the references run both ways); it may be async, for example to create a database schema. The suite covers storing as given (an item's `bytes` too: the service sets it, a repository never computes it), a sizes read that selects `id` and `bytes` without the text, the item storage keys in the order items are stored (`CONVERSATION_ITEM_STORED_ORDER`), unique natural keys, the references, the `items`, `notes` and `operations` child repositories bound to the root's transaction and rolled back with it, and a conversation row lock that holds off another transaction's locked read but not the insert of a row referencing it.

Every repository port has a suite of its own in `@chamvi/test-kit` (`describeRunRepositoryContract`, `describeLockRepositoryContract`, `describeAgentRevisionRepositoryContract`, `describeConnectionRepositoryContract`, `describeConversationRepositoryContract`, ...): storage behaviour only, the rules belong to the services of `@chamvi/core`.

## Implementation notes

- **Decide nothing.** The services compare statuses, owners and times and choose the errors; a repository stores what it is handed and reports the six storage errors. It takes no clock and never calls the database's `now()`.
- **Lock on a single-row read in a transaction.** `transaction(fn)` hands `fn` a repository bound to it; `findOneById` and `findOneBy` through it lock the row until the transaction ends (`FOR UPDATE`, or `FOR NO KEY UPDATE` for runs and conversations on PostgreSQL), so a service's read, check and save never interleave with another caller's.
- **Revive dates.** `Run`, `Step`, `Checkpoint` and `WaitPoint` carry `Date` values (`createdAt`, `trigger.receivedAt`, `waiting.expiresAt`, `claim.expiresAt`, ...). Return them as `Date` objects.
- **Sum limit uses in one read.** `ILimitRepository.sumWeight(scope, since)` resolves the summed `weight` of the uses of `scope` created strictly after `since` (0 when there is none), whatever the window; `removeCreatedBefore(time)` deletes the uses created at or before `time` and resolves how many. `describeLimitRepositoryContract` proves both boundaries.
- **Store messages as they are.** Checkpoint messages are AI SDK `ModelMessage` arrays; store them as JSON without reshaping.
- **Only the latest checkpoint is read.** Keeping older ones is optional.
- **Keep artifact bytes apart from their metadata.** `findOne` and `find` should not load the bytes; only `read` needs them. Checkpoints refer to artifacts by id, never carry their bytes.

## Register it with an app

Give `@chamvi/app` a module named `ModuleName.STORE` that registers each repository under its token (`AppToken.RUN_REPOSITORY`, `STEP_REPOSITORY`, `CHECKPOINT_REPOSITORY`, `EFFECT_REPOSITORY`, `ARTIFACT_REPOSITORY`, `STATE_REPOSITORY`, `STATE_DOCUMENT_REPOSITORY`, `LOCK_REPOSITORY`, `IDEMPOTENCY_REPOSITORY`, `LIMIT_REPOSITORY`, `AGENT_REVISION_REPOSITORY`; `CONNECTION_REPOSITORY` and `CONVERSATION_REPOSITORY` optional) and, if it likes, `STORE_KIND`. Listed in `createApp({ modules })`, it replaces the built-in store module; the app builds every service from the registered repositories in the same setup step. A missing required token fails the setup with `InvalidAgentDefinitionError` naming it.

## Time in tests

`ControllableClock` implements `IClock` and moves only when you call `advance(ms)`, firing due timers in order. Pass it to the services and the engine (`createTestEngine({ clock })` does both) to test leases, timeouts and approval expiry without real timers. See [Testing](/guide/testing).
