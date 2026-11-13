# Project Structure

## Directory Layout

```
chamvi/
├── packages/
│   ├── access/                      # @chamvi/access (same layout)
│   ├── core/                        # @chamvi/core
│   │   ├── src/                     # Library source (entry: src/index.ts), one folder per module
│   │   ├── test/
│   │   │   ├── vitest.config.ts     # Aliases @chamvi/core to ../src/index.ts
│   │   │   ├── unit/                # *.spec.ts, one folder per src module (agent/, engine/, ...)
│   │   │   ├── fixtures/            # readme-example.ts (the README example, run as a test)
│   │   │   └── utils/               # mock-model.ts, clock.ts (private ControllableClock copy)
│   │   ├── README.md                # Package README (must contain the fixture verbatim)
│   │   ├── tsdown.config.ts         # Builds dist/index.mjs + .d.mts
│   │   ├── tsconfig.json            # src + test (typecheck)
│   │   └── tsconfig.build.json      # src only (build:types)
│   ├── channel-cron/                # @chamvi/channel-cron (same layout)
│   ├── http/                        # @chamvi/http (same layout)
│   ├── test-kit/                    # @chamvi/test-kit (same layout)
│   ├── github/                      # @chamvi/github (same layout)
│   ├── channel-openclaw/            # @chamvi/channel-openclaw (fake gateway in test/utils/openclaw.ts)
│   ├── chat/                        # @chamvi/chat (fake Chat SDK adapter in test/utils/)
│   ├── chat-discord/                # @chamvi/chat-discord (fake discord.js clients and fetch in test/utils/)
│   ├── chat-whatsapp/               # @chamvi/chat-whatsapp (fake Baileys sockets and auth in test/utils/)
│   ├── sandbox/                     # @chamvi/sandbox (same layout; private test/utils/clock.ts)
│   ├── sandbox-local/               # @chamvi/sandbox-local
│   ├── sandbox-docker/              # @chamvi/sandbox-docker (fixture images in test/fixtures/{no-git,no-cache,no-init,entrypoint})
│   ├── sandbox-k8s/                 # @chamvi/sandbox-k8s (tests drive a fake IPodClient, test/utils/client.ts)
│   ├── coding/                      # @chamvi/coding
│   ├── skills/                      # @chamvi/skills (optional skill runtime, catalogs, bundles and pinned Git sources)
│   ├── tool-files/                  # @chamvi/tool-files
│   ├── tool-utils/                  # @chamvi/tool-utils
│   ├── tool-web/                    # @chamvi/tool-web (fake transport, fetch and lookup in test/utils/web.ts)
│   ├── tool-mail/                   # @chamvi/tool-mail (fake IMAP server in test/utils/imap.ts)
│   ├── tool-calendar/               # @chamvi/tool-calendar (fake CalDAV fetch in test/utils/caldav.ts)
│   ├── knowledge/                   # @chamvi/knowledge
│   ├── ui/                          # @chamvi/ui
│   │   ├── src/                     # Node entries (tsdown -> dist/index.mjs: uiRoutes(); dist/module.mjs: uiModule())
│   │   ├── app/                     # The SPA (Vite root -> dist/app), own tsconfig for vue-tsc
│   │   └── test/{unit,e2e}/         # Vitest (routes, app modules), Playwright smoke spec + demo server
│   ├── ui-kit/                      # @chamvi/ui-kit (the Vue base of the dashboard and the *-ui pages)
│   ├── {tool-mail,tool-calendar,github,chat-discord,chat-whatsapp}-ui/ # src/module (Node), app/ (a page, Vite root -> dist/app)
│   ├── app/                         # @chamvi/app
│   │   ├── src/                     # main entry src/index.ts, subpath entries src/{authup,testing}/index.ts
│   │   └── test/                    # global-setup.ts (postgres:18-alpine via testcontainers), utils/harness.ts (aliases @chamvi/app/testing's harness)
│   ├── cli/                         # @chamvi/cli (bin chamvi -> dist/cli.mjs)
│   │   ├── src/cli.ts               # the bin (shebang, then the header)
│   │   └── test/fixtures/           # apps the commands and the spawned bin run: app (README), failing, hang, slow, keyless, broken
│   ├── store-db/               # @chamvi/store-db (same layout)
│   │   ├── src/{entities,migrations,schema,store}/
│   │   └── test/global-setup.ts     # Starts postgres:18-alpine via testcontainers for the suite
│   └── docs/                        # @chamvi/docs (private, not released): VitePress site (npm run docs:dev / docs:build)
│       ├── src/.vitepress/          # config.mts, theme/ (Tailwind v4 tokens, Layout.vue), components/{home,layout}/
│       └── src/snippets/            # Code samples included via <<<, type-checked by the docs typecheck
├── images/
│   ├── node/                        # Dockerfile + README of ghcr.io/chamvi/node:26 (the app base image: node:26-trixie-slim, tini, uid 1000)
│   └── sandbox-dev/                 # Dockerfile + README of ghcr.io/chamvi/sandbox-dev (Debian, git, build tools, ripgrep, jq, mise; root)
├── .github/
│   ├── actions/{install,build}/     # Composite actions
│   ├── workflows/{ci,release,docs,images}.yml # CI (one Node 26 check job, the Chromium e2e job), release-please + npm publish, docs to GitHub Pages, sandbox image (craneship, amd64 + arm64)
│   └── dependabot.yml               # Daily npm + github-actions updates, docker for images/sandbox-dev, images/node
├── nx.json                          # Task orchestration and caching
├── tsconfig.json                    # Root config, path aliases for every package -> packages/*/src
├── tsconfig.build.json              # Shared compiler options
├── eslint.config.js                 # @tada5hi/eslint-config flat config
├── release-please-config.json       # One linked release for every package (linked-versions)
└── .release-please-manifest.json    # Current released versions
```

