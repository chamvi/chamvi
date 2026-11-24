# Stores and repositories

Runs, steps, checkpoints, effect results, artifacts, agent state, locks, idempotency keys, tool-limit uses and agent revision markers sit behind services: the engine receives a `RunService` (`runService`), a `StepService` (`stepService`), a `CheckpointService` (`checkpointService`), an `EffectService` (`effectService`), an `ArtifactService` (`artifactService`), a `StateService` (`stateService`), a `LockService` (`lockService`), an `IdempotencyService` (`idempotencyService`) and an `AgentRevisionService` (`agentRevisionService`) that hold every rule (lineage, the update guards, `updatedAt`, the claim lease, the list queries, the highest checkpoint, insert-if-absent artifacts, the keyed artifact that keeps its id, the lease and claim expiry) over the repository ports of `@chamvi/store`. A port only stores, reads, locks a row and runs a query:

| Port (`@chamvi/store`) | Holds | Implementations |
|---|---|---|
| `IRunRepository` | Runs: the generic entity port (`findOneById`, `findMany(query)`, `create`/`save`, `transaction(fn)`, ...) plus `findByWaitKind(kind, query)` | `MemoryRunRepository` (`@chamvi/store-memory`), `DatabaseRunRepository` (`@chamvi/store-db`) |
| `IStepRepository` | Append-only steps per run | `MemoryStepRepository`, `DatabaseStepRepository` |
| `ICheckpointRepository` | One checkpoint row per run | `MemoryCheckpointRepository`, `DatabaseCheckpointRepository` |
| `IEffectRepository` | Recorded effect results by key (`upsert` replaces by key) | `MemoryEffectRepository`, `DatabaseEffectRepository` |
| `IArtifactRepository` | Files of a run: metadata, plus `readData(id)` for the bytes | `MemoryArtifactRepository`, `DatabaseArtifactRepository` |
| `IStateRepository`, `IStateDocumentRepository` | Per-agent keys and collection documents, plus `findContaining(agent, collection, where, page)` | `MemoryStateRepository`, `MemoryStateDocumentRepository`, `DatabaseStateRepository`, `DatabaseStateDocumentRepository` |
| `ILockRepository` | Keyed leases (`Lock`: `key`, `owner`, `expiresAt`, `token`), plus `removeExpiredBy(time)` and `nextToken()` (a fencing token strictly above every one issued before, for any key, and at least the wall clock in microseconds); `LockService` takes over an expired lease and reads the clock after the locked row, and `acquire` resolves the lease's token (`undefined` when refused) | `MemoryLockRepository`, `DatabaseLockRepository` |
| `IIdempotencyRepository` | Intake keys (`IdempotencyKey`: `scope`, `key`, `runId`, `expiresAt`), plus `removeExpiredBy(time)`; `IdempotencyService.claim`: the first caller wins | `MemoryIdempotencyRepository`, `DatabaseIdempotencyRepository` |
| `ILimitRepository` | Counted tool-limit uses (`LimitUse`: `scope`, `key`, `weight`, `expiresAt`, unique by `(scope, key)`), plus `removeExpiredBy(time)`; `LimitService` (optional `limitService` of the engine): `used`, `record` (insert-if-absent), `purgeExpired` | `MemoryLimitRepository`, `DatabaseLimitRepository` |
| `IAgentRevisionRepository` | One revision marker per [folder agent](/guide/agent-folders) (`AgentRevisionRecord`: `{ agent, hash, changedAt }` and its storage `id`, no code); `AgentRevisionService`: `findOne`, `save` (upsert by agent), `delete` (a missing one is a no-op), `find` (agent code-point order) | `MemoryAgentRevisionRepository`, `DatabaseAgentRevisionRepository` |
| `IConnectionRepository` | Connection rows (`ConnectionRecord`: sealed entries and the wrapped data key, never a plaintext or a key) with `entries` and `secrets` as child repositories bound to its transactions, plus `findFence(lock)`, the lease's lock row read locked after the connection row. `ConnectionService` (optional, `connectionService`) holds every rule | `MemoryConnectionRepository`, `DatabaseConnectionRepository` |
| `IConversationRepository` | Conversation rows (scope id, identity key, generation, active run and its snapshot) with `items`, `notes` and `operations` as child repositories bound to its transactions; `CONVERSATION_ITEM_STORED_ORDER` sorts items in transcript order. `ConversationService` (optional, `conversationService`) holds every rule: `resolve`, `beginTurn`, `endTurn`, `prepareEmit`, `confirmEmit`, `applyNote`, `reset`, `delete`, `prune`, and the reads | `MemoryConversationRepository`, `DatabaseConversationRepository` |

