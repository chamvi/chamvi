<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/store-memory" width="128" height="128" />
</p>

<h1 align="center">@chamvi/store-memory</h1>

<p align="center">
    <b>The in-memory store driver of chamvi.</b><br>
    A repository base for <code>@chamvi/store</code>'s port, with row locks, transactions and declared references.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/store-memory"><img src="https://img.shields.io/npm/v/@chamvi/store-memory" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/store-memory/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/store-memory" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [The aggregate repositories](#the-aggregate-repositories)
- [Transactions](#transactions)
- [License](#license)

## Installation

```bash
npm install @chamvi/store-memory --save
```

ESM only, Node.js `>=26.0.0`.

## Usage

`MemoryEntityRepository<T>` implements `IEntityRepository<T>` of `@chamvi/store`. Every repository of one process shares a `MemoryRegistry`: it holds the rows, the row locks and the declared references, so a reference is checked against the rows of the referenced entity's repository.

```ts
import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';

type Parent = { id: string; name: string };
type Child = { id: string; parentId: string };

const registry = new MemoryRegistry();

const parents = new MemoryEntityRepository<Parent>({
    entity: 'parent',
    registry,
    key: ['id'],
    unique: [['name']],
});

const children = new MemoryEntityRepository<Child>({
    entity: 'child',
    registry,
    key: ['id'],
    references: [{ field: 'parentId', entity: 'parent' }],
});

await parents.save(parents.create({ id: 'p1', name: 'first' }));
await children.save(children.create({ id: 'c1', parentId: 'p1' }));
```

- Rows are copied in and out (`structuredClone`): a read row is never the stored one.
- `findMany(query)` runs a rapiq query through `@rapiq/adapter-memory`, case sensitive. A field listed in `dates` (a `Date`, or an ISO string as a database date column with `dateToISOStringTransformer` reads) is filtered as the instant a value names, whatever its offset, as a database repository does; a value naming no instant is refused with `EntityQueryError`.
- `save` inserts an object from `create()` and updates an object from a read, writing only the properties changed since the read.
- A taken key or unique value is `EntityConflictError`; a missing referenced row, or removing a row another row references, is `EntityRelationError`.

## The aggregate repositories

`MemoryRunRepository`, `MemoryStepRepository`, `MemoryCheckpointRepository`, `MemoryEffectRepository`, `MemoryArtifactRepository`, `MemoryStateRepository`, `MemoryStateDocumentRepository`, `MemoryLockRepository`, `MemoryIdempotencyRepository`, `MemoryAgentRevisionRepository`, `MemoryConnectionRepository` (with `MemoryConnectionEntryRepository` and `MemoryConnectionSecretRepository` as its `entries` and `secrets`) and `MemoryConversationRepository` (with `MemoryConversationItemRepository`, `MemoryConversationNoteRepository` and `MemoryConversationOperationRepository` as its `items`, `notes` and `operations`; an item saved without an `id` gets the next storage key, in the order items are saved) implement the ports of `@chamvi/store` on one registry (a checkpoint references its run; effects, state and agent revision markers `upsert` by their natural key, keeping the stored id; an artifact row holds its key and bytes, which reads leave out): runs keyed by `id` with `parentRunId` referencing another run and `conversation.scope.id` a conversation, steps referencing their run and keyed by a storage `id` in creation order that reads leave out. A reference may name a nested field (`conversation.scope.id`, `source.runId`): the registry enforces it as a database's foreign key does, both ways (a conversation's items, notes, operations and active run reference runs; runs and checkpoints reference a conversation). `runs.has(id)` is a synchronous presence check of a committed run. The connection fence (`connections.findFence(lock)`) reads the `lock` rows of the same registry: inside a transaction it locks the row, so it waits for a lock transaction in flight; a connection repository fences with the leases of the lock repositories on its registry only. The services of `@chamvi/core` (`RunService`, `StepService`, `CheckpointService`, ...) hold the rules on them.

```ts
import { RunService, StepService, systemClock } from '@chamvi/core';
import { MemoryRegistry, MemoryRunRepository, MemoryStepRepository } from '@chamvi/store-memory';

const registry = new MemoryRegistry();
const runs = new MemoryRunRepository({ registry });
const runService = new RunService({ repository: runs, clock: systemClock });
const stepService = new StepService({ repository: new MemoryStepRepository({ registry }) });
```

## Transactions

`transaction(fn)` hands `fn` a repository bound to one transaction:

- inside `fn` only the handed-in repository is used: a write through the outer repository runs as a transaction of its own, and on a row the transaction holds it waits for `fn`, which waits for it, so neither ends;
- its writes stay invisible to other callers until `fn` resolves, and a rejected `fn` drops them all;
- a single-row read (`findOneById`, `findOneBy`) and every write lock the row until the transaction ends, so a second transaction on that row waits;
- a list read (`findMany`, `findManyBy`) locks nothing: a service that changes a row reads it with a single-row read first;
- a lock request that would close a cycle of waiting transactions fails at once with `EntityDeadlockError`;
- a storage error of a write aborts the transaction: it rolls back and rethrows that error, even when `fn` caught it; from then on it takes no lock and writes nothing, its waiting requests and every further call fail with that error;
- a rollback also restores the marks of the entity objects saved in it, so a retry inserts a created object again and writes a read object's change again;
- parallel calls of one transaction may wait for the same row; a transaction that ends drops its waiting requests;
- every call on the handed-in repository must be awaited before `fn` settles: a call that runs after the transaction ended is refused with `EntityDeadlockError`, never applied or lost silently;
- a nested `transaction()` joins the outer one;
- `upsertMany` and `removeManyBy` are the single-row operations in turn, inside the caller's transaction or one of their own: the same row and value locks, so a batch holds or waits for its rows as single writes do, and a rejected transaction restores them all.

## License

Published under [Apache License 2.0](./LICENSE).
