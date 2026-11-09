<p align="center">
    <img src="./.github/assets/logo.svg" alt="chamvi" width="128" height="128" />
</p>

<h1 align="center">chamvi</h1>

<p align="center">
    <b>Self-hosted, channel-driven AI agents with durable runs, built on the Vercel AI SDK.</b><br>
    You write the agent with the AI SDK. chamvi queues its runs, checkpoints every step,<br>
    pauses for approvals and resumes interrupted runs, in your own Node process and database.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/core"><img src="https://img.shields.io/npm/v/@chamvi/core" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/LICENSE"><img src="https://img.shields.io/github/license/chamvi/chamvi" alt="License" /></a>
</p>

<p align="center">
    <a href="#why-chamvi"><b>Why chamvi?</b></a>
    ·
    <a href="#packages">Packages</a>
    ·
    <a href="#quick-start">Quick start</a>
    ·
    <a href="#deployment">Deployment</a>
    ·
    <a href="https://chamvi.dev">Docs</a>
</p>

---

## Why chamvi?

The AI SDK runs a model and its tool loop, and stops there. An agent that reacts to webhooks and schedules also needs a queue, a way to survive a restart halfway through a run, a guard against posting the same comment twice after a retry, and a way to wait a day for a human to approve a call. That usually means a hosted orchestrator, or a lot of glue code.

chamvi is that layer as a library, with no orchestrator server and no Redis:

| Concern | AI SDK on its own | chamvi |
|---|---|---|
| **Intake** | You call `generateText` from your handler | `dispatch()` stores a `queued` run; an `idempotencyKey` turns a redelivery into the existing run |
| **Concurrency** | Two webhooks for the same issue race each other | One run at a time per `concurrencyKey`, enforced through the store across replicas |
| **Durability** | A crash loses the conversation | A checkpoint after every step; a recovered run continues from the latest one |
| **Side effects** | A retried tool call posts again | `defineEffectTool()` records each result per effect key and can check the remote system before acting |
| **Approvals** | You build the pause, the storage and the callback | `await approve(ctx, { title })` inside the tool pauses the run in `waiting`, across restarts; the answer replays the call |
| **Limits** | `stopWhen` per call | `maxSteps`, `maxTokens` and `timeoutMs` per run, settled as `completed` or `failed` |
| **Shutdown** | Runs die with the process | `drain()` waits for in-flight runs, then marks the rest `interrupted` for another replica |
| **Running code** | Model-written commands run wherever your process runs | `create_workspace` gives the run a disposable container or pod with the repository checked out; the coding tools work inside it, and it is removed when the run settles |

Models, messages and tools stay AI SDK types: `defineModelAgent()` takes a `LanguageModel` and plain AI SDK tools (`tool()`, or `defineTool()` for tools that read the run context), and nothing is wrapped in a chamvi type.

<p align="center">
    <img src="./.github/assets/run-lifecycle.svg" alt="dispatch() stores a queued run, deduplicated by idempotency key. The engine claims it and runs it: every LLM or tool step is followed by a checkpoint in the store. A run ends completed, failed or cancelled. A tool call that needs approval pauses the run in waiting until it is answered; approving or denying it requeues the run. drain() or a crashed process leaves a run interrupted or with an expired claim; recover() requeues it, and the next execution continues from the latest checkpoint." width="100%" />
</p>

A run moves from `queued` to `running` and settles `completed`, `failed` or `cancelled`. A tool that awaits `approve()` parks it in `waiting` until the answer requeues it (the call then runs again with the decision); `drain()` or a crash leaves it `interrupted` (or with a lapsed claim) until `recover()` requeues it. Every requeued run continues from its latest checkpoint.

