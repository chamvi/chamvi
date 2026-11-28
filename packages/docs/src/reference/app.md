# @chamvi/app

Boots chamvi agents as an app. The public API of `packages/app/src/index.ts` and its subpath entries; see [Apps & Modules](/guide/app) for the concepts.

```bash
npm install @chamvi/app ai typeorm pg
```

`ai`, `typeorm` and `pg` are peer dependencies. The provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/xai`) and the `@authup/*` packages behind `@chamvi/app/authup` are optional peers. The other optional modules ship with their feature packages (`@chamvi/github/module`, ...), so `@chamvi/app` depends on none of them. The main entry re-exports `@chamvi/core`, `@chamvi/access` (`Permission`, `can`, `canSome` and the binding types) and the `Authenticator`, `Principal`, `HttpRoute`, `HttpRouteContext`, `HttpRouteRequest`, `HttpRouteResult` and `StaticToken` types of `@chamvi/http`.

| Entry | Exports | Needs |
|---|---|---|
| `@chamvi/app` | `createApp`, `isApp`, the built-in modules, the module contract (tokens, `ModuleName`, `AppContext`, `ILifecycleHook`, the `IModule` and `IContainer` types), env readers, `approvalUrlOf`, `readConfig`, `createLogger`, `BUILTIN_PROVIDERS`, the model and check types (`ProviderConfig`, `SecretValue`, `AppCheckOptions`, `AppCheckResult`, ...) | |
| `@chamvi/app/authup` | `authupModule`, `oidcModule` | `@authup/server-adapter-kit`, `@authup/core-http-kit` |
| `@chamvi/app/testing` | `buildModuleHarness`, `createModuleHarness`, `memoryStoreModule` | |

## createApp

```ts
function createApp(options: AppOptions): IApp;
function isApp(value: unknown): value is IApp;

const APP_BRAND: unique symbol; // Symbol.for('chamvi.app')
```

Synchronous and side-effect free. `agents` may be omitted or empty: the agents can come from an [agents folder](/guide/agent-folders), and an app with no agent at all still starts (a warning); `app.agents` holds only the agents passed in code, the live set is `engine.listAgents()`. Throws `InvalidAgentDefinitionError` for options that are no object or whose `agents` is no array, a module list entry that is no `IModule` and for two modules of one name (a built-in's name included: list one module to replace a built-in). `isApp` checks the brand, so an app of another installed copy matches.

<<< ../../../app/src/app/types.ts{ts}

| Method | Builds | Rejects with |
|---|---|---|
| `start` | config, store (migrated unless `MIGRATE=false`), engine with every contributed channel (the cron channel fires unless `SCHEDULER=false`), http; starts the engine (and so its channels) once every module built, resolves once listening | the setup error (a module graph error as `InvalidAgentDefinitionError`); `app_stopped` when `stop()` interrupted the setup (the setup's own error is logged); `app_in_use` for a second lifecycle or after `stop()` |
| `stop` | the shutdown sequence (see [Start and stop](/guide/app#start-and-stop)); memoized, waits for a setup in flight | `app_stop_failed` when a teardown failed (each failure is logged) |
| `runJob` | config, store (migrated), engine (not started: `@chamvi/channel-cron` `runJob` starts it without channels, ticks and drains it); no http | the job's error; `app_in_use` |
| `migrate` | config, store (`migrateStore`), every [database module](/guide/database) (its migrations), their teardown | `InvalidAgentDefinitionError` without `DATABASE_URL`; `app_in_use` |
| `check` | the `start` path up to its start steps (`context.check`, mode `start`): config, store (connected, never migrated: pending migrations reject with `store_not_migrated` unless `MIGRATE` is on), the model settings, every module's setup and onReady, the agent folders loaded and checked (`engine.checkAgent()`, never `putAgent`), then the teardown. No engine or channel start, no server, no run, no store write (no migration, revision marker, cancel or lock). Resolves `{ issues }`, the agent folders' load issues | the setup error (`invalid_agent_definition` for a configuration error), the store's (`store_not_migrated`, a connection error); `app_in_use`: it is the app's one lifecycle |

`runJob` resolves `exitCode: 0` for a `completed`, `waiting`, `skipped`, queued-behind-an-approval or signal-interrupted run, `1` for `failed` or `cancelled`.

## Errors

`ChamviError` codes in `APP_ERROR_CODE`:

| Code | When |
|---|---|
| `app_stopped` | The lifecycle's abort reason once `stop()` was called; a start stopped while setting up rejects with it |
| `app_in_use` | A second `start`, `runJob` or `migrate` on the same app |
| `app_stop_failed` | `stop()` (or a job's teardown) after one or more teardown errors, each logged |

Configuration errors (a malformed or missing variable, a model string naming a provider that is not configured, an agent with no model and no default, a duplicate module name) are core `InvalidAgentDefinitionError`s; they name the variable and never echo its value.

## Environment

Read by `readConfig(env, { mode, dev })` once per lifecycle; the optional module factories read their own variables when they are called. Empty string is unset, integers are `/^\d+$/` (every `*_MS` variable at most `TIMER_MAX_MS`, 2147483647, since a larger Node timer fires after 1 ms), booleans `true`, `false`, `1` or `0`.

| Variable | Module | Type | Default | Required when |
|---|---|---|---|---|
| `PORT` | http | int 1..65535 | `3000` | never |
| `HOST` | http | string | `0.0.0.0` | never |
| `BASE_PATH` | http | empty or `^(?:\/[a-z0-9._~-]+)+$` | `''` (health at `/healthz`, UI at `/ui`) | never |
| `PUBLIC_URL` | http, ui, channels | absolute URL | unset | an approval link is wanted |
| `LOG_LEVEL` | config | `error`, `warn`, `info`, `debug` | `info` | never |
| `DATABASE_URL` | store | `postgres://...` | unset: memory repositories (warned outside dev) | `migrate`; any multi-replica or CronJob deployment |
| `MIGRATE` | store | bool | `true` | never |
| `PURGE_INTERVAL_MS` | store | int, `0` disables | `3600000` (the lock, idempotency and limit services' `purgeExpired()`, on `engine.clock`) | never |
| `MAX_CONCURRENT_RUNS` | engine | int >= 1 | `4` | never |
| `SCHEDULER` | scheduler | bool | `true`; `false` starts no in-process cron (CronJob mode; `cron.on()` subscriptions still validate) | never |
| `AGENTS_DIR` | agents | path of a directory, relative to the working directory | unset: `./agents` when it is a directory, else no [agent folders](/guide/agent-folders) | |
| `AGENTS` | agents | comma-separated bare package specifiers | unset; added after `createApp({ agents })`'s and `chamvi.json`'s ([agent packages](/guide/agent-packages)) | never |
| `AGENTS_POLL_MS` | agents | int 1..`TIMER_MAX_MS` | `5000` (`DEFAULT_AGENTS_POLL_MS`) | never |
| `READINESS_DELAY_MS` | http shutdown | int | `0` | never |
| `DRAIN_TIMEOUT_MS` | http shutdown | int | `30000` (dev 5000) | never |
| `CLOSE_TIMEOUT_MS` | http shutdown | int | `5000` | never |
| `FORCE_EXIT_MS` | cli | int | `90000` (dev 15000) | never |
| `TOKENS` | static tokens | JSON `[{ "value", "id", "permissions" }]`, `value` at least 16 characters and unique; `permissions` is `"*"` (every `chamvi_*` permission) or an array of [permission bindings](/guide/permissions) | unset (dev: one random `"*"` token, warned) | no other authenticator is configured, outside dev |
| `AUTHUP_URL`, `AUTHUP_SERVER_CLIENT_SECRET` | `authupModule` | URL, string | unset | `authupModule()` without all of `verifier`, `catalog` and `realm`; the client needs `permission_read` (the catalog) and `token_introspect`, with a realm scope of `ownOrNull` or wider, and its realm is chamvi's realm |
| `AUTHUP_SERVER_CLIENT_ID` | `authupModule` | client name or id | `chamvi-server` | never; the confidential client chamvi reads and verifies as (unless `clientId` is given) |
| `AUTHUP_REALM` | `authupModule`, `uiModule` | realm name or id | `master` | never; the realm of the server and dashboard clients, sent as `realm_id` with the client-credentials request (unless `clientRealm` is given) |
| `AUTHUP_TIMEOUT_MS` | `authupModule` | integer ms, at least 1 | `10000` | the deadline of every catalog read, realm lookup and token verification (unless `timeoutMs` is given); a verification past it answers 503 |
| `AUTHUP_PERMISSION_OWNER` | `authupModule` | `realm`, `client` | `realm` | `client`: the dashboard client (`uiModule({ auth })`, else `AUTHUP_CLIENT_ID`, else `chamvi`, in chamvi's realm) owns the permissions, see [Who owns the permissions](/guide/permissions#owner-client); a name needs `client_read` on chamvi's client; any other value fails the start |
| `AUTHUP_CLIENT_ID` | `uiModule` | client name or id | `chamvi` | `AUTHUP_URL` for `AUTHUP_CLIENT_ID`; the dashboard signs in through authup whenever `AUTHUP_URL` is set (token login only without it) |
| `MODEL` | engine | `'<provider>/<model id>'` | the config file's `model`, else `createApp({ model })` | an agent has no model of its own |
| `CONFIG_FILE` | engine | path of a JSON file, relative to the working directory | unset: `./chamvi.json` when it exists | never |
| `PROVIDER_<NAME>_TYPE`, `_API_KEY`, `_BASE_URL`, `_HEADER_<HEADER>` | engine | type, secret, absolute http(s) URL, secret | unset; each field wins over the config file and code for provider `<name>` (upper snake case: `TEAM_A` is `team-a`) | `_TYPE` when no other source declares `<name>`; `_API_KEY` for every type but `openai-compatible` ([providers](/guide/models#providers)) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY` | engine | string | unset | a model string names that implicit provider and nothing declares it; `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL` set its base URL ([implicit providers](/guide/models#implicit-providers)) |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, literal `\n` allowed), `GITHUB_WEBHOOK_SECRET` (comma-separated for rotation); `GITHUB_<NAME>_*` for a module with `name` | `githubModule` | string | none | any of them set (a partial env fails the start; nothing set in env or the store starts idle) |
| `GITHUB_INSTALLATION_ID`, `GITHUB_APP_SLUG`, `GITHUB_API_URL` | `githubModule` | int, slug, https URL | unset | never |
| `OPENCLAW_BASE_URL`, `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_CHANNEL`, `OPENCLAW_TO` | `openclawModule` | URL, string, string, string | none | `openclawModule()` without options |
| `OPENCLAW_HOOKS_PATH`, `OPENCLAW_AGENT_ID`, `OPENCLAW_ACCOUNT_ID` | `openclawModule` | string | `/hooks`, unset, unset | never |
| `SANDBOX_PROVIDER` | `sandboxModule` | `local`, `docker`, `kubernetes` | the `provider` option, else `local` | never |
| `SANDBOX_NAMESPACE` | `sandboxModule` | string | none | provider `kubernetes` |
| `SANDBOX_IMAGE` | `sandboxModule` | image ref | `ghcr.io/chamvi/sandbox-dev:trixie` | never |
| `SANDBOX_IMAGES` | `sandboxModule` | comma list of image refs | none (also a list without an entry): `create_workspace` offers no `image` | never |
| `SANDBOX_SUSPEND_AFTER_MS` | `sandboxModule` | int (ms) | the `suspendAfterMs` option, else `1800000` (30 min); `0` turns off the default rule (an `isSuspendable` option replaces the rule and still applies) | never |
| `SANDBOX_PERSISTENCE` | `sandboxModule` | `true`, `false`, `1`, `0` | whether the `persistence` option is set; read only for provider `kubernetes` | never |
| `SANDBOX_DOCKER_SUSPEND` | `sandboxModule` | `true`, `false`, `1`, `0` | the `suspend` option, else `false`; read only for provider `docker` | never |
| `SANDBOX_STORAGE_CLASS` | `sandboxModule` | storage class name | the `persistence.storageClassName` option, else the cluster default; only with persistence | never |
| `DEPLOYMENT` | `sandboxModule` | label value (at most 63 letters, digits, `-`, `_`, `.`) | the `deployment` option, else `default` | several apps share one Docker host or namespace (one value per app); only with a value are the workspaces of runs the store does not hold collected |
| `KNOWLEDGE_MODEL` | `knowledgeModule` | `'<provider>/<model id>'` | the `embeddingModel` option, else none: creating a [managed collection](/guide/knowledge#managed-collections) answers 409 | never |
| `ENCRYPTION_KEYS` | config (`AppToken.KEYRING`) | `<id>:<base64 of 32 bytes>[,<id>:<base64>...]`, ids by the agent-name rule, the first active | unset | a module resolves `AppToken.KEYRING` (e.g. [`whatsappModule()`](/deployment/whatsapp#with-chamvi-app)) or a [dashboard save](/guide/ui#connection-pages) stores a connection (plain settings too); read only then, so an env-only app needs no key. Rows wrapped under an older listed key stay readable ([rotation](/deployment/whatsapp#session-store)) |

```ts
function readConfig(env: Env, options: ReadConfigOptions): AppConfig;
function approvalUrlOf(config: AppConfig): ((ref: ApprovalRef) => string) | undefined; // needs PUBLIC_URL
function readKeyring(env: Env): IKeyring; // ENCRYPTION_KEYS, the value of AppToken.KEYRING
```

The env readers modules build on, each throwing `InvalidAgentDefinitionError` that names the variable:

```ts
function envString(env: Env, name: string, options?: EnvStringOptions): string | undefined;
function envInteger(env: Env, name: string, options?: EnvIntegerOptions): number | undefined;
function envBoolean(env: Env, name: string, options?: EnvReadOptions<boolean>): boolean | undefined;
function envUrl(env: Env, name: string, options?: EnvUrlOptions): string | undefined;
function envList(env: Env, name: string, options?: EnvReadOptions<string[]>): string[] | undefined; // comma-separated
function envJson(env: Env, name: string, options?: EnvJsonOptions): unknown;
function envOneOf<T extends string>(env: Env, name: string, values: readonly T[], options?: EnvReadOptions<T>): T | undefined;
```

With `required: true` or a `default` the overloads return a defined value.

<<< ../../../app/src/env/types.ts{ts}

## HTTP intake and execution ceilings

`httpModule({ channelRateLimits, trustProxy })` forwards the [channel request policies](/reference/http#channel-http-request-limits) to `createHttpApp()`. Configure a mounted channel by its exact name, with `{ max, windowMs? }` for a separate per-client bucket or `false` to disable only that channel's intake limiter. No environment variable is added for this setting. Trust only known proxy sources.

`MAX_CONCURRENT_RUNS` is the local engine ceiling. Agent and subscription `concurrencyMaxRuns?: number | false` add nested shared-store ceilings; see [Concurrency](/guide/concurrency#shared-agent-and-subscription-ceilings).

## Built-in modules

```ts
function configModule(options?: ConfigModuleOptions): IModule;            // 'chamvi:config'
function storeModule(options?: StoreModuleOptions): IModule;              // 'chamvi:store'
function staticTokensModule(options?: StaticTokensModuleOptions): IModule; // 'chamvi:static-tokens'
function engineModule(options?: EngineModuleOptions): IModule;            // 'chamvi:engine'
function agentsModule(options?: AgentsModuleOptions): IModule;            // 'chamvi:agents'
function schedulerModule(options?: SchedulerModuleOptions): IModule;      // 'chamvi:scheduler', the cron channel
function httpModule(options?: HttpModuleOptions): IModule;                // 'chamvi:http', the http, mcp and webhook channels
function consoleChannelModule(options?: ConsoleChannelModuleOptions): IModule; // 'chamvi:console' ('chamvi:console:<name>' with a name)
```

Listing one of them in `createApp({ modules })` replaces the default instance. `engineModule()` reads the [model settings](/guide/models) in `setup` (`start` and `job` mode: env over the config file over `createApp({ model, providers })`, `models` over all for its ids), refusing every settings issue at once (`The model settings have <n> issue(s):` and one line each), imports the provider packages the settings need and passes the default model and the resolver to the `Engine` as `model` and `models`, which checks every agent when it is registered; it never reads or sets the AI SDK's global default provider. `agentsModule()` loads the [agent packages](/guide/agent-packages) (createApp's specifiers, `chamvi.json` `agents`, `AGENTS`; `options.cwd` is where they and the agents dir resolve from, default the working directory; `chamvi.json` itself is always read from the working directory, the file the engine module reads) once in `onReady`, before the folders, then reads `AGENTS_DIR`, else takes `./agents` when it is a directory: in `start` and `job` mode its `onReady` loads every folder into the engine before any start step (a dir that is no directory is `InvalidAgentDefinitionError`), and in `start` mode a lifecycle hook polls the dir from `started` until `stopping`; it registers `AppToken.AGENT_ISSUES`, which the http module passes on as `agentIssues`. A folder agent passes every `AppToken.AGENT_CHECKS` contribution (the scheduler module's `assertSchedulable`, the http module's `assertMcpRunTool` unless `mcp: false`) and the engine's registration checks in `putAgent` (every subscription names a registered channel, the model resolves through the app's providers) before it is registered; a refusal is a load issue, never a failed boot. Only `start` mode removes an agent whose marker has no folder; a job never does. Without a dir or a package it only warns for an app without agents.

<<< ../../../app/src/modules/config/types.ts{ts}

`StoreModuleOptions` (`dataSource` must be initialized, is migrated like a built one and never destroyed; `url` wins over `DATABASE_URL`; a data source built from a URL waits at most 10 s for Postgres to accept the first connection). A module named `ModuleName.STORE` that registers the repository tokens replaces it ([Writing a Repository](/repositories/writing-a-repository#register-it-with-an-app)):

<<< ../../../app/src/modules/repository/types.ts{ts}

<<< ../../../app/src/modules/static-tokens/types.ts{ts}

<<< ../../../app/src/modules/engine/types.ts{ts}

<<< ../../../app/src/modules/scheduler/types.ts{ts}

<<< ../../../app/src/modules/http/types.ts{ts}

## Database module

```ts
function databaseModule(options: DatabaseModuleOptions): IModule;          // 'chamvi:db:<name>', default 'chamvi:db:default'
function dataSourceToken(name?: string): TypedToken<DataSource>;          // one token per name; DatabaseToken.DATA_SOURCE is the default's
function readDatabaseDescriptors(app: IApp): DatabaseDescriptor[];        // an app's databases, without connecting
const DatabaseToken: DatabaseTokens;                                       // DATA_SOURCE, DESCRIPTORS
```

A database for the app's own tables beside chamvi's store: PostgreSQL on `DATABASE_URL`, migrated under the lock `chamvi:db:<name>` into its own migrations table, else SQLite in memory (refused with `NODE_ENV=production`). See [Database](/guide/database).

<<< ../../../app/src/modules/database/types.ts{ts}

## Optional modules

```ts
// @chamvi/github/module
function githubModule(options?: GithubModuleOptions): GithubModule;        // .app: IGithubApp and the github channel, 'chamvi:github:github'

// @chamvi/sandbox/module
function sandboxModule(options?: SandboxModuleOptions): SandboxModule;     // .manager: IWorkspaceManager, 'chamvi:sandbox'

// @chamvi/channel-openclaw/module
function openclawModule(options?: OpenclawModuleOptions): IModule;         // 'chamvi:channel:<name>', default name 'openclaw'

// @chamvi/ui/module
function uiModule(options?: UiModuleOptions): IModule;                     // 'chamvi:ui'

// @chamvi/tool-mail-ui/module, and likewise the calendar, GitHub, Discord and WhatsApp pages
function toolMailUiModule(options?: { uiBase?: string }): IModule;         // serves a page at <uiBase>/ext/<slug>

// @chamvi/app
function uiPageModule(options: UiPageModuleOptions): IModule;              // the helper behind every *-ui module

// @chamvi/knowledge/module
function knowledgeModule(options?: KnowledgeModuleOptions): KnowledgeModule; // .knowledge: IKnowledge, 'chamvi:knowledge'

// @chamvi/app/authup
function authupModule(options?: AuthupModuleOptions): IModule;             // 'chamvi:authup'
function oidcModule(options: OidcOptions): IModule;                        // 'chamvi:oidc', no env form
```

Each factory reads `options.env ?? process.env` when it is called and throws `InvalidAgentDefinitionError` naming a missing or malformed variable. `githubModule()` and `discordModule()` decide a missing value in `setup`, where the store is readable (malformed values still throw at the factory). Options win over env, except `SANDBOX_PROVIDER`, `SANDBOX_NAMESPACE`, `SANDBOX_IMAGE`, `SANDBOX_IMAGES` (over `allowImage`), `SANDBOX_SUSPEND_AFTER_MS`, `SANDBOX_PERSISTENCE`, `SANDBOX_DOCKER_SUSPEND`, `SANDBOX_STORAGE_CLASS` and `DEPLOYMENT`, which win over the sandbox options, and `KNOWLEDGE_MODEL`, which wins over `embeddingModel`. The GitHub and OpenClaw modules contribute their channel to `AppToken.CHANNELS`, defaulting `approvalUrl` to the dashboard link built from `PUBLIC_URL` and using the app's clock; tools reach a channel with `ctx.channels.findOne(name)`. `githubModule` and `sandboxModule` provide their instance on the engine in the `engineCreated` hook; tools reach it through the package's context pair ([github](/reference/github#context), [sandbox](/reference/sandbox#context)).

<<< ../../../github/src/module/types.ts{ts}

<<< ../../../sandbox/src/module/types.ts#public{ts}

<<< ../../../channel-openclaw/src/module/types.ts{ts}

<<< ../../../ui/src/module/types.ts{ts}

<<< ../../../app/src/authup/types.ts{ts}

## Tokens and hooks

`AppToken` holds the container keys, `ModuleName` the built-in names, `AUTHENTICATOR_ORDER` the chain order (static tokens `0`, authup `10`, oidc `20`, lowest first):

<<< ../../../app/src/module/constants.ts{ts}

`AppContext`, `ILifecycleHook`, `AuthenticatorEntry`, `Server`, `AppTokens` (each token's value type), the re-exported orkos `IModule` and eldin `IContainer` types and eldin's `TypedToken` class (create a feature module's container keys with it):

<<< ../../../app/src/module/types.ts{ts}

```ts
function runHooks(container: IContainer, phase: LifecyclePhase, ...args: unknown[]): Promise<void>; // every LIFECYCLE_HOOKS entry, in order
function throwIfStopped(context: AppContext): void; // throws the app_stopped error once stop() was called
```

## Testing modules

```ts
// @chamvi/app/testing
function buildModuleHarness(options?: ModuleHarnessOptions): ModuleHarness;          // not set up yet
async function createModuleHarness(options?: ModuleHarnessOptions): Promise<ModuleHarness>; // set up
function memoryStoreModule(options?: MemoryStoreModuleOptions): IModule;              // 'chamvi:store' on memory repositories of `registry` (default a new one)
```

The real module lifecycle without `start()` and a port, over exactly `options.modules` (list the built-ins a module needs, e.g. `configModule()`, `storeModule()`, `engineModule()`) on a container holding `AppToken.CONTEXT` (and `CLOCK` with `clock`): `setup()` runs every `setup`, every `onReady` and the start steps like the app and tears down and rethrows when one fails, `reported` collects every `context.report()` call (a throwing lifecycle hook lands there), `stop()` aborts the context signal and tears down.

<<< ../../../app/src/testing/types.ts{ts}

## Approved local skills

`AppOptions.skills?: readonly SkillInput[]` forwards additive defaults for every agent passed in code and every folder agent. An agent's `skills` adds extras. Factory inputs come from `@chamvi/skills`: `gitSkills()` and `loadSkillBundle()` work directly; custom snapshots/loaders use `defineSkill()`/`defineSkillSource()`. Core supplies the generic `SkillInput` protocol; skill data types, validation, catalogs and caches belong to skills. Core/app have no dependency on `@chamvi/skills`, and no skills module registration is needed. Startup verifies globals and the sources of agents passed in code before `engineCreated`; folder-agent extras verify afterward, before channels, HTTP and model execution. `check()` skips providers and defers content verification; `migrate()` skips preparation. See [Approved skills](/guide/skills) for lifecycle and replay semantics.

Filesystem review/loading and Git preparation are exported by [`@chamvi/skills`](/reference/skills). App exports no filesystem helpers. Use `loadSkillBundle()` for a ready snapshot or `gitSkills()` for an engine-owned source; the manual `loadSkillBundles()` catalog remains supported by the skills package.

## Agent folders

```ts
function loadAgent(dir: string, options?: LoadAgentOptions): Promise<LoadedAgent>;
function loadAgents(root: string, options?: LoadAgentOptions): Promise<LoadAgentsResult>;
function listAgentFolders(root: string): Promise<string[]>;
function hashAgentFolder(dir: string): Promise<string>;
function loadAgentPackage(spec: string, options: LoadAgentPackageOptions): Promise<LoadedPackage>; // throws InvalidAgentDefinitionError
function hashAgentPackage(root: string, options?: HashAgentPackageOptions): Promise<string>; // the published files and the entry's folder, package.json without version
```

`loadAgent` builds one folder's agent from its `agent.ts` (see [the rule](/guide/agent-folders#the-folder)) and its content hash, and throws `InvalidAgentDefinitionError` naming the file relative to the agents dir. `loadAgents` loads every folder `listAgentFolders` names (the direct subfolders not starting with `.` or `_`, `node_modules` left out, in code-point order) and returns the failures as `issues` instead of throwing. `hashAgentFolder` is sha256 (hex) over every file below the folder, dot-entries skipped, by relative POSIX path. `loadAgent` also refuses a folder that changed while it was read (`<agent>: changed while loading; load it again.`), a `node_modules` folder in the agent folder or the agents dir, and a JavaScript file (`.js`, `.mjs` or `.cjs`) anywhere in the folder. The default reader transpiles `agent.ts` and every `.ts`/`.mts` file it imports on every load and resolves `@chamvi/*`, `ai` and `@ai-sdk/*` to the copies `@chamvi/app` resolves. The loader and the package loader (`loadAgentPackage`, `hashAgentPackage`) hold the only `locter` imports of chamvi.

<<< ../../../app/src/loader/types.ts{ts}

## Models

```ts
const BUILTIN_PROVIDERS: readonly BuiltinProvider[]; // anthropic, openai, google, mistral, xai: the implicit providers
```

See [Pick a Model](/guide/models) for the whole picture. `createApp({ model, providers, models })` sets the default model, the named providers and AI SDK provider objects by id; `MODEL`, `CONFIG_FILE` (else `./chamvi.json`) and `PROVIDER_<NAME>_*` set the same from the deployment. Sources, highest first: env, the config file, code; providers merge per name and field, a higher source with another `type` replaces the provider, a `PROVIDER_<NAME>_*` variable without `_TYPE` needs another source to declare `<name>`, and a declared provider replaces the implicit one of its name. `models` wins over everything for its ids (no package imported), the test seam.

Model strings are split at the first `/`. Every provider gets an explicit key and base URL (the type's public URL when none is set), read from the app's `env` only, never from `process.env` behind its back; `{ file }` secrets are read relative to the working directory with one trailing newline trimmed. The config file refuses a literal `apiKey` and literal credential headers. Errors name the variable or file field and never echo a value: `Agent "<a>" uses provider "<p>", which is not configured. Set PROVIDER_<P>_TYPE and PROVIDER_<P>_API_KEY, or declare it in chamvi.json.`, `Provider "<p>" (<type>) needs PROVIDER_<P>_API_KEY.`, `Provider type "<type>" needs package <pkg>.` Nothing reads or sets the AI SDK's global default provider, so two apps in one process keep their own providers.

<<< ../../../app/src/models/types.ts#public{ts}

`app.check({ env? })` (`chamvi start --check`) runs the same settings through the real start path without starting anything or writing to the store; see [Check before you deploy](/guide/models#check-before-you-deploy).

## Logger

```ts
function createLogger(options?: LoggerOptions): ILogger;
```

One JSON line per entry (`{ level, time, msg, ...fields, error? }`, the error as `{ name, code, message, stack }` only, never its `cause`) on stderr, or through `write`. The engine's, the cron channel's and the HTTP app's `onError` all go through it.

`ILogger` is `@chamvi/core`'s (re-exported by `@chamvi/app`), so a feature package types its logger without importing the app:

<<< ../../../core/src/logger/types.ts{ts}

<<< ../../../app/src/logger/types.ts{ts}
