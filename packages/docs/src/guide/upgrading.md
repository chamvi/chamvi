# Upgrading

chamvi is pre-1.0: a minor release may break the API. Each section lists what changed and the exact replacement.

## Upgrading to 0.9

Connections can be configured in the dashboard, on a page per provider ([Connection pages](/guide/ui#connection-pages)). An env-only deployment keeps working: no existing variable changed, and `CHAMVI_ENCRYPTION_KEYS` is needed once the dashboard saves a connection, also one with plain settings only, since every stored connection has its own data key. The migration `ConnectionConfig1794230765000` adds the settings and secrets tables and runs like any other (`CHAMVI_MIGRATE`, `chamvi migrate`).

### Breaking changes

| Change | Before | Replacement |
|---|---|---|
| WhatsApp pairing | `@chamvi/ui` showed the QR on its Connections page | Add `chatWhatsappUiModule()` (`@chamvi/chat-whatsapp-ui/module`) to keep pairing; the QR is at `<uiBase>/ext/chat-whatsapp`. The generic Connections page keeps the status and Reset session |
| `githubModule()` with a missing required variable | The factory threw | The factory throws for a malformed value only. A partial env fails the start in `setup` naming the variable; nothing set starts idle (tools report not configured, webhooks answer 503) |
| `GITHUB_MODULE_NAME` (`@chamvi/github/module`) | The module's id | The prefix only: the id is `chamvi:github:<name>`, by default `chamvi:github:github`. Change a `dependencies` entry that named the old id |
| Permissions | Dynamic strings (`agent:<name>:run`, `run:read`, `connection:<name>:write`, `tool:<agent>:<tool>`, `*`) | Static names (`chamvi_agent_run`, ...) granted as authup permission bindings, a policy narrowing a grant to an agent or a connection. `CHAMVI_TOKENS` takes `"*"` or a list of bindings. See [Permissions and authup](/guide/permissions#upgrading) |
| `authup()` options (`@chamvi/http`) | `{ verifier }` | `{ verifier, catalog, realm }`; `authupModule()`'s client also needs `permission_read` (realm scope `ownOrNull` or wider) |
| `hasPermission`, `matchesPermission`, `toolPermission` (`@chamvi/core`), `agentPermission` (`@chamvi/http`, `@chamvi/app`) | String matching | `can()` and `canSome()` of `@chamvi/access` (re-exported by `@chamvi/app`) |
| `/knowledge` routes (`@chamvi/knowledge`) | `knowledge:read`, `knowledge:write` | `chamvi_knowledge_read`, `chamvi_knowledge_write` (covered by `"*"`), checked with `{ "name": "<collection>" }` when the path names one collection |
| `toolPolicy` | `(toolName, { run }) => boolean` | `(toolName, { run, now }) => boolean \| Promise<boolean>` (a synchronous policy keeps working) |

### New variables

Each is optional and names a field of a named instance; the default instance keeps its variables.

| Variables | Read by |
|---|---|
| `CHAMVI_GITHUB_<NAME>_APP_ID`, `_APP_PRIVATE_KEY`, `_WEBHOOK_SECRET`, `_INSTALLATION_ID`, `_APP_SLUG`, `_API_URL` | `githubModule({ name })` |
| `CHAMVI_DISCORD_*`, `CHAMVI_DISCORD_<NAME>_*` | [`discordModule()`](/deployment/discord#with-chamvi-app) |

### Steps

1. Add `chatWhatsappUiModule()` if the app uses `whatsappModule()`, and the other `*-ui` modules for the connections you want to configure in the dashboard.
2. Set `CHAMVI_ENCRYPTION_KEYS` if the dashboard will save connections.
3. A dashboard not at `/ui`: pass the same value as `uiBase` to every `*-ui` module.
4. Replace any reference to the old GitHub module id.
5. Drain the app before the upgrade, so no stored run carries an invoker with old permission strings; rewrite `CHAMVI_TOKENS` and the authup roles ([Permissions and authup](/guide/permissions#upgrading)).

## Upgrading to 0.8

The Postgres store (`@chamvi/store-db`) now gives every table a single `id` primary key, a time-ordered UUID v7 (the append-only steps and conversation items use a bigint). Run ids, artifact ids and, in Postgres, conversation scope ids are UUIDs. The eight earlier migrations are replaced by one baseline migration, and **an existing database cannot be upgraded in place: the new version needs a new, empty database.** The in-memory store is unaffected.

### Breaking changes

| Change | Before | Replacement |
|---|---|---|
| Database | Schema built by the eight earlier migrations | A new, empty database; the baseline `UuidBaseline1794096000000` creates the schema. Runs, steps, state, documents, artifacts and conversation memory of the old database are not carried over |
| `migrateStore(dataSource)` on an old database | Applied the pending migrations | Refuses it before changing anything, with an error (code `store_legacy_schema`) that names this guide |
| `chamvi start --check` on an old database | Exit 0 (with the default `CHAMVI_MIGRATE=true`) | Exit 1 with the same message, whatever `CHAMVI_MIGRATE` says |
| Run and artifact ids | Run ids from `randomUUID()`; artifact ids `<runId>.0000` for attachments and `<runId>.k.<hash>` for keyed puts | UUID v7 for both. Treat ids as opaque strings. A keyed `artifacts.put({ key })` keeps its stored id when a later put replaces it |
| `keyedArtifactId()` (`@chamvi/core`) | Exported | Removed. `IArtifactRepository.insert(artifact, data, key?)` and `save(artifact, data, key)` take a private key; `findOneByKey(runId, key)` looks one up. A custom store must implement them (`describeRepositoryContract()` checks it) |
| Malformed ids in the HTTP API | n/a | A run or artifact id that is not a UUID is a 404 on the database store, as for any unknown id |

### Steps

1. Create a new, empty Postgres database (a new database, not a new schema in the old one, keeps the rollback below simple).
2. Drain the old deployment: stop ingress and run-job CronJobs, and let in-flight runs settle or answer their approvals. Nothing from the old database is read by the new version.
3. Point `DATABASE_URL` at the new database and deploy the new version. With the default `CHAMVI_MIGRATE=true` the first start creates the schema; with `CHAMVI_MIGRATE=false`, run `chamvi migrate` first.
4. Check before switching traffic: `chamvi start --check` with the new `DATABASE_URL` exits 0. Pointed at the old database it exits 1 and prints the message that names this guide.

The old database is left untouched. To roll back, redeploy the previous chamvi version with the old `DATABASE_URL`; the old schema and its data are intact. Keep it for as long as you may need that, and drop it when you do not.

The check that refuses an old database covers `migrateStore()` (so a default start and `chamvi migrate`), `chamvi start --check` and a start with `CHAMVI_MIGRATE=false`. Each exits 1 with the same message.

The check is temporary: the chamvi version after this one removes it, and an old database then fails on `CREATE TABLE` with a raw Postgres error instead.

## Upgrading to 0.7

### Breaking changes

[Simple agents](/guide/dispatch#simple-agents) (`defineSimpleAgent({ run })`, no model) and [generated dispatch tools](/guide/dispatch#generated-dispatch-tools) arrived ([#131](https://github.com/chamvi/chamvi/issues/131)).

| Change | Before (0.6) | Replacement (0.7) |
|---|---|---|
| `defineAgent()` | Builds every agent | Removed: `defineModelAgent()` takes the same input and runs the same checks (rename the call). A definition with `run` is refused there: build it with `defineSimpleAgent()` |
| `Agent` | `{ name, definition }` | A union of `ModelAgent` and `SimpleAgent`, told apart by `agent.kind` (`'model'` or `'simple'`), which narrows `agent.definition` as well. An agent built by hand needs `kind`: the engine refuses one whose `kind` is neither or disagrees with its definition. A folder or package agent built by an older core (no `kind`) loads as a model agent |
| `AgentDefinition` | One shape, `instructions` required | A union of `ModelAgentDefinition` and `SimpleAgentDefinition`: on the union, `agent.definition.instructions`, `model`, `output`, `conversation` and `skills` read as possibly `undefined`, `run` and `description` are new. Check `agent.kind === 'model'` before reading the model fields |
| Hand-written dispatch tools | A `defineTool()` around `dispatch()` that only forwarded the call | Still works; `dispatchTools({ roles })` generates the same tool from the role, with `agent.on({ idempotencyKey, concurrencyKey, address, description })` deciding what the tool did. The hooks see only the payload: keep the hand-written tool when it derives a key or the address from anything else (the trigger's `receivedAt`, the run), or put that value into the payload |

## Upgrading to 0.6

### Breaking changes

Hand-offs became [dispatch](/guide/dispatch): a tool starts runs of its own or another agent and may wait for them ([#129](https://github.com/chamvi/chamvi/issues/129), [#76](https://github.com/chamvi/chamvi/issues/76)). No alias is left for the hand-off names.

| Change | Before (0.5) | Replacement (0.6) |
|---|---|---|
| Subscription | `handoff.on(opts?)`, at most one per agent, subscription id `handoff` | `agent.on(opts?)`, one per role; the role is the subscription id, default `'default'` (`DEFAULT_DISPATCH_ROLE`). `agent.on({ role: 'handoff' })` keeps the old id (stored runs carry it as `trigger.trigger`) |
| Starting a run | `startHandoff(ctx, input)` | `dispatch(ctx, input)`; `input.role` picks the role. `dispatchTo(ctx, { agent, ... })` reaches another agent |
| Types | `HandoffInput`, `HandoffResult`, `HandoffSubscriber`, `HandoffSubscriptionOptions` | `DispatchInput`, `DispatchResult`, `AgentSubscriber`, `AgentSubscriptionOptions` |
| Constants | `HANDOFF_SUBSCRIPTION_ID`, `MAX_HANDOFF_DEPTH` (1), `DEFAULT_MAX_HANDOFFS_PER_RUN` (100) | `DEFAULT_DISPATCH_ROLE`, `DEFAULT_DISPATCH_MAX_DEPTH` (1, per role through `agent.on({ maxDepth })`, at most `DISPATCH_DEPTH_MAX` 8), `DEFAULT_MAX_DISPATCHES_PER_RUN` (100) |
| Per-run limit | `maxPerRun` counted every hand-off of the run (`handoff-count:<runId>`) | Counted per target agent and role (`dispatch-count:<runId>:<agent>:<role>`) |
| Keys | Effect `<runId>:handoff:<hash>`, idempotency claim `handoff:<key>` | `<runId>:dispatch:<hash>` (the hash also covers the agent and the role), `dispatch:<role>:<key>` |
| Lineage | `trigger.parent: { kind: 'handoff', runId, agent, depth }` | `{ kind: 'dispatch', runId, agent, role, depth }`, plus `run.parentRunId` and `run.subtreeUsage`. The migration rewrites stored hand-off parents to role `handoff` |
| Wait point | `run.waiting` (`WaitPoint`) was always an approval | A union on `kind`: `ApprovalWaitPoint` (`kind: 'approval'`, plus the generic `id`, equal to `approvalId`) or `DispatchWaitPoint` (`kind: 'dispatch'`, `runIds`). Narrow on `kind === 'approval'` before reading `title`, `approvalId` or `options` |
| MCP `run_<agent>` result | `waiting: { toolName, title, ... }` | `waiting.kind` `'approval'` (with `runId` and `agent`: the run to answer, possibly a descendant) or `'dispatch'` (`get_run` only) |
| Custom repositories | | `Run.parentRunId` (set by `insert` from `trigger.parent.runId`, a missing parent throws `RunNotFoundError`), `Run.subtreeUsage`, `RunFindOptions.ids`, `parentRunId`, `parentRunIds`, `hasParent` and `waitKind`, `RunUpdateOptions.expectWaitId` and `keepUpdatedAt`, both wait point kinds read back through `normalizeWaitPoint()`. `describeRepositoryContract()` checks each ([Lineage and wait points](/repositories/writing-a-repository#lineage-and-wait-points)) |

Drain hand-off trees before upgrading: a parent that replays a `startHandoff()` call under the new effect keys can start a second child, and a stored child of subscription id `handoff` matches no role unless the agent declares `agent.on({ role: 'handoff' })`.

### Database migration

0.6 ships `1792800000000-run-lineage.ts` (`RunLineage1792800000000`): `chamvi_runs.parent_run_id` (indexed, a self foreign key, `NOT VALID` so legacy children of a deleted parent stay) and `subtree_usage`, the `parent_run_id` backfill from `trigger.parent.runId`, the hand-off parent rewrite, and the generic `id` on every pending approval wait point, so an approval that waits across the upgrade can still be answered. See [Migrations](/repositories/database#migrations).

## Upgrading to 0.5

### Breaking changes

| Change | Before (0.4) | Replacement (0.5) |
|---|---|---|
| Node | `>=24.3.0` | `>=26.0.0` |
| Base image | `ghcr.io/chamvi/node:24` | `ghcr.io/chamvi/node:26`; build stages move to `node:26-trixie-slim`. The `24` tag stops receiving rebuilds |
| `chamvi build` target | `node24` | `node26` |
| Sandbox image `ghcr.io/chamvi/sandbox-node:24` | Rebuilt as a deprecated workspace image | Not built anymore; use the default `ghcr.io/chamvi/sandbox-dev` (`mise use -g node@26`) or your own image |

## Upgrading to 0.4

### Breaking changes

| Change | Before (0.3) | Replacement (0.4) |
|---|---|---|
| Store package renamed | `@chamvi/store-typeorm` | `@chamvi/store-db`; replace the dependency and every import. Tables and migration history keep their names |
| Store aggregate | `new MemoryStore(options)`, `new TypeormStore(options)`, facade methods such as `engine.store.getRun(id)` | `createMemoryStore(options)`, `createDatabaseStore(options)`, role methods such as `engine.store.runs.findOne(id)`; every method is mapped on [Stores and repositories](/repositories/#updating-existing-callers) |
| Repository interfaces | `IRunStore`, `IStepStore`, `ICheckpointStore`, `IIdempotencyStore`, `ILockStore`, `IEffectStore`, `IStateStore`, `IArtifactStore`, `IAgentRevisionStore`; `IStore` extended them | `IRunRepository`, `IStepRepository`, `ICheckpointRepository`, `IIdempotencyRepository`, `ILockRepository`, `IEffectRepository`, `IStateRepository`, `IArtifactRepository`, `IAgentRevisionRepository`; `IStore` holds one of each (`store.runs`, `store.steps`, ...) |
| Database store options | `TypeormStoreOptions` | `DatabaseStoreOptions`; `createDatabaseStore()` returns `DatabaseStore` |
| Purging expired rows | `store.purgeExpired(now?)` resolving `PurgeResult` | `store.idempotency.purgeExpired(now?)` and `store.locks.purgeExpired(now?)`, each resolving the number of deleted rows (`@chamvi/app` schedules both) |
| Agent instructions | `AgentDefinition.instructions: string` | `instructions: AgentInstructions` (a string or an array of system, user and assistant messages). A string still works; code that reads `agent.definition.instructions` as a string must handle the array form |
| Channel context | `ChannelContext.engine: Engine`; no conversation intake | `ChannelContext.engine: IEngine` (type against the interface, not the class); `ChannelContext.dispatchConversation(envelope, target)` is required: a hand-built context needs one, get both from `engine.channelContext(channel)` |
| Engine typing in apps | `AppTokens.ENGINE: Engine`, `ILifecycleHook.engineCreated(engine: Engine)` | Both typed `IEngine`. Cast to `Engine` only where you need a member outside `IEngine` |
| `Engine.stop()` | Stopped polling and the channels | Also halts the queue and waits for an in-flight `start()` and `prepare()` (skill preparation). A skill provider that ignores cancellation holds `stop()` until it settles |
| Cron schedule lock | `createStoreScheduleLock(store, owner)` | `createRepositoryScheduleLock(store.locks, owner)` (`@chamvi/channel-cron`, takes an `ILockRepository`) |
| Engine concurrency option | `new Engine({ maxConcurrentRuns })` | `new Engine({ concurrencyMaxRuns })`; the variable `CHAMVI_MAX_CONCURRENT_RUNS` is unchanged |
| App config concurrency | `readConfig(env).engine.maxConcurrentRuns` | `readConfig(env).engine.concurrencyMaxRuns` (`AppConfig`); the variable `CHAMVI_MAX_CONCURRENT_RUNS` is unchanged |
| Run references (memory, database and custom stores) | `steps.insert`, `checkpoints.save` and `conversations.beginTurn` accepted any run id on the memory store; Postgres failed with a raw foreign key error | All three throw `RunNotFoundError` for a run the store does not hold and write nothing, on memory and Postgres alike. `describeRepositoryContract()` checks it, so a custom store must implement it to pass ([Run references](/repositories/writing-a-repository#run-references)). Insert the run first; a test that spreads `{ ...createMemoryStore(), runs: custom }` builds `steps`/`checkpoints`/`conversations` with `hasRun` over `custom` (see [Memory repositories](/repositories/memory)) |
| Node | `>=22` | `>=24.3.0` |
| Git credential mode (`@chamvi/sandbox`) | `credentialMode` (`CredentialMode`) and `CHAMVI_GIT_CREDENTIAL_MODE` chose tools-only or workspace-installed credentials | Removed; a set variable or option is refused with `InvalidAgentDefinitionError` naming them: unset the variable and drop the option. Workspace-installed credentials are the only mode; `PushPolicy` binds `git_push` only, so restrict writes through token scope and branch protection |
| Image requirements (`@chamvi/sandbox`) | `IMAGE_REQUIREMENTS` `['sh', 'git', 'timeout']` | `['sh', 'git', 'timeout', 'head', 'base64', 'tr']`: the image probe also refuses an image without `/bin/sh` or without `head`, `base64` and `tr` in `/usr/bin` or `/bin` (coreutils or busybox provide them; `ghcr.io/chamvi/sandbox-dev` has them) |
| `write_file` over a file holding an issued token | Wrote a literal `[redacted]` over the token | Each `[redacted]` the model read is restored in order; content whose markers do not line up, or with `[redacted]` over an existing file that cannot be read as text, is refused (`ValidationError`) and nothing is written |
| Event-started runs (`github`, `webhook`) | A delivery started a run whose write tools ran at once, so an event-driven auto-merge or auto-reply flow acted without a human | The `github` and `webhook` channels are untrusted ingress: their runs are tainted from the first step, and `github_merge_pull_request`, `github_create_pull_request`, `github_create_issue`, `github_propose_change`, `git_push` and a `github_create_comment` on another issue than the source one wait for an approval (the source issue gets a generic "An outbound operation requires review" comment, never the arguments). Answer it in the approval inbox or through `POST /runs/:id/approve` (MCP `approve_run`). An agent whose own policy already decides opts out per tool: `trust: { tools: { github_merge_pull_request: { guardWhenTainted: false } } }` ([Approvals in event-started runs](/deployment/github-app#approvals-in-event-started-runs)) |
| Run taint | No taint column | Database migration `ConversationsRunTaint1792713600000` adds `chamvi_runs.taint` and backfills unfinished runs; it needs downtime (below). Custom stores must persist `Run.taint` ([Persist run taint](/repositories/writing-a-repository#persist-run-taint)) |

### New in 0.4

Run taint, the outbound gates and repository guidance are new, so 0.3 apps have nothing to migrate beyond the rows above. In their final 0.4 form:

- The coding read and shell tools (`read_file`, `grep`, `glob`, `list_files`, `git_diff`, `bash`, `bash_output`) taint the run in every workspace, repo-less ones included; opt a tool out with `trust.tools: { bash: { taint: false } }` only where its output is trusted.
- `git_push` with `push: { mode: 'approve' }` asks once in a tainted run: the outbound gate's private approval carries the push title and commit log (`ToolTrust.approvalDetail`, `outboundApproved(ctx)`) and is answered in the approval inbox or API; `push.channel` is not asked then. A push the policy refuses is denied before the gate asks.
- A failing repository guidance collection gives `instructions: null` plus `instructionsError` in `create_workspace` and `read_file`; `read_file` in a repo-less workspace omits `instructions`.
- `ghcr.io/chamvi/sandbox-dev` ships the GitHub CLI (`gh`, the current release at build time); pin the image digest for a fixed version.

Conversation memory is opt-in and new, so 0.3 apps have nothing to migrate: storage is `store.conversations` (both built-in stores carry it), policy is `createApp({ conversations: { authorize } })` or `EngineOptions.conversations`. See [Conversations](/guide/conversations) for the setup.

### Database migration

0.4 ships one new migration, `1792713600000-conversations-run-taint.ts` (`ConversationsRunTaint1792713600000`): the conversation tables, the run and checkpoint conversation bindings, the foreign keys (the two on legacy steps and checkpoints `NOT VALID`, see [Validating the legacy constraints](/repositories/database#validating-the-legacy-constraints)), indexes on the new foreign key columns, `chamvi_runs.taint` and the backfill that taints every `queued`, `running`, `waiting` and `interrupted` run with `{ at: <migration time>, source: 'migration:legacy-run' }`.

::: warning Development databases
A database that ran a pre-release build of this branch recorded `Conversations1792713600000` (and maybe `RunTaint1792800000000`). Migrating it fails with "relation already exists". Recreate the disposable database; never reset a production one for this.
:::

### Upgrade procedure (downtime)

Old and new runtimes must never share the store, not even during a rolling update. An old approval poller can post a tainted run's private approval body to its source channel, and an old worker or job can create or checkpoint untainted runs after the one-time backfill. Claims and locks do not prevent this.

1. **Suspend the run-job CronJobs** (`kubectl patch cronjob <name> -p '{"spec":{"suspend":true}}'`, or `suspend: true` on each `cronJobs[]` entry of the `agent-app` chart) and wait for running job pods to finish. A `Recreate` Deployment does not cover CronJobs, and `CHAMVI_MIGRATE` defaults to `true` in job mode too: a 0.3 job pod started during the upgrade writes runs the backfill never sees.
2. **Stop every old process**: scale the Deployment to 0 (ingress, workers, approval pollers) and wait for the pods to exit. Draining executions alone is not enough.
3. **Migrate in a maintenance window**: run `chamvi migrate` once with the new image (`DATABASE_URL` set). Alternatively start the new Deployment with the default `CHAMVI_MIGRATE=true`; with `CHAMVI_MIGRATE=false` everywhere, `chamvi start --check` refuses the unmigrated database.
4. **Start only 0.4 binaries**: scale the Deployment up, then resume the CronJobs with the new image. Resumed legacy runs are tainted, so their guarded tools ask for approval.

See [Multiple replicas](/deployment/replicas#upgrading-to-untrusted-content-gates) for why each step matters.

### Release-time owner actions

These are not code changes; the maintainer does them when 0.4.0 is published:

- After the first `@chamvi/store-db` publish: `npm deprecate @chamvi/store-typeorm "renamed to @chamvi/store-db"`.
- Check that the `NPM_TOKEN` used by `release.yml` (monoship) may create new packages: `@chamvi/skills` and `@chamvi/store-db` publish for the first time.
- `@chamvi/skills` depends on a Git URL (`git+https://github.com/tada5hi/skills-cli.git#<sha>`): registry-only proxies and the agent-template lockfile check refuse it. Publish or vendor the fork before relying on it ([#97](https://github.com/chamvi/chamvi/issues/97)).
- Downstream: bump [chamvi/helm](https://github.com/chamvi/helm) and [chamvi/agent-template](https://github.com/chamvi/agent-template) from `^0.3.x` to `^0.4.0` after publishing (Node 24, the CronJob suspend note in the chart README, no `CHAMVI_GIT_CREDENTIAL_MODE`).