Workflow DevKit, Mastra, Inngest and Trigger.dev also make agent runs durable. How they differ in where runs live, step checkpoints, tool side effects, approvals and intake is on [Compared with other runtimes](https://chamvi.dev/getting-started/comparison).

## Packages

**Runtime**

| Package | Version | Description |
|---|---|---|
| [`@chamvi/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@chamvi/core)](https://www.npmjs.com/package/@chamvi/core) | Agents, the channel contract, the run engine, checkpoints, effect tools, durable approvals, dispatch between agents, hooks, agent state and the in-memory store |
| [`@chamvi/store-db`](./packages/store-db) | [![npm](https://img.shields.io/npm/v/@chamvi/store-db)](https://www.npmjs.com/package/@chamvi/store-db) | PostgreSQL store (TypeORM): durable runs, leases, agent state and conversations across replicas, with migrations |
| [`@chamvi/app`](./packages/app) | [![npm](https://img.shields.io/npm/v/@chamvi/app)](https://www.npmjs.com/package/@chamvi/app) | `createApp()`: config, store, engine, channels and HTTP as modules booted from env and `chamvi.json`, plus agent folders and agent packages |
| [`@chamvi/cli`](./packages/cli) | [![npm](https://img.shields.io/npm/v/@chamvi/cli)](https://www.npmjs.com/package/@chamvi/cli) | The `chamvi` bin: `dev`, `build`, `start` (`--check`), `run-job`, `migrate` |

**Channels**

| Package | Version | Description |
|---|---|---|
| [`@chamvi/http`](./packages/http) | [![npm](https://img.shields.io/npm/v/@chamvi/http)](https://www.npmjs.com/package/@chamvi/http) | REST control API, server-sent events, an MCP endpoint, the `http`, `mcp` and `webhook` channels and the `/channels/<name>` mount, with bearer, authup and OIDC authentication |
| [`@chamvi/channel-cron`](./packages/channel-cron) | [![npm](https://img.shields.io/npm/v/@chamvi/channel-cron)](https://www.npmjs.com/package/@chamvi/channel-cron) | The cron channel: fires `cron.on()` subscriptions once per tick across replicas, with overlap policies, timezones and one-shot jobs |
| [`@chamvi/github`](./packages/github) | [![npm](https://img.shields.io/npm/v/@chamvi/github)](https://www.npmjs.com/package/@chamvi/github) | GitHub App authentication, the GitHub channel (verified deliveries in, deduplicated issue comments out), and issue, label, comment, search, release and compare tools |
| [`@chamvi/chat`](./packages/chat) | [![npm](https://img.shields.io/npm/v/@chamvi/chat)](https://www.npmjs.com/package/@chamvi/chat) | Chat channels over Chat SDK adapters: conversation binding, text replies and approval links |
| [`@chamvi/chat-discord`](./packages/chat-discord) | [![npm](https://img.shields.io/npm/v/@chamvi/chat-discord)](https://www.npmjs.com/package/@chamvi/chat-discord) | Discord through the Gateway as a chat channel |
| [`@chamvi/chat-whatsapp`](./packages/chat-whatsapp) | [![npm](https://img.shields.io/npm/v/@chamvi/chat-whatsapp)](https://www.npmjs.com/package/@chamvi/chat-whatsapp) | WhatsApp Web (Baileys) as a chat channel |
| [`@chamvi/channel-openclaw`](./packages/channel-openclaw) | [![npm](https://img.shields.io/npm/v/@chamvi/channel-openclaw)](https://www.npmjs.com/package/@chamvi/channel-openclaw) | The OpenClaw channel (out only): messages and approval requests into an OpenClaw chat |

**Tools and workspaces**

| Package | Version | Description |
|---|---|---|
| [`@chamvi/sandbox`](./packages/sandbox) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox)](https://www.npmjs.com/package/@chamvi/sandbox) | Sandbox contracts and the workspace manager: one workspace per run and repository, `create_workspace` / `dispose_workspace`, cleanup when the run settles, repository instructions |
| [`@chamvi/sandbox-local`](./packages/sandbox-local) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox-local)](https://www.npmjs.com/package/@chamvi/sandbox-local) | Workspaces in a temporary directory, for development and tests (no isolation) |
| [`@chamvi/sandbox-docker`](./packages/sandbox-docker) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox-docker)](https://www.npmjs.com/package/@chamvi/sandbox-docker) | One container per workspace: root inside so package managers work, resource limits, a hardened mode, a package cache |
| [`@chamvi/sandbox-k8s`](./packages/sandbox-k8s) | [![npm](https://img.shields.io/npm/v/@chamvi/sandbox-k8s)](https://www.npmjs.com/package/@chamvi/sandbox-k8s) | One pod per workspace: the same on Kubernetes, without a service account token |
| [`@chamvi/coding`](./packages/coding) | [![npm](https://img.shields.io/npm/v/@chamvi/coding)](https://www.npmjs.com/package/@chamvi/coding) | `read_file`, `write_file`, `edit_file`, `multi_edit`, `grep`, `glob`, `list_files`, `bash` (with background jobs) and `git_diff` inside a workspace |
| [`@chamvi/tool-files`](./packages/tool-files) | [![npm](https://img.shields.io/npm/v/@chamvi/tool-files)](https://www.npmjs.com/package/@chamvi/tool-files) | JSON, CSV and text processing over selected run artifacts, with fresh in-memory files per call |
| [`@chamvi/tool-utils`](./packages/tool-utils) | [![npm](https://img.shields.io/npm/v/@chamvi/tool-utils)](https://www.npmjs.com/package/@chamvi/tool-utils) | The current time, date arithmetic, decimal `calculate` and `run_info`: what a model cannot do reliably itself |
| [`@chamvi/tool-web`](./packages/tool-web) | [![npm](https://img.shields.io/npm/v/@chamvi/tool-web)](https://www.npmjs.com/package/@chamvi/tool-web) | `web_fetch`: a public page as markdown, text or raw, behind an address check |
| [`@chamvi/tool-mail`](./packages/tool-mail) | [![npm](https://img.shields.io/npm/v/@chamvi/tool-mail)](https://www.npmjs.com/package/@chamvi/tool-mail) | Read-only mail tools over IMAP: search, read and thread mails, attachment text; never changes a mailbox |
| [`@chamvi/tool-calendar`](./packages/tool-calendar) | [![npm](https://img.shields.io/npm/v/@chamvi/tool-calendar)](https://www.npmjs.com/package/@chamvi/tool-calendar) | Read-only calendar tools over CalDAV: calendars and events, recurrences expanded in one zone |
| [`@chamvi/knowledge`](./packages/knowledge) | [![npm](https://img.shields.io/npm/v/@chamvi/knowledge)](https://www.npmjs.com/package/@chamvi/knowledge) | Knowledge collections searched by meaning through `knowledge_search`: declared in code, embedded in the background, re-embedded on a model change |
| [`@chamvi/skills`](./packages/skills) | [![npm](https://img.shields.io/npm/v/@chamvi/skills)](https://www.npmjs.com/package/@chamvi/skills) | Skills from pinned Git sources and local bundles, verified before they load |

**Operations and testing**

| Package | Version | Description |
|---|---|---|
| [`@chamvi/ui`](./packages/ui) | [![npm](https://img.shields.io/npm/v/@chamvi/ui)](https://www.npmjs.com/package/@chamvi/ui) | The dashboard: agents, runs with live steps, an approvals inbox, agent state and schedules, served by `uiRoutes()` |
| [`@chamvi/test-kit`](./packages/test-kit) | [![npm](https://img.shields.io/npm/v/@chamvi/test-kit)](https://www.npmjs.com/package/@chamvi/test-kit) | `ControllableClock`, mock models, the store and workspace contract suites, a git fixture and a fake GitHub |

## Quick start

```bash
npm install @chamvi/core ai @ai-sdk/anthropic zod --save
```

ESM only, Node.js `>=26.0.0`. `ai@^7` is a peer dependency; use the provider package of your model.

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import {
    createMemoryStore,
    Engine,
    consoleChannel,
    defineModelAgent,
    defineEffectTool,
} from '@chamvi/core';

const triage = defineModelAgent({
    name: 'triage',
    model: anthropic('claude-sonnet-5-5'),
    instructions: 'Label the issue in the payload as bug, feature or question.',
    tools: {
        // recorded per (run, tool, input): a recovered run reuses the result
        addLabel: defineEffectTool({
            description: 'Adds a label to the issue.',
            inputSchema: z.object({ label: z.enum(['bug', 'feature', 'question']) }),
            execute: async ({ label }, { context }) => {
                // answers where the run came from, once per message
                await context.channels.findOne()?.emit({ body: `Labelled as ${label}.` });
                return { added: label };
            },
        }),
    },
});

const engine = new Engine({
    store: createMemoryStore(),
    agents: [triage],
    // channels are what runs come from and talk to: cron, HTTP, GitHub, chat, ...
    channels: [consoleChannel()],
});
await engine.start();

const { runId } = await engine.dispatch({
    agent: 'triage',
    trigger: 'manual',
    channel: 'console',
    address: 'issue-1',
    payload: { title: 'App crashes on start' },
});

await engine.idle();
console.log(await engine.getRun(runId)); // status: 'completed', output: the model's last answer

await engine.drain();
```

`createMemoryStore()` keeps everything in process memory; it is for development and tests. Use `@chamvi/store-db` for durable runs. Channels, effect tools, approvals, hooks, agent state, budgets and the full option reference are in the [`@chamvi/core` README](./packages/core#readme) and the [guide](https://chamvi.dev/guide/).

### Give the agent a workspace

```bash
npm install @chamvi/sandbox @chamvi/sandbox-docker @chamvi/coding --save
```

```typescript
import { ToolDeniedError, approve } from '@chamvi/core';
import { codingTools } from '@chamvi/coding';
import { createWorkspaceManager } from '@chamvi/sandbox';
import { createDockerSandbox } from '@chamvi/sandbox-docker';

const workspaces = createWorkspaceManager({
    // one container per workspace from ghcr.io/chamvi/sandbox-dev:trixie
    provider: createDockerSandbox(),
    // the model can only clone your own repositories
    allowRepo: (url) => url.startsWith('https://github.com/acme/'),
});

const repro = defineModelAgent({
    name: 'repro',
    model: anthropic('claude-sonnet-5-5'),
    instructions: 'Check out the repository from the payload, write a failing test for the reported bug ' +
        'and answer with the output and the diff.',
    tools: { ...workspaces.tools(), ...codingTools(workspaces) },
    hooks: {
        // every shell command waits for a human; the run pauses durably until answered
        async beforeToolExecution({ toolName, input }, ctx) {
            if (toolName !== 'bash') return input;
            const { approved } = await approve(ctx, { title: 'Run a shell command?', body: (input as { command: string }).command });
            if (!approved) throw new ToolDeniedError('Command refused.');
            return input;
        },
    },
});

// add repro to the Engine's agents, then: a run's workspaces go once it settled
workspaces.attach(engine);
// on shutdown, after engine.drain()
await workspaces.close();
```

`createLocalSandbox()` from `@chamvi/sandbox-local` runs workspaces in a temporary directory for development; `createKubernetesSandbox({ namespace })` from `@chamvi/sandbox-k8s` runs one pod per workspace. Limits, the image and the hardening are in the [`@chamvi/sandbox` README](./packages/sandbox#readme).

## Deployment

An app built on [`@chamvi/app`](./packages/app) runs through the `chamvi` CLI (`chamvi start`), configured from env. Three pieces outside the packages take it to production:

- **[chamvi/agent-template](https://github.com/chamvi/agent-template)**: a GitHub template repository with one example agent, a two-stage Dockerfile, CI and Flux examples.
- **`ghcr.io/chamvi/node:26`** ([`images/node`](./images/node)): the base image, `node:26-trixie-slim` with tini as PID 1 and uid 1000.
- **[chamvi/helm](https://github.com/chamvi/helm)**: the `agent-app` chart (`oci://ghcr.io/chamvi/helm/agent-app`) with probes, graceful drain, run-job CronJobs and the sandbox RBAC.

The [deployment guide](https://chamvi.dev/deployment/) covers Docker, Kubernetes, multiple replicas and the channel setups.

## Development

```bash
npm install
npm run build
npm run test
npm run typecheck
npm run lint
```

The packages live in `packages/*`, built with tsdown and orchestrated by nx. Commits follow Conventional Commits; release-please releases every package under one linked version.

## Contributing

Before starting to work on a pull request, it is important to review the guidelines for
[contributing](./CONTRIBUTING.md) and the [code of conduct](./CODE_OF_CONDUCT.md).
These guidelines will help to ensure that contributions are made effectively and are accepted.

## License

Made with 💚

Published under [Apache License 2.0](./LICENSE).
