# @chamvi/test-kit

Test helpers for chamvi: a controllable clock, an engine on memory repositories, a data source for an app's database code, the repository port, knowledge repository and workspace contract suites, mock language and embedding models, a git fixture and an in-process fake GitHub. See [Testing](/guide/testing) for how they fit together.

```bash
npm install --save-dev @chamvi/test-kit @chamvi/core vitest
```

`@chamvi/core` and `vitest` are peer dependencies; the workspace contract takes any `IWorkspace` of `@chamvi/sandbox`, typed structurally (`ContractWorkspace`), so the kit does not depend on `@chamvi/sandbox`.

## The repository port suites

The ports of `@chamvi/store` have a suite each, taking `{ name, create() }` (a fresh, empty repository per test): `describeRunRepositoryContract`, `describeStepRepositoryContract`, `describeCheckpointRepositoryContract` (`create` returns `{ runs, checkpoints }`), `describeEffectRepositoryContract`, `describeArtifactRepositoryContract`, `describeStateRepositoryContract` (`create` returns `{ entries, documents }`), `describeLockRepositoryContract`, `describeIdempotencyRepositoryContract`, `describeAgentRevisionRepositoryContract`, `describeConnectionRepositoryContract` (`create` returns `{ repository, locks }`, the lock repository whose rows the connection fence reads; `untilBlocked()` resolves once a statement waits for a row lock) and `describeConversationRepositoryContract` (`create` returns `{ repository, runs, checkpoints }`, the runs and checkpoints a conversation is referenced by; `untilBlocked()` as above).

<<< @/snippets/repository-contract.ts#contract

See [Writing a Repository](/repositories/writing-a-repository) for what the suites cover.

## createTestEngine

`createTestEngine(options)` returns an engine on memory repositories of one registry. Options are `EngineOptions` without the services, plus `clock` (default the system clock), `replicaOf: engine` (a second engine on the same services and clock; another `clock` is refused) and `conversationService: (service) => service`, which wraps the conversation service it built to inject a fault or a recorder. Its `connectionService` is on the same registry, fenced by the engine's `lockService`, and its `conversationService` too (its rows reference the engine's runs).

## createTestDataSource

```ts
function createTestDataSource(options: TestDataSourceOptions): Promise<DataSource>; // TestDataSourceOptions: { entities, url? }
```

A TypeORM data source for a spec of an app's [database](/guide/database) code, built as `databaseModule()` builds the app's: SQLite in memory by default, its tables synchronized from `entities` and guarded for concurrent callers as the app's SQLite data source is; with `url`, a new database of its own on that PostgreSQL server (its user may create databases), synchronized too and dropped again by `destroy()`. Each call is a database of its own; the caller destroys it. A `url` that is not `postgres:` or `postgresql:` is refused without echoing it. Nothing is loaded before the first call. `typeorm` and the driver (`better-sqlite3` or `pg`) are optional peer dependencies; `@chamvi/store-db` is in no dependency field of the kit: it is loaded by a variable specifier, through the kit's own resolution first, then from the app's folder, and when neither finds it the error names it as the package to add to the app's devDependencies.

## describeWorkspaceContract

```ts
function describeWorkspaceContract(name: string, factory: WorkspaceContractFactory, options?: WorkspaceContractOptions): void;

type WorkspaceContractFactory = (input?: { runId?: string }) => Promise<ContractWorkspace>; // every IWorkspace is a ContractWorkspace
type WorkspaceContractOptions = { find?: (runId: string) => Promise<ContractWorkspace[]> };
```

Registers the Vitest suite every sandbox provider's workspaces must pass: argv exec and exit codes (127 for a command that cannot start), stdin, `cwd` and path escapes (`../..`, `/etc`, an empty path, a NUL byte), the 64 KiB output caps under a flood, a process-group kill on timeout that takes a backgrounded grandchild with it, abort, UTF-8 files and their size cap, and dispose during an exec. `factory` returns a fresh, repo-less workspace per test (of `input.runId` when given); the suite disposes it. With `find` (a second provider instance's `find`, like a restarted process) it also creates a workspace, drops the handle and expects `find` to return it with its files. It runs real processes with short real timeouts, not a `ControllableClock`.

```ts
describeWorkspaceContract('local', () => createLocalSandbox().create({ runId: 'r1' }));
```

