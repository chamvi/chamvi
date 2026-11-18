<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo-test-kit.svg" alt="@chamvi/test-kit" width="128" height="128" />
</p>

<h1 align="center">@chamvi/test-kit</h1>

<p align="center">
    <b>Test helpers for chamvi: a controllable clock, the repository and workspace contract suites, a git fixture and an in-process fake GitHub.</b>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/test-kit"><img src="https://img.shields.io/npm/v/@chamvi/test-kit" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/test-kit/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/test-kit" alt="License" /></a>
</p>

---

## Installation

```bash
npm install --save-dev @chamvi/test-kit @chamvi/core ai vitest
```

`@chamvi/core`, `ai` (v7) and `vitest` are peer dependencies; `typeorm`, `pg` and `better-sqlite3` are optional ones, needed by `createTestDataSource()` only. The workspace contract takes any `IWorkspace` of `@chamvi/sandbox` (typed structurally as `ContractWorkspace`, so the kit does not depend on `@chamvi/sandbox`).

## Usage

### Scripted models

`mockModel(responses)` provides one scripted AI SDK model for generation and streaming. Each `MockResponse` contains text or tool-call `parts` and optional token usage. `textModel(text)`, `approvalModel(toolName, input)` and `failingModel()` cover common test flows.

```ts
import { textModel } from '@chamvi/test-kit';

const model = textModel('done');
```

### Repository contracts

The repositories behind services prove their ports with `describeRunRepositoryContract({ name, create })`, `describeStepRepositoryContract`, `describeCheckpointRepositoryContract`, `describeEffectRepositoryContract`, `describeArtifactRepositoryContract`, `describeStateRepositoryContract`, `describeLockRepositoryContract`, `describeIdempotencyRepositoryContract`, `describeAgentRevisionRepositoryContract`, `describeConnectionRepositoryContract` (its input returns the connection repository and the lock repository whose rows its fence reads) and `describeConversationRepositoryContract` (its input returns the conversation repository and the run and checkpoint repositories that reference it or that it references): rows stored as given, the queries the services build, `findByWaitKind` and `findContaining`, `upsert` by a natural key keeping the stored id, the bytes of an artifact apart from its metadata, `removeExpiredBy` and its boundary (the lock, idempotency, connection and conversation inputs require `untilBlocked()`, resolving once a statement waits for a row lock: two microtask turns in process, a look at the database for a driver whose statements run elsewhere), row locks that serialize writers without blocking the rows referencing a run, child repositories bound to the root's transaction, the conversation item storage keys in the order items are stored, and the connection fence read waiting for a lock transaction in flight:

```typescript
import {
    MemoryCheckpointRepository,
    MemoryConversationRepository,
    MemoryRegistry,
    MemoryRunRepository,
} from '@chamvi/store-memory';
import { describeConversationRepositoryContract } from '@chamvi/test-kit';

describeConversationRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            repository: new MemoryConversationRepository({ registry }),
            runs: new MemoryRunRepository({ registry }),
            checkpoints: new MemoryCheckpointRepository({ registry }),
        };
    },
    async untilBlocked() {
        await Promise.resolve();
        await Promise.resolve();
    },
});
```

### Test engine

`createTestEngine(options)` builds an `Engine` on memory repositories: the services (runs, steps, checkpoints, effects, artifacts, state, locks, idempotency keys) on one memory registry, on the engine's `clock` (default the system clock). Options are `EngineOptions` without the storage; `replicaOf: engine` builds a replica on another engine's store and services (two processes over one database, or a restart), `conversationService: (service) => wrapped` wraps the conversation service to inject a fault or a recorder. Seed and read through the engine's services (`engine.runService`, `engine.checkpointService`, `engine.stateService`, ...), before `start()` if needed. Its `engine.connectionService` is on the same registry, so its fence reads the leases of `engine.lockService`; its `engine.conversationService` too, so its rows reference the engine's runs.

### Test data source

`createTestDataSource({ entities, url? })` builds a data source for a spec of an app's database code as `databaseModule()` builds the app's own: SQLite in memory by default, guarded for concurrent callers as the app's is, or a new database of its own on the PostgreSQL server `url` names (dropped again by `destroy()`), its schema synchronized from `entities`. Each call is a database of its own; the caller destroys it. It loads `@chamvi/store-db`, `typeorm` and the driver (`better-sqlite3` or `pg`) on its first call, so importing the kit loads none of them. A service spec that needs no database runs the service on `MemoryEntityRepository` of `@chamvi/store-memory`, and the same spec on the app's database repository over `createTestDataSource()`.

### Controllable clock