There is no store aggregate: the engine takes each service by name. Every service has an interface (`IRunService`, `IStepService`, ..., `IConversationService`), and the engine, the channels and the HTTP API are typed by it: any object that satisfies the interface can stand in for the class, with or without a repository behind it (a fake in a test, a wrapper that records or fails calls). `createConnectionVault()` takes the connection service and a `lockService` on the same lock storage, e.g. for the [WhatsApp session store](/deployment/whatsapp#session-store). Pass the services as `new Engine({ runService, stepService, checkpointService, effectService, artifactService, stateService, lockService, idempotencyService, agentRevisionService, conversationService, agents })`; use `engine.runService.findOne(id)` or `engine.stateService.findOne(agent, key)` for direct access. Conversation storage alone does not enable memory: configure `conversations: { authorize, limits? }` on the engine and opt agents in.

## Updating existing callers

The [upgrade guide](/guide/upgrading) lists every renamed and removed storage export with its replacement.

## Query methods

`findOne(...)` returns one record or `undefined`. `find(...)` returns the repository's existing collection shape: run queries return `{ data, total }`, while steps, artifacts, state and agent revisions return arrays. Conversation item/note queries return `{ data, total }` through `findItems` and `findNotes`.

The matching `OrFail` method returns the same result when it exists. `findOneOrFail(...)` throws for `undefined`; stored state values such as `null`, `false`, `0` and `''` are valid results. `findOrFail(...)` throws when the selected array or page is empty, including a run query with `limit: 0` or an offset beyond the last result even when `total` is nonzero. Query validation is unchanged: conversation queries require `limit >= 1`, so their `limit: 0` is a validation error. Qualified queries follow the same rule: `findDocumentsOrFail`, `findItemsOrFail`, `findNotesOrFail` and `findOneNoteOrFail`.

A missing single run or artifact uses `RunNotFoundError` or `ArtifactNotFoundError`; other missing repository results use `RepositoryNotFoundError`. Backend failures and validation errors pass through unchanged. Leases and mutations retain their domain operations, such as `claim`, `renewClaim` and `beginTurn`.

```ts
const run = await engine.runService.findOneOrFail(runId);
const { data, total } = await engine.runService.find({ agent: run.agent, limit: 20 });
const artifacts = await engine.artifactService.find(runId);
```

## Rules every repository keeps

A repository stores, reads, locks a row and runs a query; it decides nothing. The [port suites](/repositories/writing-a-repository#prove-it-with-the-contract-suite) check each rule on your backend.

1. **Store as given.** No status, owner or revision compare, no limit, default, time stamp, derived field or choice of domain error, and no clock: the services decide and hand the repository the finished row.
2. **No aliasing.** Values are copied in and out. Mutating an object after passing it to a repository, or one a repository returned, never changes what it holds.
3. **Transactions.** `transaction(fn)` hands `fn` a repository bound to the transaction; a single-row read there (`findOneById`, `findOneBy`) locks the row until the transaction ends, so two callers never interleave between a read and its save, also across processes. A throw rolls everything back.
4. **Six storage errors**, each with the entity's label and a fixed message, never a value: `EntityNotFoundError`, `EntityConflictError` (a taken key or unique value), `EntityRelationError` (a missing referenced row, or a removed row another references), `EntityDeadlockError`, `EntityQueryError` (a where with an `undefined` value, an empty `removeManyBy`, an operation the port does not offer), `EntityInvalidError` (a value the table refuses: a missing required column, a failed check, a value too long).
5. **Orderings the storage owns.** `findMany` sorts strings by code point (case sensitive); steps and conversation items keep a storage key in the order they were stored (`STEP_STORED_ORDER`, `CONVERSATION_ITEM_STORED_ORDER`).

## Rules the services keep

1. **One expiry rule.** A claim, key or lock created at time `T` with `ttlMs` is expired at exactly `T + ttlMs` and can be taken over at that instant.
2. **Time comes from the clock.** Every service that compares time takes an `IClock` and reads it after its locked read, never the database's clock, so tests can drive time and replicas agree on one rule.
3. **Atomic means atomic across callers.** `runService.create`, `runService.claim`, `runService.renewClaim`, `idempotencyService.claim`, `lockService.acquire`, `artifactService.create` and `artifactService.save` hold under concurrency, also across processes.
4. **Ordering.** `runService.find` orders by `createdAt` ascending, ties broken by `id` ascending, or both descending with `order: 'desc'` (newest first); `total` ignores `limit` and `offset`. `artifactService.find` orders the same way. `agentRevisionService.find` orders by agent name in code-point order.
5. **Guards throw.** `runService.update` throws `InvalidRunStateError` when `expectStatus` does not match, or when `expectOwner` is given and the claim is absent or held by another owner (expiry is not checked there: a lease is lost once taken over), or when `expectWaitId` is given and the run's wait id differs or it has no wait point. It throws `RunNotFoundError` for an unknown run.
6. **Checkpoints.** `checkpointService.save` keeps the highest `stepIndex`; an equal index replaces.
7. **State filters.** `stateService.findDocuments` `where` matches top-level fields by equality and lists by document id in code-point order.
8. **Run references.** `stepService.create`, `checkpointService.save` and `conversationService.beginTurn` for a run the store does not hold throw `RunNotFoundError` and write nothing (the repository reports `EntityRelationError`).
9. **Artifacts.** `artifactService.create` resolves `false` and keeps the stored metadata and bytes when the id exists, or when `key` is given and the run already holds an artifact under that key. `artifactService.save` is an atomic upsert by `(runId, key)` and resolves the stored metadata: an absent key inserts the artifact as given, an existing one keeps its `id`, `agent` and `createdAt` and replaces `mediaType`, `filename` (a missing one removes it), `size` and the bytes. The key is private to the store: no read returns it, and `findOneByKey(runId, key)` is the only lookup by it. `read` returns a plain `Uint8Array` (no `Buffer` or other subclass); `findOne` and `find` return metadata only.

## The interfaces

<<< ../../../store/src/entity/types.ts{ts}

## Store implementations

| Store | Package | Status |
|---|---|---|
| [Memory repositories](/repositories/memory) | `@chamvi/store-memory` | Shipped. Development and tests |
| [Database (store-db)](/repositories/database) | `@chamvi/store-db` | Shipped. PostgreSQL, production |

Redis is never required. Any store whose repositories pass the [port suites](/repositories/writing-a-repository) of `@chamvi/test-kit` works with the engine.
