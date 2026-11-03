# Project Structure

## Directory Layout

```
chamvi/
├── packages/
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
│   ├── channel-cron/                # @chamvi/channel-cron (same layout; aliases core, test-kit and itself to src)
│   ├── http/                        # @chamvi/http (same layout; aliases core, test-kit and itself to src)
│   ├── test-kit/                    # @chamvi/test-kit (same layout; aliases core and itself to src)
│   ├── github/                      # @chamvi/github (same layout; aliases core, http, test-kit, itself and its /module, app, app/testing, channel-cron, store-db to src)
│   │   └── test/fixtures/deliveries/ # Recorded GitHub webhook bodies (issues.opened, a bot's issue_comment)
│   ├── channel-openclaw/            # @chamvi/channel-openclaw (aliases core, test-kit, itself and its /module, plus app, app/testing, http, channel-cron, store-db; fake gateway in test/utils/openclaw.ts)
│   ├── chat/                        # @chamvi/chat (aliases core, http, test-kit, itself and its /module, plus app, app/testing, channel-cron, store-db; fake Chat SDK adapter in test/utils/)
│   ├── chat-whatsapp/               # @chamvi/chat-whatsapp (aliases core, chat, chat/module, test-kit, itself, plus app, http, channel-cron, store-db; fake Baileys sockets and auth in test/utils/)
│   ├── sandbox/                     # @chamvi/sandbox (same layout; aliases core, itself and its /module, sandbox-local, app, app/testing, http, channel-cron, store-db; private test/utils/clock.ts)
│   │   └── src/instructions/        # Bounded workspace-exec collector, include/protocol helpers, source/provenance/diagnostic types and limits
│   ├── sandbox-local/               # @chamvi/sandbox-local (aliases core, sandbox, test-kit and itself)
│   ├── sandbox-docker/              # @chamvi/sandbox-docker (same aliases as local, plus coding for test/unit/coding.spec.ts; fixture images in test/fixtures/{no-git,no-cache,no-init,entrypoint})
│   │   └── test/global-setup.ts     # dockerode ping() gate, builds images/sandbox-dev as chamvi/sandbox-dev:test, removes the test cache volume
│   ├── sandbox-k8s/                 # @chamvi/sandbox-k8s (same aliases; tests drive a fake IPodClient, test/utils/client.ts)
│   ├── coding/                      # @chamvi/coding (aliases core, sandbox, sandbox-local, test-kit and itself)
│   ├── skills/                      # @chamvi/skills (optional skill runtime, catalogs, bundles and pinned Git sources)
│   ├── tool-web/                    # @chamvi/tool-web (aliases core, test-kit and itself; fake transport, fetch and lookup in test/utils/web.ts)
│   ├── knowledge/                   # @chamvi/knowledge (aliases core, test-kit, itself and its /module, plus app, app/testing, http, channel-cron, store-db; indexer and tool helpers in test/utils/{indexer,tools}.ts; the module spec keeps its own recording logger and free-port helper)
│   ├── ui/                          # @chamvi/ui (aliases core, http, test-kit, itself and its /module, plus app, app/testing, channel-cron, store-db to src)
│   │   ├── src/                     # Node entries (tsdown -> dist/index.mjs: uiRoutes(); dist/module.mjs: uiModule())
│   │   ├── app/                     # The SPA (Vite root -> dist/app), own tsconfig for vue-tsc
│   │   └── test/{unit,e2e}/         # Vitest (routes, app modules), Playwright smoke spec + demo server
│   ├── app/                         # @chamvi/app (aliases every workspace package it imports, itself and its subpaths to src)
│   │   ├── src/                     # main entry src/index.ts, subpath entries src/{authup,testing}/index.ts
│   │   └── test/                    # global-setup.ts (postgres:18-alpine via testcontainers), utils/harness.ts (aliases @chamvi/app/testing's harness)
│   ├── cli/                         # @chamvi/cli (bin chamvi -> dist/cli.mjs; aliases app and its imports to src)
│   │   ├── src/cli.ts               # the bin (shebang, then the header)
│   │   └── test/fixtures/           # apps the commands and the spawned bin run: app (README), failing, hang, slow, keyless, broken
│   ├── store-db/               # @chamvi/store-db (same layout)
│   │   ├── src/{entities,migrations,schema,store}/
│   │   └── test/global-setup.ts     # Starts postgres:18-alpine via testcontainers for the suite
│   └── docs/                        # @chamvi/docs (private, not released): VitePress site (npm run docs:dev / docs:build)
│       ├── src/.vitepress/          # config.mts, theme/ (Tailwind v4 tokens, Layout.vue), components/{home,layout}/
│       ├── src/public/              # logo.svg (favicon), fixed light/dark logo and run-lifecycle copies
│       └── src/snippets/            # Code samples included via <<<, type-checked by the docs typecheck
├── images/
│   ├── node/                        # Dockerfile + README of ghcr.io/chamvi/node:26 (the app base image: node:26-trixie-slim, tini, uid 1000)
│   └── sandbox-dev/                 # Dockerfile + README of ghcr.io/chamvi/sandbox-dev (Debian, git, build tools, ripgrep, jq, mise; root)
├── .github/
│   ├── assets/                      # logo.svg (+ test-kit and organisation variants), run-lifecycle.svg
│   ├── actions/{install,build}/     # Composite actions
│   ├── workflows/{ci,release,docs,images}.yml # CI (one Node 26 check job plus the Chromium e2e job), release-please + npm publish, docs to GitHub Pages, sandbox image (craneship, amd64 + arm64)
│   ├── ISSUE_TEMPLATE/              # Bug report and feature request templates
│   ├── FUNDING.yml                  # GitHub Sponsors
│   └── dependabot.yml               # Daily npm + github-actions updates, docker for images/sandbox-dev, images/node
├── .husky/commit-msg                # Runs commitlint
├── CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
├── nx.json                          # Task orchestration and caching
├── tsconfig.json                    # Root config, path aliases for every package (@chamvi/core, @chamvi/sandbox, @chamvi/channel-*, ...) -> packages/*/src
├── tsconfig.build.json              # Shared compiler options
├── eslint.config.js                 # @tada5hi/eslint-config flat config
├── commitlint.config.mjs            # Conventional Commits
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
| `@chamvi/core` | Exists (0.1.0) | defineAgent, run engine (streaming, structured output, models: `ModelRef`, `EngineOptions.model`/`models` (`IModelResolver`), `checkAgentModel`, `resolveModel(ctx, ref?)`, the live agent registry `putAgent`/`removeAgent` with revision markers), `provide`/`inject` context for tools, checkpoints, the channel contract (`IChannel`, subscriptions, the envelope with `channel`/`address`, `EngineOptions.channels` started and stopped by the engine, `ToolContext.channels` with effect-recorded `emit()`, `consoleChannel()`), durable `approve()` (suspend, pending tool calls, replay), `dispatch`/`dispatchTo`/`waitForDispatch` over `agent.on()` roles, `dispatchTools()`, code agents (`defineAgent({ run })`), agent `hooks`, run artifacts, state API, budgets, the `IStore` aggregate, in-memory store |
| `@chamvi/test-kit` | Exists (0.1.0) | `ControllableClock`, `describeRepositoryContract()`, `describeKnowledgeRepositoryContract()` (structural types: `@chamvi/knowledge` tests with the kit), `describeWorkspaceContract()`, `mockEmbeddingModel()`, `createGitFixture()`, `createFakeGithub()` (in-process GitHub for `createGithubApp({ fetch })`); depends on core only (the workspace contract types `IWorkspace` structurally as `ContractWorkspace`: a sandbox edge would close a release-please cycle through app); core and sandbox never depend on it |
| `@chamvi/http` | Exists (0.1.0) | `createHttpApp()` (routup v6): REST control API, SSE run stream, the `httpChannel()`/`mcpChannel()`/`webhookChannel()` channels with `http.on()`/`webhook.on()`, the `/channels/<name>` mount (`channels` option), MCP endpoint, authenticators (static tokens, authup, oidc), health, metrics, `createShutdown()`; peer on core |
| `@chamvi/channel-cron` | Exists (0.1.0) | `cronChannel()` (start/stop around one locked hubwire component per cron subscription, live on `agents.changed`), `cron.on()`, `runJob()`; `createScheduler()` internal; depends on `hubwire` and `cron-parser`, peer on core |
| `@chamvi/store-db` | Exists (0.1.0) | `createDatabaseStore()`, entities, initial migration, `migrateStore`, `purgeExpired` |
| `@chamvi/sandbox` | Exists (0.1.0) | `ISandboxProvider`/`IWorkspace`/`IExecTransport` contracts, path, repo, ref, limit and env rules, output collector, `createRemoteWorkspace()`, `prepareWorkspace()`, the run-scoped `createWorkspaceManager()` with `create_workspace`/`dispose_workspace`, root and explicit path-scoped instruction delivery (`read_repository_instructions`), `readRepositoryInstructions()` (bounded current-worktree `AGENTS.md`/`CLAUDE.md` and include collector, scopes/hashes/parents/diagnostics), the context pair `provideSandboxContext`/`injectSandboxContext`; `/module`: `sandboxModule()` (optional peer on `@chamvi/app`, the providers optional peers loaded by variable specifier); depends on `smob`, peer on core and `ai` |
| `@chamvi/sandbox-local` | Exists (0.1.0) | `createLocalSandbox()`: temp directory + spawn, no isolation; depends on `smob`, peer on core and sandbox |
| `@chamvi/sandbox-docker` | Exists (0.1.0) | `createDockerSandbox()`: one container per workspace (root inside, a hardened mode, a per-workspace `/cache`, a named shared volume opt-in); depends on `dockerode` + `@types/dockerode`, `smob`, peer on core and sandbox |
| `@chamvi/sandbox-k8s` | Exists (0.1.0) | `createKubernetesSandbox()`, `createPodClient()`: one pod per workspace (root inside, a hardened mode, an optional cache claim); depends on `@kubernetes/client-node`, `smob`, peer on core and sandbox |
| `@chamvi/coding` | Exists (0.1.0) | `codingTools()` (read_file, write_file, edit_file, multi_edit, grep, glob, list_files, bash with kept cwd and exports and output logs, background jobs with bash_output and bash_kill, git_diff), optional path-scoped instructions on ordinary UTF-8 workspace `read_file` results (its own default-on `repositoryInstructions` flag, independent of the manager), the `ICodingBackend` contract; depends on `smob`, peer on core, sandbox and `ai` |
| `@chamvi/skills` | Exists (0.5.0) | Skill domain types, catalogs, custom adapters and per-engine runtime; `gitSkills()`/`loadSkillBundle()` carry the runtime automatically; bundle hashing/loading and `prepareSkills()` for setup/build; core peer, no runtime or peer app edge and no module registration (a devDependency on `@chamvi/app` for its integration tests, acyclic), Node >=26.0.0 plus Git for source preparation |
| `@chamvi/tool-web` | Exists (0.5.0) | `webTools()`: `web_fetch` (a public http(s) page as markdown, text or raw through a hapic client, proxy from the environment; every URL and redirect target resolved and refused on a non-public address, `allowUrl` decides first; byte, character and time caps, offset paging); depends on `hapic`, `mdream`, `smob`, peer on core and `ai` |
| `@chamvi/knowledge` | Exists (0.5.0; resync and managed collections unreleased) | Knowledge collections (RAG): the `IKnowledgeRepository` contract and `createMemoryKnowledgeRepository()`, `chunkText()`/`contentHash()`, sources (`folder()`, `defineKnowledgeSource()`), `knowledgeCollection()`, `createKnowledge()` (`IKnowledge`: the background indexer under the store lock `knowledge:<name>`, generations, orphans, `resyncMs` and `sync()`, managed collections, `check()`), `knowledgeRoutes()` (REST under `/knowledge`), `knowledgeTools()` (`knowledge_search`, taint by collection), the context pair `provideKnowledgeContext`/`injectKnowledgeContext`; `/module`: `knowledgeModule()` (optional peer on `@chamvi/app`; reads `CHAMVI_KNOWLEDGE_MODEL`, contributes the routes); depends on `smob`, peer on core and `ai`, optional peer on http (types only); never a dependency of app, test-kit types its contract structurally |
| `@chamvi/ui` | Exists (0.1.0) | `uiRoutes()`: serves the prebuilt Vue 3 + vuecs dashboard (runs, run detail, approvals, agent state, schedules) as one extra route of `createHttpApp({ routes })`; `/module`: `uiModule()` (optional peer on `@chamvi/app`); peer on core and http (types only), every SPA library a bundled devDependency |
| `@chamvi/app` | Exists (0.1.0) | `createApp()` (`IApp`: `start`, `check`, `stop`, `runJob`, `migrate`), built-in orkos modules (config, store, static tokens, engine (every `AppToken.CHANNELS` contribution), agents (the `CHAMVI_AGENTS_DIR` folder loader and watcher, the agent packages of `CHAMVI_AGENTS`/`chamvi.json`/createApp), scheduler (the cron channel), http (the http, mcp and webhook channels, the `/channels` mount), plus the optional `consoleChannelModule()`) over an eldin container, `AppToken`s, env readers, `readConfig()`, the JSON line logger, the model settings and resolver (`CHAMVI_MODEL`, `CHAMVI_PROVIDER_*`, `chamvi.json`), `IApp.check()`; the module contract (tokens, `ModuleName`, env readers, `approvalUrlOf`, `AppContext`, `ILifecycleHook`, the orkos `IModule` and eldin `IContainer` types); subpaths `/authup` (`authupModule`, `oidcModule`) and `/testing` (`buildModuleHarness()`, `createModuleHarness()`), the other optional modules live in their feature packages on `/module`; re-exports core and part of http; depends on core, http, channel-cron, store-db, `orkos`, `eldin`, `envix`, `routup`, `smob`, `locter`, `jiti`, `validup`, `@ebec/core`, peer on `ai`, `typeorm`, `pg` (optional: the AI SDK provider packages and the two `@authup/*` packages; no `@chamvi/*` feature package in any dependency field) |
| `@chamvi/cli` | Exists (0.1.0) | The `chamvi` bin (citty): `dev`, `build`, `start` (`--check`), `run-job`, `migrate`, entry loading, signals, exit codes `0/1/2`; `runCli()`; depends on `citty`, peer on app (optional `tsdown`) |
| `@chamvi/coding-claude-code` | Planned | Claude Code coding backend |
| `@chamvi/github` | Exists (0.1.0) | `createGithubApp()` (App JWT, `IClock` installation-token cache, Octokit per installation), `githubChannel()` (`in`: the signed deliveries, one run per matching agent with the address `<owner>/<repo>#<n>`; `out`: one comment per key, deduplicated by `effectMarker()` found before posting), `github.on()`, `github.to()`, read tools and effect write tools, the context pair `provideGithubContext`/`injectGithubContext`; `/module`: `githubModule()` (optional peer on `@chamvi/app`; contributes the channel); depends on `@octokit/core` + `plugin-paginate-rest`, `@ebec/http`, `smob`, peer on core and `ai` (http a devDependency for tests) |
| `@chamvi/channel-openclaw` | Exists (0.1.0) | `openclawChannel()` (out only): `POST <hooksPath>/agent` with `Idempotency-Key`, a deterministic message with the approval link, an `IClock` timeout; `/module`: `openclawModule()` (optional peer on `@chamvi/app`; contributes the channel); no runtime dependencies, peer on core |
| `@chamvi/chat` | Exists (unpublished) | `chatChannel()` over Chat SDK (`chat`) adapters (`createChatIngressAdapter()`), `chat.on()`/`chat.to()`, policy-first intake with conversation binding, text/approval-link outbound, webhooks on the channel mount, the platform seam `IChatPlatform`; `/module`: `chatModule()`; depends on `smob`, peer on core, http and `chat`; no platform SDK |
| `@chamvi/chat-whatsapp` | Exists (unpublished) | `createWhatsAppChat()`: a chamvi-owned adapter on Baileys over `@chamvi/chat`'s public API only; depends on `smob`, peer on core, chat, `chat` and `baileys` (exactly `7.0.0-rc14`) |

The memory store lives inside `@chamvi/core` (no separate `store-memory` package), because every test needs it.

The module maps of each package are in the `## Module map` section of its [topic file](architecture.md#topic-files); core's in [topics/core.md](topics/core.md).