`ControllableClock` implements `IClock` and only moves when told to, so engine timeouts, claim leases and approval expiry are tested without real timers:

```typescript
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';

const clock = new ControllableClock();
const engine = createTestEngine({ agents: [], clock });

clock.advance(60_000); // fires every timer due within the next minute, in order
```

### Workspace contract

Every sandbox provider proves its workspaces with the shared Vitest suite: argv exec and exit codes, stdin, `cwd` and path escapes, the 64 KiB output caps under a flood, process-group kills on timeout (a backgrounded grandchild included), abort, UTF-8 files and their size cap, and dispose during an exec. It runs real processes with short real timeouts, so the factory returns a fresh, repo-less workspace per test (the suite disposes it). With `find` (a second provider instance's, like a restarted process) it also drops a workspace's handle and expects `find` to return it with its files:

```ts
import { createLocalSandbox } from '@chamvi/sandbox-local';
import { describeWorkspaceContract } from '@chamvi/test-kit';

const provider = createLocalSandbox();
describeWorkspaceContract('local', (input) => provider.create({ runId: input?.runId ?? 'contract' }), {
    find: (runId) => createLocalSandbox().find(runId),
});
```

`createGitFixture(files)` creates a temporary git repository with one commit of `files` on branch `main`, tagged `v1`, and returns `{ path, url, commit, cleanup }`; `url` is a `file://` URL for a manager with `allowFileRepos: true`.

### Fake GitHub

`createFakeGithub({ appId, slug?, clock })` is an in-process GitHub for `createGithubApp({ fetch })` from `@chamvi/github`: it generates an RSA key pair, checks App JWTs and installation tokens on `clock`, serves issues, comments, labels, pull requests, contents and releases from mutable maps, and never touches the network:

```ts
import { createGithubApp } from '@chamvi/github';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';

const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
const fake = createFakeGithub({ appId: '123', slug: 'my-app', clock });
const gh = createGithubApp({
    appId: '123',
    privateKey: fake.privateKey,
    webhookSecret: 'webhook-secret',
    slug: 'my-app',
    clock,
    fetch: fake.fetch,
});

fake.issues.set('octo/demo#7', { number: 7, title: 'Bug', state: 'open' });
fake.failNext('POST', '/repos/octo/demo/issues/7/comments', 502); // one injected failure
```

`route(method, path, handler)` adds or overrides a route (`:name` is one segment, `*name` the rest), `requests` records every request, `tokenInstallations` the installation of every issued token. A request whose `signal` aborts, also while a route handler is pending, rejects with the signal's reason, as Node's `fetch` does.

## API

| Export | Kind | Purpose |
|---|---|---|
| `ControllableClock` | class | `IClock` that advances only via `advance(ms)`; starts at `new Date(0)` unless given a date |
| `createTestEngine` | function | An `Engine` on memory repositories (see [Test engine](#test-engine)) |
| `mockModel`, `textModel`, `approvalModel`, `failingModel` | functions | Scripted AI SDK language models (see [Scripted models](#scripted-models)) |
| `mockEmbeddingModel` | function | A deterministic AI SDK embedding model without network; its calls are recorded in `calls` |
| `describeEntityRepositoryContract` | function | Vitest suite of an `IEntityRepository` driver, on a parent and a child fixture |
| `describeRunRepositoryContract`, `describeStepRepositoryContract`, ..., `describeConversationRepositoryContract` | functions | Vitest suite every port's repository must pass (see [Repository contracts](#repository-contracts)) |
| `describeKnowledgeRepositoryContract` | function | Vitest suite every `IKnowledgeRepository` of `@chamvi/knowledge` must pass |
| `describeWorkspaceContract` | function | Vitest suite every sandbox provider's `IWorkspace` must pass |
| `createTestDataSource` | function | A data source for an app's database specs: SQLite in memory (guarded) or a database of its own on a PostgreSQL server |
| `createGitFixture` | function | A temporary git repository with one commit (branch `main`, tag `v1`) |
| `createFakeGithub` | function | An in-process GitHub (App JWTs, installation tokens, repository routes) for `createGithubApp({ fetch })` |
| `testUuid` | function | A deterministic UUID-shaped id for a short ASCII label, ordered as the labels are |
| `fakeSkillRuntime` | function | A skill runtime provider that records its calls, for specs of the skill seam |

Types: `TestDataSourceOptions`, `ContractWorkspace`, `WorkspaceContractFactory`, `GitFixture`, `FakeGithub`, `FakeGithubOptions`, `FakeRequest`, `FakeRouteInput`, `FakeRouteResult`, `FakeRouteHandler`, `JwtClaims`.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
