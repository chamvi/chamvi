# Writing a Repository

Implement the capability interfaces from `@chamvi/core` and assemble them into a plain `IStore` object. Pass it to `new Engine({ store, agents })`. A backend can expose its own assembly factory, as `createMemoryStore()` and `createDatabaseStore()` do.

## Persist run taint

`Run.taint` is optional and has shape `{ at: Date; source: string }`. Persist it on insert and update, preserve it on unrelated updates, return independent copies, and hydrate `taint.at` as a `Date` on every read, including claims/recovery paths. Do not silently drop it when selecting run columns or serializing JSON. Missing taint remains absent, not an empty object.

The engine owns monotonic, first-write taint: it keeps the first exposure's timestamp/source, shares the persistence write across parallel tool calls, and does not clear it on replay, extraction or dispatch. This is an engine invariant, **not** a new repository compare-and-set API or a claim that arbitrary direct store writes cannot overwrite it. Custom stores must durably apply that field through the normal guarded run updates before untrusted results can be exposed.

For `@chamvi/store-db`, apply migration `ConversationsRunTaint1792713600000` (bundled in 0.4 with the conversation tables), which adds nullable `chamvi_runs.taint` JSONB. It conservatively backfills legacy unfinished runs (`queued`, `running`, `waiting`, `interrupted`) with `{ at: <migration time>, source: 'migration:legacy-run' }`: their old checkpoints may already contain unclassified content. Terminal legacy runs remain untainted. Custom backends need equivalent schema support and unfinished-run backfill before resuming pre-upgrade work; otherwise old content can bypass the new gate. Do not infer trust from an absent field on a legacy unfinished run.

### Upgrade without mixed versions

This upgrade does **not** support rolling deployments with old and new runtimes sharing a store:

1. Stop **all old ingress, workers and approval pollers** on every replica, including scheduled jobs. Wait for them to exit; draining executions alone is not sufficient if an old process can still poll or accept input.
2. Run the migration and unfinished-run backfill while all old processes are stopped.
3. Start **only new binaries** against the migrated store.