## describeKnowledgeRepositoryContract

```ts
function describeKnowledgeRepositoryContract(name: string, create: KnowledgeRepositoryContractFactory): void;

type KnowledgeRepositoryContractFactory = () => ContractKnowledgeRepository | Promise<ContractKnowledgeRepository>; // every IKnowledgeRepository is one
```

Registers the Vitest suite every [`@chamvi/knowledge`](/reference/knowledge) repository must pass: collections (upsert, copies in and out, `Date` fields revived, code-point order), documents and chunks per generation (refused without their collection), `deleteGeneration` and `deleteGenerationsExcept`, and the cosine search (ranking, `topK`, `minScore`, the generation, ties by document and index). The types are structural, so the kit does not depend on `@chamvi/knowledge`.

## mockEmbeddingModel

```ts
function mockEmbeddingModel(options?: { dimensions?: number }): MockEmbeddingModel; // calls: every doEmbed call
```

An AI SDK embedding model without a provider: a hashed bag of words, normalized, 64 dimensions by default (1 to 8192), so texts sharing words score close. `calls` records each call's values.

## createGitFixture

```ts
function createGitFixture(files: Record<string, string>): Promise<GitFixture>;
```

<<< ../../../test-kit/src/git-fixture/types.ts{ts}

A temporary repository with one commit of `files` on branch `main`, tagged `v1`, ignoring the machine's git config. Pass `url` to a workspace manager with `allowFileRepos: true`.

## createFakeGithub

```ts
function createFakeGithub(options: FakeGithubOptions): FakeGithub;

type FakeGithubOptions = { appId: string; slug?: string; clock: IClock };
```

An in-process GitHub for `createGithubApp({ fetch: fake.fetch, privateKey: fake.privateKey })` from [`@chamvi/github`](/reference/github). It generates an RSA key pair, verifies App JWTs (RS256, `iss`, at most 600 s) on `/app*` and installation tokens (valid one hour on `clock`) on every other route, and answers 404 for unknown routes. Issues, comments, labels, pull requests, contents and releases live in mutable maps (`issues`, `comments`, `labels`, `pulls`, `files`, `releases`, keyed `owner/repo#number` or `owner/repo`); the comment list honours `since` (by `updated_at`) and paginates with a `link` header. Repositories (`repositories`, a missing one synthesized public with default branch `main`), the App's installations (`appInstallations`, `GET /app/installations` with the App JWT), check runs and commit statuses (`checkRuns`, `statuses`, keyed `owner/repo@<sha>`, the combined status state derived) and branch protection and rules (`branches`, `rules`, keyed `owner/repo:<branch>`, unprotected when missing) back the repository, issue and pull request lists, issue and pull request creation (the next number, as the bot; `422` for a second open pull request of one head and base), the merge (`409` when `sha` is not the head, `405` once merged or not mergeable) and `GET /installation/repositories` (the `installations` entries of the token's installation).

| Member | Purpose |
|---|---|
| `fetch` | The fake `fetch` to hand to `createGithubApp` |
| `privateKey`, `publicKey` | The App's key pair (PKCS#1 PEM, `KeyObject`) |
| `requests` | Every request (`method`, `path`, `query`, `body`, `authorization`), in order |
| `jwtClaims`, `tokensIssued`, `tokenInstallations` | The accepted JWTs and the issued installation tokens |
| `route(method, path, handler)` | Adds or overrides a route (`:name` one segment, `*name` the rest) |
| `failNext(method, path, status)` | The next matching request answers `status`, once |

A request whose `signal` aborts, also while a route handler is pending, rejects with the signal's reason, as Node's `fetch` does. It never touches the network.

## ControllableClock

```ts
class ControllableClock implements IClock {
    constructor(start?: Date | number); // default 0
    now(): number; // epoch milliseconds
    setTimeout(fn: () => void, ms: number): ClockTimer; // { clear }, no unref
    advance(ms: number): void;
}
```

Time moves only through `advance(ms)`, which fires every timer due within the window in order, including timers scheduled by fired callbacks. Its timers have no `unref()`: without a real event loop nothing holds a process.

<<< @/snippets/testing.ts#clock

Pass the same clock to the services and to the engine (`createTestEngine({ clock })` does both) to test claim leases, run timeouts and approval expiry without real timers.
