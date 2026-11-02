# Agent Packages

An app can load agents from npm packages by name, next to code agents and [agent folders](/guide/agent-folders). Ship one agent (or a few) as a package, from a registry or a workspace, and list it in the app:

```ts
import { createApp } from '@chamvi/app';
import { triage } from './agents/triage.ts';

export default createApp({
    agents: [triage, '@acme/review-agent', '@acme/agents/digest'],
});
```

A string entry is a bare package specifier: a package name, optionally with a subpath it exports. `createApp()` refuses a relative or absolute path, a URL and a Node builtin (`InvalidAgentDefinitionError`), and it never touches the file system: the packages are resolved when the app starts.

Package code runs in the app's process with the app's full access, like folder code. Only list packages you would deploy as part of the app.

## Listing packages

Three sources, merged in this order (a package listed twice loads once):

| Source | Form |
|---|---|
| `createApp({ agents })` | string entries beside the code agents |
| `chamvi.json` | `"agents": ["@acme/review-agent"]` (the [config file](/guide/models#the-config-file), `CHAMVI_CONFIG_FILE` names another one) |
| `CHAMVI_AGENTS` | comma-separated specifiers: `CHAMVI_AGENTS=@acme/review-agent,@acme/digest-agent` |

Each specifier resolves from the app's working directory with the ESM conditions, so every listed package must be installed in the app (`dependencies`, so the image has it). `chamvi build` keeps the specifiers as strings: nothing of a package is bundled into `dist/index.mjs`.

## The package

The package's entry (the specifier's `exports` target) default-exports `defineAgent()`'s result or a non-empty array of them:

```ts
// @acme/review-agent, src/index.ts
import { defineAgent } from '@chamvi/core';

export default defineAgent({
    name: 'review',
    instructions: 'Review the pull request.',
    tools: { /* ... */ },
});
```

- **Peers.** `@chamvi/*`, `ai` and `@ai-sdk/*` always resolve to the app's copies, also when the package installed copies of its own, so context keys, `instanceof` checks and the engine are shared. Declare them as `peerDependencies`.
- **Built JavaScript.** A published package ships JavaScript: Node does not strip TypeScript below `node_modules` (the error says to build the package). A workspace package linked into `node_modules` may export its `.ts` source, which Node runs from its real path with its own type stripping, not the transpiler agent folders load through: relative imports name the file with its `.ts` extension (`import './helper.ts'`, TypeScript's `allowImportingTsExtensions` or `rewriteRelativeImportExtensions`; `./helper.js` and `./helper` fail), and only erasable syntax works (no `enum`, `namespace` or constructor parameter properties).
- **Checked like folder agents.** Each agent is checked structurally (another `@chamvi/core` copy's agent passes) and rebuilt through the app's `defineAgent()`, then passes the same checks as a folder agent (channels, cron, MCP, model, skills).
- **`package.json` needs a `version`**: it is the agent's revision (below).

## Names

One agent name, one agent. **Code agents win**, then **packages** (in the merged order), then **folders**. The loser is reported as an issue and never loaded: `<name>: a code agent has this name; package <spec> is not loaded.`, `<name>: package <earlier> already provides this agent; package <spec> is not loaded.`, or for a folder `<name>: package <spec> provides this agent; the folder is not loaded.` A package agent keeps its name against folders once its package loaded, also when its checks or skill preparation then fail. A package that fails to import names no agents, so it reserves only the names whose stored revision is a package marker: on a first deployment, a folder of the name it would export loads.

## Revisions

Like a changed folder, a changed package agent cancels its unsettled runs once across replicas, and a [job never reloads](/guide/agent-folders#jobs-never-reload). A package agent's revision is its **package version**:

- **Production** (`chamvi start`, `run-job`, `start --check`): `<name>@<version>`, for example `@acme/review-agent@1.4.0`. Cancel reasons and the `agent reloaded` log name it in full.
- **Dev** (`chamvi dev`, `start --dev`): `<name>@<version>+<12 hex>`, the version plus a hash of the files the package publishes (its `files` field, else every file but `test/`; `node_modules`, dot-files, `README*`, `CHANGELOG*` and the other ignored docs left out unless they are JavaScript, `package.json` without its `version`) and of the top-level folder of the entry the specifier resolves to (a workspace package exporting `src/index.ts` while `files` names `dist`). Editing those files in an unreleased workspace package cancels its old runs on the next restart; code the entry imports from outside them (a sibling `../shared/` folder, say) does not move the marker.

Moving between the dev and the production marker of the same version cancels nothing.

Trade-offs to plan for:

- **Every version bump cancels.** A release that bumps a package's version cancels its agents' unsettled runs, also when its code did not change. With linked versions (one version for many packages, as release-please's `linked-versions` does), every release cancels the runs of every package agent.
- **A change without a version bump does not.** In production, new code under an unchanged version keeps the marker, so queued and waiting runs resume on the changed code. Ship tagged releases, never a rebuilt package under the same version.

## Removed agents

A package agent that is gone at a start (its package dropped from every list, or a release no longer exports it) is removed like a deleted agent folder: its revision marker is deleted and its unsettled runs are cancelled (`agent_removed`), with or without an agents dir. The configuration file's `agents` are read from the working directory the app runs in, the file the [model settings](/guide/models#the-config-file) come from.

## Issues

A package that cannot be resolved, imported or checked never stops the app: it is an issue (`agent load failed` in the log, `GET /agents` `issues`, the dashboard's notice), and every other agent starts. Resolve, import and check failures are recorded once per process (a package does not change while the app runs); a failed skill preparation is retried with the folders' capped backoff while the app runs. A package that failed before its agents were known is keyed by its specifier: `@acme/review-agent: not found from the app's directory; add it to the app's dependencies.` While one did not load, the start's boot removes no agent for a revision marker without a folder or package (the marker may belong to the missing package), and an agent folder named like a stored package agent is not loaded (`<name>: a package that did not load may provide this agent; the folder is not loaded.`), so a broken release never hands the agent and its runs to a folder.

- `chamvi start --check` resolves, imports and checks every package without writing the store; each issue is one stderr line (exit 2).
- `chamvi run-job <agent>` exits 1 (`package_agent_failed`) when the agent is a package agent that did not load, or when no agent has the name while a package did not load.

## No hot reload

Package agents load once at boot; nothing watches them. `chamvi dev` restarts the app when an imported file changes (`node --watch`), which includes a linked workspace package's source.

A package the entry imports itself (for example a helper module of the agent package) is loaded before the agents module pins its imports: list such a package by name only, or keep the shared helper in another package.
