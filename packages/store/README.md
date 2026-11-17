<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/store" width="128" height="128" />
</p>

<h1 align="center">@chamvi/store</h1>

<p align="center">
    <b>The storage contract of chamvi.</b><br>
    The stored record types, the generic entity repository port and the storage errors every store driver reports.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/store"><img src="https://img.shields.io/npm/v/@chamvi/store" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/store/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/store" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Stored records](#stored-records)
- [Repository port](#repository-port)
- [Errors](#errors)
- [License](#license)

## Installation

```bash
npm install @chamvi/store --save
```

ESM only, Node.js `>=26.0.0`. It names no database driver: a store package implements the port.

## Stored records

The shapes the store holds, shared by core, every store and the apps that read them: `Run` (with `RunStatus`, `Usage`, `RunTaint` and the `WaitPoint`s), `Step`, `Checkpoint`, `TriggerEnvelope` (with `Invoker`, `TriggerParent`, `TriggerSource`), `Artifact`, `ApprovalOption`, `AgentRevision`, `Connection` and the conversation records (`ConversationScope`, `ConversationItem`, `ConversationNote`, `ConversationSnapshot`, ...). `normalizeEnvelope()` and `normalizeWaitPoint()` read a legacy stored envelope or wait point back in the current shape. `Checkpoint` and `ConversationSnapshot` hold AI SDK `ModelMessage`s: `ai` is an optional peer dependency, needed for those types only.

## Repository port

`IEntityRepository<T>` is the port of one entity. A repository decides nothing: it stores, reads, locks a row, runs a query and reports a storage error; status compares, limits, defaults and time stamps belong to the service that uses it.

The aggregates' ports extend it: `IRunRepository` (with `findByWaitKind(kind, query)`, the one run query rapiq cannot express on every driver), `IStepRepository`, `ICheckpointRepository` (`CheckpointRecord`), `IEffectRepository` (`EffectRecord`), `IArtifactRepository` (`ArtifactRecord`: the metadata with the write-only `key` and `data`, plus `readData(id)`), `IStateRepository` (`StateEntry`), `IStateDocumentRepository` (`StateDocument`, plus `findContaining(agent, collection, where, page)`, the top-level document match rapiq cannot express on every driver), `IAgentRevisionRepository` (`AgentRevisionRecord`: the `AgentRevision` and its storage `id`, `agent` unique), `ILockRepository` (`Lock`: `key`, `owner`, `expiresAt`) and `IIdempotencyRepository` (`IdempotencyKey`: `scope`, `key`, `runId`, `expiresAt`), these two plus `removeExpiredBy(time)`, which deletes the rows expired at `time` and resolves how many, and `IConnectionRepository` (`ConnectionRecord`: the `Connection` with its storage `id`, `settings` and `configRevision`, `name` unique), whose child tables are repositories of their own, `entries` (`IConnectionEntryRepository` on `ConnectionEntryRecord`) and `secrets` (`IConnectionSecretRepository` on `ConnectionSecretRecord`), bound to the root's transaction, plus `findFence(name)`, the lease's `Lock` row read locked inside a transaction (it decides nothing), and `IConversationRepository` (`ConversationRecord`: the scope id, the identity's `key` (unique), the identity, the generation, the active run and its snapshot), whose child tables are `items` (`IConversationItemRepository` on `ConversationItemRecord`, its storage key `id` assigned in the order rows are stored: sort by `CONVERSATION_ITEM_STORED_ORDER`; `bytes`, the UTF-8 byte length of its text, set by the service and stored as given), `notes` (`IConversationNoteRepository` on `ConversationNoteRecord`) and `operations` (`IConversationOperationRepository` on `ConversationOperationRecord`), bound to the root's transaction. The services of `@chamvi/core` hold their rules.

- `findMany(query)` runs a rapiq `IQuery` and returns `{ data, meta: { total, limit?, offset? } }`.
- `findOneById(id)`, `findOneBy(where)` and `findManyBy(where)` read rows; a where (`EntityWhere<T>`) gives each property a value, `null` (a missing value) or an array (any of its values), however many values it holds.
- `create(data)` and `merge(entity, data)` build entity objects without storing anything.
- `save(entity)` decides by object identity: an object returned by `create()` is inserted (`EntityConflictError` when its key exists), an object returned by a read is updated. A spread copy of a created entity counts as an update.
- `upsert(entity)` inserts or replaces by key, without a condition; `upsertMany(entities)` does it for a batch in one transaction and as few statements as the driver allows (in input order; a later entity of one key replaces an earlier one); `remove(entity)` and `removeMany(entities)` delete; `removeManyBy(where)` deletes every row matching a where without reading them out and resolves the count.
- A where (`findOneBy`, `findManyBy`, `removeManyBy`) with a property set to `undefined`, and a `removeManyBy({})`, are refused with `EntityQueryError` before anything reaches the storage: omit a property to leave it out; there is no remove-all form. `findManyBy({})` lists every row.
- `validateRelations(data)` reports a missing referenced row as `EntityRelationError`, `checkUniqueness(data, existing?)` a taken unique value as `EntityConflictError`.
- `transaction(fn)` runs `fn` with a repository bound to one transaction: a single-row read on it (`findOneById`, `findOneBy`) locks the row until the transaction ends, a list read (`findMany`, `findManyBy`) locks nothing, so a service that changes a row reads it with a single-row read first. A throw rolls everything back, also the insert-or-update identity of the entity objects saved in it.

## Errors

| Class | `code` | Extra field |
|-------|--------|-------------|
| `EntityNotFoundError` | `entity_not_found` | |
| `EntityConflictError` | `entity_conflict` | |
| `EntityRelationError` | `entity_relation_invalid` | `relation`: the referenced entity |
| `EntityDeadlockError` | `entity_deadlock` | |
| `EntityQueryError` | `entity_query_invalid` | |
| `EntityInvalidError` | `entity_invalid` | `operation`, and `field`: the column or constraint the storage named, if any |

Each extends ebec's `BaseError`, takes the entity's label (`entity`) and has a fixed message: no error carries an id, a key or any stored value. The codes are `StoreErrorCode`.

## License

Published under [Apache License 2.0](./LICENSE).
