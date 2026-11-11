# Installation

```bash
npm install @chamvi/core ai
```

- **Runtime:** Node.js 26.0.0 or newer. The package is ESM only.
- **AI SDK:** `ai@^7` (the Vercel AI SDK) is a peer dependency. Install the provider package of your model as well, for example `@ai-sdk/anthropic` or `@ai-sdk/openai`.
- **Schemas:** tool input schemas are whatever the AI SDK accepts. The examples in these docs use [zod](https://zod.dev). State collections take any [Standard Schema](https://standardschema.dev).

```bash
npm install @ai-sdk/anthropic zod
```

## TypeORM store

For durable runs and more than one replica, add the TypeORM store with `typeorm` and the `pg` driver (PostgreSQL):

```bash
npm install @chamvi/store-db typeorm pg
```

See [database store](/repositories/database).

## Testing helpers

`@chamvi/test-kit` exports the store contract suite and a controllable clock. `@chamvi/core` and `vitest` are its peer dependencies:

```bash
npm install --save-dev @chamvi/test-kit vitest
```

See [Writing a Repository](/repositories/writing-a-repository) and the [test-kit reference](/reference/test-kit).

## Workspaces and coding tools

Agents that run commands or edit code add the sandbox manager, the coding tools and one provider:

```bash
npm install @chamvi/sandbox @chamvi/coding @chamvi/sandbox-docker   # one container per workspace
npm install @chamvi/sandbox @chamvi/coding @chamvi/sandbox-k8s      # one pod per workspace
npm install @chamvi/sandbox @chamvi/coding @chamvi/sandbox-local    # development only, no isolation
```

`@chamvi/core` and `ai` are peer dependencies of all of them. See [Workspaces & Coding](/guide/workspaces).

## File processing tools

For JSON, CSV and text transformations over run artifacts without a coding workspace:

```bash
npm install @chamvi/tool-files
```

`@chamvi/core` and `ai` are peer dependencies. See [File processing tools](/guide/tools#file-processing-tools).

## Web research tools

Agents that read the web (pages, changelogs, package registries) add the web fetch tool:

```bash
npm install @chamvi/tool-web
```

`@chamvi/core` and `ai` are peer dependencies. See [Web research tools](/guide/tools#web-research-tools).

## Utility tools

Agents that need the date, date arithmetic or a sum add the utility tools:

```bash
npm install @chamvi/tool-utils
```

`@chamvi/core` and `ai` are peer dependencies. See [Utility tools](/guide/tools#utility-tools).

## Mail and calendar tools

Agents that read a mailbox or a calendar add the read-only IMAP and CalDAV tools:

```bash
npm install @chamvi/tool-mail @chamvi/tool-calendar
```

`@chamvi/core` and `ai` are peer dependencies. See [Mail and calendar tools](/guide/tools#mail-and-calendar-tools).

## App and CLI

An agent repository that runs as a service (HTTP, cron, the store from `DATABASE_URL`, a graceful shutdown) exports one `createApp()` and runs it with the `chamvi` bin:

```bash
npm install @chamvi/app @chamvi/cli ai @ai-sdk/anthropic typeorm pg
npm install --save-dev tsdown   # only for chamvi build
```

`@chamvi/app` re-exports `@chamvi/core`, so the repository imports one package; the CLI needs Node.js 26.0.0 or newer. See [Apps & Modules](/guide/app).

## Packages

| Package | Status |
|---|---|
| `@chamvi/core` | Shipped (0.x) |
| `@chamvi/access` | Unreleased, the permission check over authup bindings (core, http, app and the dashboard use it) |
| `@chamvi/test-kit` | Shipped (0.x), test helpers |
| `@chamvi/channel-cron` | Shipped (0.x), the cron channel, one tick across replicas |
| `@chamvi/store-db` | Shipped (0.x), TypeORM store (PostgreSQL) |
| `@chamvi/http` | Shipped (0.x), REST, SSE, MCP, the webhook channel and the `/channels/<name>` mount |
| `@chamvi/github` | Shipped (0.x), the GitHub channel (deliveries in, comments out) and tools |
| `@chamvi/sandbox`, `@chamvi/sandbox-local`, `@chamvi/sandbox-docker`, `@chamvi/sandbox-k8s` | Shipped (0.x), disposable workspaces |
| `@chamvi/coding` | Shipped (0.x), coding tools over a workspace |
| `@chamvi/tool-files` | Unreleased, JSON/CSV/text tools over selected run artifacts |
| `@chamvi/tool-utils` | Unreleased, `current_time`, date arithmetic, decimal `calculate` and `run_info` |
| `@chamvi/tool-web` | Shipped (0.x), `web_fetch`: public pages as markdown, registry JSON as is |
| `@chamvi/tool-mail`, `@chamvi/tool-calendar` | Unreleased, read-only mail (IMAP) and calendar (CalDAV) tools |
| `@chamvi/channel-openclaw` | Shipped (0.x), the OpenClaw channel: messages and approval requests into a chat |
| `@chamvi/ui` | Shipped (0.x), the dashboard |
| `@chamvi/knowledge` | Unreleased, knowledge collections searched by meaning through `knowledge_search` |
| `@chamvi/app`, `@chamvi/cli` | Shipped (0.x), `createApp()` and the `chamvi` bin |
| Base image, Helm chart, template | <Badge type="warning" text="Planned" /> See the [roadmap](/roadmap) |

chamvi is pre-1.0: a minor version may contain breaking changes, including changes to the store schema.
