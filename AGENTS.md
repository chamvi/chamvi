<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# chamvi: Agent Guide

chamvi is a TypeScript framework for building self-hosted, channel-driven AI agents. Agents are declared with `defineAgent()`, subscribe to channels (cron, http, mcp, webhook, github, chat, WhatsApp Web; OpenClaw and the console are out-only channels) that start their runs, and execute as durable runs whose steps are checkpointed in a pluggable store, so runs survive restarts and approval pauses. Outbound is tool-driven (`injectChannel`, `replyChannel`), and a tool asks for a human with a durable `approve()`. LLM access goes through the Vercel AI SDK; its types (`ToolSet`, `LanguageModel`, `ModelMessage`) pass through unchanged and are never re-wrapped.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build
npm run test
npm run typecheck
npm run lint
```

- **Node.js**: >=26.0.0
- **Package manager**: npm (workspaces)
- **Build orchestration**: nx (`nx run-many`), packages built with tsdown (ESM only)

Packages live in `packages/*`. `@chamvi/app`, `@chamvi/channel-cron`, `@chamvi/channel-openclaw`, `@chamvi/chat`, `@chamvi/chat-whatsapp`, `@chamvi/cli`, `@chamvi/coding`, `@chamvi/core`, `@chamvi/github`, `@chamvi/http`, `@chamvi/knowledge`, `@chamvi/sandbox`, `@chamvi/sandbox-docker`, `@chamvi/sandbox-k8s`, `@chamvi/sandbox-local`, `@chamvi/skills`, `@chamvi/store-db`, `@chamvi/test-kit`, `@chamvi/tool-web` and `@chamvi/ui` exist today (container images in `images/*`); the others are planned (see [Project Structure](.agents/structure.md)).

## Detailed Guides

- **[Project Structure](.agents/structure.md)**: Workspace layout, related repositories, existing and planned packages
- **[Architecture](.agents/architecture.md)**: Core concepts, engine, cross-cutting rules (agents, channels, trust, approvals), run lifecycle, repository contract, idempotency, errors, and the index of topic files
- **[Testing](.agents/testing.md)**: Vitest setup, source aliasing, in-memory repositories, repository contracts suite
- **[Conventions](.agents/conventions.md)**: Tooling, naming rules, commits, release flow, external references (`.agents/references/`)
- **[Design](.agents/design.md)**: Brand direction, colour tokens, type, logo and docs landing page rules
- **[Topic files](.agents/topics/)**: per-subsystem detail and module maps (agents, skills, channels, trust, approvals, store, http, github, sandbox, coding, ui, app, ...), indexed at the end of architecture.md. NOT loaded into every session: read the topic file before changing that area.

### Writing agent docs

The guides above (except Design) are loaded into every session, so their whole size is paid on every task; the topic files are read on demand. Both tell a future task what it must know to avoid a silent breakage. **They are not a changelog, a design record or a test index.**

| Content | Where it goes |
|---|---|
| A cross-cutting rule or an easy-to-break invariant, its reason, and the rejected alternative | One line in a guide, with the issue number |
| A subsystem's invariants and rejected alternatives | Its topic file (`.agents/topics/<name>.md`) |
| Mechanism the code already shows | Nowhere, or a code comment |
| How a defect happened, before/after, `pinned by spec X` | The PR description or commit message |
| What changed for users or operators | CHANGELOG or the docs site (`packages/docs`) |

The test for a paragraph: would removing it let a reasonable change break something silently? If not, leave it out.

- **Update docs only when an invariant or a cross-cutting rule changes.** A bug fix or a feature that follows the existing rules needs no doc change. Edit the existing line; never add a section for a single fix.
- **Describe what the code does now.** No `used to`, `no longer`, `before #N`. The one exception is a rejected alternative: keep the verdict and its one-line reason.
- **Cite issues or PRs, never local plan files** (`plan 026`): `.agents/plans/` is gitignored and resolves for one person on one machine.
- **`npm run lint` enforces it** through the `agentDocs` checks of `@tada5hi/eslint-config`: a size limit per agent doc, a limit on everything `CLAUDE.md` loads through its imports, and no history phrase outside code (`used to`, `no longer`, `before #N`, `pinned by`, `plan NNN`). The limits live in `eslint.config.js`: lower them as the docs shrink; raising one is a policy change, not a fix. `.agents/plans/` is not linted.

## Downstream Repos

Two repos outside this monorepo depend on its contract: [chamvi/helm](https://github.com/chamvi/helm) (the `agent-app` chart) and [chamvi/agent-template](https://github.com/chamvi/agent-template) (the starter app). A change to the CLI (commands, arguments, exit codes, signals), env variable names or defaults, the HTTP port or route paths (`/healthz`, `/readyz`, `/metrics`, `/channels/*`), the base image, sandbox RBAC or labels, the public `@chamvi/app` API or the model string format must be checked against both, using the contract maps in [helm.md](.agents/references/helm.md) and [agent-template.md](.agents/references/agent-template.md), and followed by a PR there.

## Plans

Plans and specs are local only (`.agents/plans/` and `docs/superpowers/` are gitignored). Never commit them.

## Commits, Issues & Pull Requests

- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `Generated with Claude Code`) to issue or pull request titles, bodies, or comments.
- Do **not** use em dashes in commit messages, issue or pull request titles, bodies, or comments. Use a comma, a colon, parentheses, or a separate sentence instead.