## Related Repositories

| Repo | Holds | Reference |
|------|-------|-----------|
| [chamvi/helm](https://github.com/chamvi/helm) | Chart `agent-app` (`oci://ghcr.io/chamvi/helm/agent-app`) | [references/helm.md](references/helm.md) |
| [chamvi/agent-template](https://github.com/chamvi/agent-template) | The starter app, its Dockerfile, CI and Flux examples | [references/agent-template.md](references/agent-template.md) |

## Packages

| Package | Status | Responsibility |
|---------|--------|----------------|
| `@chamvi/access` | Exists (unpublished) | `can`/`canSome` over authup bindings, `Permission`; depends on `@authup/access`, `smob`, no `@chamvi/*`; browser-safe |
| `@chamvi/core` | Exists | defineModelAgent, run engine (streaming, structured output, models (`ModelRef`, `IModelResolver`, `resolveModel(ctx, ref?)`), the live agent registry with revision markers), `provide`/`inject` tool context, checkpoints, the channel contract (`IChannel`, subscriptions, the envelope, `ToolContext.channels` with effect-recorded `emit()`, `consoleChannel()`), durable `approve()`, `dispatch`/`dispatchTo`/`waitForDispatch` over `agent.on()` roles, simple agents, agent `hooks`, run artifacts, state API, budgets, the keyring and connection vault, the `IStore` aggregate, in-memory store; depends on access |
| `@chamvi/test-kit` | Exists | `ControllableClock`, `describeRepositoryContract()`, `describeKnowledgeRepositoryContract()` (structural types: `@chamvi/knowledge` tests with the kit), `describeWorkspaceContract()`, `mockEmbeddingModel()`, `createGitFixture()`, `createFakeGithub()` (in-process GitHub for `createGithubApp({ fetch })`); depends on core only (`IWorkspace` typed structurally, see conventions.md → *Dependency graph*); core and sandbox never depend on it |
| `@chamvi/http` | Exists | `createHttpApp()` (routup v6): REST API, SSE run stream, the `httpChannel()`/`mcpChannel()`/`webhookChannel()` channels with `http.on()`/`webhook.on()`, the `/channels/<name>` mount (`channels` option), MCP endpoint, authenticators (static tokens, authup, oidc), health, metrics, the built OpenAPI document and Swagger UI, `createShutdown()`; depends on access, `@authup/access`, `@routup/decorators`, `@routup/body`, `@routup/swagger-ui`, peer on core |
| `@chamvi/channel-cron` | Exists | `cronChannel()` (start/stop around one locked hubwire component per cron subscription, live on `agents.changed`), `cron.on()`, `runJob()`; `createScheduler()` internal; depends on `hubwire` and `cron-parser`, peer on core |
| `@chamvi/store-db` | Exists | `createDatabaseStore()`, entities, initial migration, `migrateStore`, `purgeExpired` |
| `@chamvi/sandbox` | Exists | `ISandboxProvider`/`IWorkspace`/`IExecTransport` contracts, path, repo, ref, limit and env rules, output collector, `createRemoteWorkspace()`, `prepareWorkspace()`, the run-scoped `createWorkspaceManager()` with `create_workspace`/`dispose_workspace`, `readRepositoryInstructions()` and `read_repository_instructions` (bounded `AGENTS.md`/`CLAUDE.md` collection), the context pair `provideSandboxContext`/`injectSandboxContext`; `/module`: `sandboxModule()` (optional peer on `@chamvi/app`, the providers optional peers loaded by variable specifier); depends on `smob`, peer on core and `ai` |
| `@chamvi/sandbox-local` | Exists | `createLocalSandbox()`: temp directory + spawn, no isolation; depends on `smob`, peer on core and sandbox |
| `@chamvi/sandbox-docker` | Exists | `createDockerSandbox()`: one container per workspace (root inside, a hardened mode, a per-workspace `/cache`, a named shared volume opt-in); depends on `dockerode` + `@types/dockerode`, `smob`, peer on core and sandbox |
| `@chamvi/sandbox-k8s` | Exists | `createKubernetesSandbox()`, `createPodClient()`: one pod per workspace (root inside, a hardened mode, an optional cache claim); depends on `@kubernetes/client-node`, `smob`, peer on core and sandbox |
| `@chamvi/coding` | Exists | `codingTools()` (read_file, write_file, edit_file, multi_edit, grep, glob, list_files, bash with kept cwd and exports and output logs, background jobs with bash_output and bash_kill, git_diff), optional path-scoped instructions on ordinary UTF-8 workspace `read_file` results (its own default-on `repositoryInstructions` flag, independent of the manager), the `ICodingBackend` contract; depends on `smob`, peer on core, sandbox and `ai` |
| `@chamvi/skills` | Exists (0.5.0) | Skill domain types, catalogs, custom adapters and per-engine runtime; `gitSkills()`/`loadSkillBundle()` carry the runtime automatically; bundle hashing/loading and `prepareSkills()` for setup/build; core peer, no runtime or peer app edge and no module registration (a devDependency on `@chamvi/app` for its integration tests, acyclic), Node >=26.0.0 plus Git for source preparation |
| `@chamvi/tool-files` | Exists (unpublished) | `fileTools()`: `list_artifacts`, `process_files`; depends on `just-bash`, `smob`, peer on core and `ai` |
| `@chamvi/tool-utils` | Exists (unpublished) | `utilityTools()`: `current_time`, date math, `calculate`, `run_info`; depends on `decimal.js`, `smob`, peer on core and `ai` |
| `@chamvi/tool-web` | Exists (0.5.0) | `webTools()`: `web_fetch` (public pages through a hapic client, an address check per hop); depends on `hapic`, `mdream`, `smob`, peer on core and `ai` |
| `@chamvi/tool-mail` | Exists (unpublished) | `mailTools()`: five read-only IMAP tools (EXAMINE, BODY.PEEK), `createMailClient()`; `/module`: `toolMailModule()`; depends on `imapflow`, `postal-mime`, `unpdf`, `fflate`, `smob`, peer on core and `ai` |
| `@chamvi/tool-calendar` | Exists (unpublished) | `calendarTools()`: two read-only CalDAV tools (PROPFIND, REPORT, GET), `createCalendarClient()`; `/module`: `toolCalendarModule()`; depends on `tsdav`, `ical.js`, `smob`, peer on core and `ai` |
| `@chamvi/knowledge` | Exists (0.5.0; resync and managed collections unreleased) | Knowledge collections (RAG): the `IKnowledgeRepository` contract, sources, `createKnowledge()` (the background indexer under the store lock `knowledge:<name>`), `knowledgeRoutes()`, `knowledgeTools()` (`knowledge_search`), the context pair; `/module`: `knowledgeModule()` (optional peer on `@chamvi/app`; reads `CHAMVI_KNOWLEDGE_MODEL`, contributes the routes); depends on `@chamvi/access`, `smob`, peer on core and `ai`, optional peer on http (types only); never a dependency of app, test-kit types its contract structurally |
| `@chamvi/ui` | Exists | `uiRoutes()`: serves the prebuilt Vue 3 + vuecs dashboard (runs, approvals, agent state, schedules, connections) as one extra route of `createHttpApp({ routes })`; `/module`: `uiModule()` (optional peer on `@chamvi/app`); peer on core and http, every SPA library a bundled devDependency; names no provider |
| `@chamvi/ui-kit` | Exists (unpublished) | The Vue base of the dashboard and the `*-ui` pages: API client, session, `AppShell`, connection components, `mountPage()`; `/vite`: `definePageConfig()`; peer on core, access, http, Vue and vuecs |
| `@chamvi/{tool-mail,tool-calendar,github,chat-discord,chat-whatsapp}-ui` | Exists (unpublished) | One prebuilt dashboard page each at `<uiBase>/ext/<slug>`; `/module`: `toolMailUiModule()`, ... over `uiPageModule()`; only peer the optional `@chamvi/app`; `chat-whatsapp-ui` owns the QR |
| `@chamvi/app` | Exists | `createApp()` (`IApp`: `start`, `check`, `stop`, `runJob`, `migrate`), built-in orkos modules (config, store, static tokens, engine (every `AppToken.CHANNELS` contribution), agents (the `CHAMVI_AGENTS_DIR` folder loader and watcher, the agent packages of `CHAMVI_AGENTS`/`chamvi.json`/createApp), scheduler (the cron channel), http (the http, mcp and webhook channels, the `/channels` mount), plus the optional `consoleChannelModule()`, `uiPageModule()`) over an eldin container, `AppToken`s, env readers, `readConfig()`, the JSON line logger, the model settings and resolver (`CHAMVI_MODEL`, `CHAMVI_PROVIDER_*`, `chamvi.json`); the module contract (tokens, `ModuleName`, env readers, `approvalUrlOf`, `AppContext`, `ILifecycleHook`, the orkos `IModule` and eldin `IContainer` types); subpaths `/authup` (`authupModule`, `oidcModule`) and `/testing` (`buildModuleHarness()`, `createModuleHarness()`), the other optional modules live in their feature packages on `/module`; re-exports core, access and part of http; depends on access, core, http, channel-cron, store-db, `orkos`, `eldin`, `envix`, `routup`, `smob`, `locter`, `jiti`, `validup`, `@ebec/core`, peer on `ai`, `typeorm`, `pg` (optional: the AI SDK provider packages and the two `@authup/*` packages; no `@chamvi/*` feature package in any dependency field) |
| `@chamvi/cli` | Exists | The `chamvi` bin (citty): `dev`, `build`, `start` (`--check`), `run-job`, `migrate`, entry loading, signals, exit codes `0/1/2`; `runCli()`; depends on `citty`, peer on app (optional `tsdown`) |
| `@chamvi/coding-claude-code` | Planned | Claude Code coding backend |
| `@chamvi/github` | Exists | `createGithubApp()` (App JWT, `IClock` installation-token cache, Octokit per installation), `githubChannel()` (`in`: the signed deliveries, one run per matching agent with the address `<owner>/<repo>#<n>`; `out`: one comment per key, deduplicated by `effectMarker()` found before posting), `github.on()`, `github.to()`, read tools and effect write tools, the context pair `provideGithubContext`/`injectGithubContext`; `/module`: `githubModule()` (optional peer on `@chamvi/app`; contributes the channel); depends on `@octokit/core` + `plugin-paginate-rest`, `@ebec/http`, `smob`, peer on core and `ai` (http a devDependency for tests) |
| `@chamvi/channel-openclaw` | Exists | `openclawChannel()` (out only): `POST <hooksPath>/agent` with `Idempotency-Key`, a deterministic message with the approval link, an `IClock` timeout; `/module`: `openclawModule()` (optional peer on `@chamvi/app`; contributes the channel); no runtime dependencies, peer on core |
| `@chamvi/chat` | Exists (unpublished) | `chatChannel()` over Chat SDK (`chat`) adapters (`createChatIngressAdapter()`), `chat.on()`/`chat.to()`, policy-first intake with conversation binding, text/approval-link outbound, webhooks on the channel mount, the platform seam `IChatPlatform`; `/module`: `chatModule()`; depends on `smob`, peer on core, http and `chat`; no platform SDK |
| `@chamvi/chat-discord` | Exists (unpublished) | `createDiscordChat()`: a discord.js Gateway client, `@chat-adapter/discord` for parsing, own REST send; `/module`: `discordModule()`; depends on `smob`, peer on core, chat, `chat`, `discord.js` and the adapter (exactly `4.44.0`) |
| `@chamvi/chat-whatsapp` | Exists (unpublished) | `createWhatsAppChat()`: a chamvi-owned adapter on Baileys over `@chamvi/chat`'s public API only, `createStoreWhatsAppAuth()`; `/module`: `whatsappModule()`; depends on `smob`, peer on core, chat, `chat` and `baileys` (exactly `7.0.0-rc14`) |

The memory store lives inside `@chamvi/core` (no separate `store-memory` package), because every test needs it.

The module maps of each package are in the `## Module map` section of its [topic file](architecture.md#topic-files); core's in [topics/core.md](topics/core.md).