The full procedure for an app (CronJobs, `CHAMVI_MIGRATE`, `chamvi migrate`) is on [Upgrading to 0.4](/guide/upgrading#upgrading-to-0-4).

An old approval poller can publish the private argument-bearing `waiting.body` from a new automatic gate instead of its safe notification. An old worker can also create or checkpoint untainted runs after the one-time backfill. A notification lock does not make mixed versions compatible. Custom backends must follow the same stop/backfill/start sequence. See [Multiple replicas](/deployment/replicas#upgrading-to-untrusted-content-gates).

## Run references

New in 0.4: `steps.insert`, `checkpoints.save` and `conversations.beginTurn` must refuse a run the store does not hold. Check that the run exists (or map your backend's foreign key violation) and throw `RunNotFoundError` from `@chamvi/core` without writing anything. `describeRepositoryContract()` has a case for each, so a store that passed the 0.3 contract fails it until it does this.

```ts
async insert(step: Step): Promise<void> {
    if (!(await this.runs.findOne(step.runId))) {
        throw new RunNotFoundError(step.runId);
    }
    // write the step
}
```

Match a foreign key violation on structured fields (an error code and the constraint name), never on the message text: PostgreSQL translates it by `lc_messages`.

## Lineage and wait points

New in 0.6, for [dispatch](/guide/dispatch):

- **`parentRunId`.** `runs.insert` sets `Run.parentRunId` from `trigger.parent.runId` and ignores a `parentRunId` the caller passes. A parent the store does not hold throws `RunNotFoundError` and writes nothing (Postgres: a self foreign key). Persist it as its own indexed field: `find({ parentRunId })` lists a run's children.
- **`subtreeUsage`.** Optional `Usage`, written by the engine through `update`; persist and copy it like `usage`. `update(id, patch, { keepUpdatedAt: true })` keeps the stored `updatedAt` when the patch sets none (the engine uses it for this derived field).
- **`ids`.** `find({ ids })` returns only those runs (an empty list matches none), combined with the other filters, in the usual order.
- **`expectWaitId`.** `update` throws `InvalidRunStateError` when `expectWaitId` is given and the run has no wait point or its wait id differs, so two answers of different waits never cross. The wait id is `waiting.id`, else `waiting.approvalId` (`waitIdOf()`): an approval stored before 0.6 has no `id`.
- **Both wait point kinds.** `run.waiting` is an `ApprovalWaitPoint` (`kind: 'approval'`) or a `DispatchWaitPoint` (`kind: 'dispatch'`, `runIds`). Store it as it is, revive `expiresAt` (and an approval's `notifiedAt`) as `Date` for both, and pass every wait point you read through `normalizeWaitPoint()` from `@chamvi/core`, which gives a legacy approval its `id`.

## Prove it with the contract suite

`@chamvi/test-kit` ships `describeRepositoryContract`, the Vitest suite every store must pass. It is the same suite `createMemoryStore()` runs.

```bash
npm install --save-dev @chamvi/test-kit vitest
```

<<< @/snippets/repository-contract.ts#contract

The factory gets a fresh `ControllableClock` per test and must return a fresh, empty store that uses that clock for every expiry decision. The factory may be async, for example to create a database schema.

The suite covers:

- atomicity under concurrency: parallel `idempotency.claim`, `runs.claim`, `locks.acquire` and `runs.insert` calls have exactly one winner,
- expiry: keys, claims and locks expire after their TTL, and exactly at `expiresAt` they count as expired,
- `update` guards: `expectStatus` (one or several allowed statuses), `expectOwner` and `expectWaitId` (with the `approvalId` fallback), `RunNotFoundError` for a missing run, untouched fields preserved,
- `claim` and `renewClaim` on a missing run resolve `false`,
- lineage: `parentRunId` set from the envelope and refused for an unknown parent, `subtreeUsage` round trips, both wait point kinds with their dates revived, a legacy approval wait point read back with its `id`,
- checkpoints: the highest `stepIndex` wins, an equal index replaces,
- locks: exclusive, released by their owner only, taken over after expiry,
- `find` filters (`agent`, `status`, `concurrencyKey`, `ids`, `parentRunId`), `total`, and the `createdAt`/`id` order in both directions (`order: 'asc' | 'desc'`),
- effect and state round trips, including `where` filters,
- artifacts: insert-if-absent, metadata and bytes round trips, copies, the `createdAt`/`id` order, unknown ids,
- agent revisions: upsert, delete (also of a missing marker), the code-point order of `find`, copies with `changedAt` revived as a `Date`,
- `OrFail` results: missing records, empty pages, present falsy values and unchanged successful results,
- no aliasing of values passed in or returned.

## Implementation notes

- **Do atomic work in one statement.** In SQL, a conditional `UPDATE ... WHERE ... RETURNING` or `INSERT ... ON CONFLICT` instead of a read followed by a write in JavaScript.
- **Pass the clock's time in.** Compare against `clock.now()` passed as a parameter, not the database's `now()`.
- **Read old envelopes.** Pass a stored envelope through `normalizeEnvelope()` from `@chamvi/core`: runs written before channels existed hold `source` and `thread`, which read back as `channel` and `address` (`run.address` likewise from a stored `thread`).
- **Revive dates.** `Run`, `Step`, `Checkpoint` and `WaitPoint` carry `Date` values (`createdAt`, `trigger.receivedAt`, `waiting.expiresAt`, `claim.expiresAt`, ...). Return them as `Date` objects.
- **Store messages as they are.** Checkpoint messages are AI SDK `ModelMessage` arrays; store them as JSON without reshaping.
- **Only the latest checkpoint is read.** Keeping older ones is optional.
- **Keep artifact bytes apart from their metadata.** `findOne` and `find` should not load the bytes; only `read` needs them. Checkpoints refer to artifacts by id, never carry their bytes.

## Time in tests

`ControllableClock` implements `IClock` and moves only when you call `advance(ms)`, firing due timers in order. Pass the same clock to the store and to the engine to test leases, timeouts and approval expiry without real timers. See the [test-kit reference](/reference/test-kit).
