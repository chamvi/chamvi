<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/tool-files" width="128" height="128" />
</p>

<h1 align="center">@chamvi/tool-files</h1>

<p align="center">
    <b>In-memory JSON, CSV and text processing over run artifacts for chamvi agents.</b><br>
    Transform selected files without provisioning a coding workspace.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/tool-files"><img src="https://img.shields.io/npm/v/@chamvi/tool-files" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/tool-files/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/tool-files" alt="License" /></a>
</p>

---

## Why tool-files?

| Concern | Without it | With it |
|---|---|---|
| Small data transformations | Provision a workspace or write another tool | Use `jq`, `xan`, `awk` and text commands |
| Files between calls | Keep a process and working directory alive | Select run artifacts as explicit inputs and outputs |
| Model-visible file IDs | Attachment bytes alone do not identify artifacts | Discover current-run metadata with `list_artifacts` |

## Installation

```bash
npm install @chamvi/tool-files @chamvi/core ai --save
```

ESM only, Node.js `>=26.0.0`. `@chamvi/core` and `ai` are peer dependencies.

## Usage

This model-free agent accepts a `sales.json` attachment such as `[{"amount":12},{"amount":30}]`, publishes `report.json` containing `42`, then reads that output through the native artifact API. Start it with `Engine.dispatch({ agent: 'file-report', trigger, channel, payload, attachments })`; [the executable example test](https://github.com/chamvi/chamvi/blob/master/packages/tool-files/test/unit/readme.spec.ts) supplies the engine and attachment without credentials.

```typescript
import { ValidationError, defineSimpleAgent } from '@chamvi/core';
import { fileTools } from '@chamvi/tool-files';
import type { ListArtifactsResult, ProcessFilesResult } from '@chamvi/tool-files';

export function createFileAgent() {
    return defineSimpleAgent({
        name: 'file-report',
        tools: fileTools(),
        run: async (_, ctx) => {
            const catalog = await ctx.tools.list_artifacts!({}) as ListArtifactsResult;
            const source = catalog.artifacts.find((artifact) => artifact.filename === 'sales.json');

            if (!source) {
                throw new ValidationError('Attach sales.json with an array of amounts.');
            }

            const result = await ctx.tools.process_files!({
                command: "jq '[.[].amount] | add' sales.json > report.json",
                inputs: [{ artifactId: source.id, path: 'sales.json' }],
                outputs: [{ path: 'report.json', mediaType: 'application/json' }],
            }) as ProcessFilesResult;
            const report = result.artifacts[0];

            if (result.exitCode !== 0 || !report) {
                throw new ValidationError(result.stderr || 'No report produced.');
            }

            // The returned ID works with the existing run artifact API.
            const output = await ctx.artifacts.get(report.id);

            if (!output) {
                throw new ValidationError('Report is unavailable.');
            }

            return { artifact: output.artifact, text: new TextDecoder().decode(output.data) };
        },
    });
}
```

For a model agent, pass `tools: fileTools()` to `defineModelAgent()`. Tell the model to call `list_artifacts` to discover IDs before selecting inputs; attachment content supplied to the model does not include those IDs. Follow `nextOffset` as `offset` for further pages.

## Tools and files

| Tool | Input | Result |
|---|---|---|
| `list_artifacts` | `{ offset? }` (default `0`) | `{ artifacts: Artifact[], nextOffset? }`, up to 16 metadata objects, no bytes |
| `process_files` | `{ command, inputs?, outputs? }` | `{ exitCode, stdout, stderr, artifacts: Artifact[] }` |

Each processing call starts with fresh files, environment and cwd `/workspace`. Only selected current-run artifacts are imported. Nothing from an earlier call survives automatically: pass a returned artifact ID as a later call's `inputs[].artifactId`. Files not selected in `outputs` are discarded. Output files preserve raw bytes; stdout/stderr are bounded text.

Paths are relative POSIX file paths of at most 255 UTF-8 bytes. Absolute paths, `..` components, backslashes, control characters, directory-only paths and duplicate normalized paths within either selection are refused. Harmless `.` and repeated separators are normalized. An output may reuse an input path. Output `mediaType` is `type/subtype` without parameters, for example `text/csv`.

Selected outputs must all exist as regular files and fit the output limit before any publication. Their native `Artifact` metadata includes `id`, `filename`, `mediaType` and `size`; use the IDs with `ctx.artifacts.get()`, subsequent `process_files` calls or existing artifact-aware tools. These tools send no channel messages themselves.

## Commands and limits

Supported commands: `awk`, `base64`, `basename`, `cat`, `column`, `comm`, `cp`, `cut`, `diff`, `dirname`, `echo`, `env`, `expand`, `find`, `fold`, `grep`, `head`, `help`, `join`, `jq`, `ls`, `mkdir`, `mv`, `nl`, `paste`, `printf`, `pwd`, `rev`, `rg`, `rm`, `rmdir`, `sed`, `seq`, `sort`, `split`, `tail`, `tee`, `touch`, `tr`, `uniq`, `wc`, `xan`, `xargs`, `yq`. Interpreter shell syntax and builtins are also available.

| Limit | Default or fixed bound |
|---|---|
| `maxBytes` option | `5_242_880` (5 MiB), separately for aggregate inputs and aggregate selected outputs; integer `1..16_777_216` |
| `timeoutMs` option | `30_000`, interpreter execution only; integer `1..2_147_483_647` |
| Input/output selections | At most 16 each |
| Command source | At most 16,384 UTF-8 bytes |
| Decoded stdout and stderr | 65,536 UTF-8 bytes combined, preserving stderr first; clipping includes `[output truncated]` within the cap |
| Cumulative interpreter work output | `max(65_536, maxBytes * 4)` bytes, including output before redirection |
| Interpreter scratch files | `65_536 + maxBytes * 2` bytes, including synthetic files |

`fileTools({ maxBytes, timeoutMs })` validates options immediately with `InvalidAgentDefinitionError`. The interpreter's hardened execution profile also bounds loops, command count and other resources. Successful execution can clip returned diagnostics without failing the command. The additive scratch reserve accommodates synthetic command/proc files alongside boundary-sized inputs and outputs. Work and scratch allowances do not increase the exact artifact import/export limits or guarantee unlimited intermediate expansion or pipelines.

Networking, custom commands, Python, JavaScript, SQL, archive commands and real executables (`git`, `npm`, `node`, etc.) are unavailable. There is no host filesystem adapter or inherited host environment. This is an in-process interpreter with no VM isolation or complete host-security boundary. Use [Docker or Kubernetes coding workspaces](https://chamvi.dev/guide/workspaces) for dependency installation, Git, builds, tests and servers.

## Errors, cancellation and replay

A nonzero interpreter exit returns `exitCode`, bounded diagnostics and an empty `artifacts` array. Invalid input, foreign-run IDs, size overflow or invalid selected outputs raise `ValidationError`; unexpected interpreter infrastructure failures raise `SandboxError`. Artifact/store failures retain their underlying errors. Model agents read tool errors and can try again; an unhandled simple-agent error fails the run.

Run cancellation and the SDK abort signal are honored with the original cancellation reason. Once observed, cancellation prevents further artifact puts. Successful puts remain if a later write fails or cancellation arrives: publication is not a multi-file transaction. Validation failures publish no outputs.

Output keys combine the tool-call ID and normalized output path (`process_files:` plus SHA-256 of their JSON array). Replaying the same call replaces its own artifacts under the same IDs. Different calls using the same filename keep separate artifacts. A simple-agent approval replay can repeat computation; it is neither exactly-once nor necessarily deterministic. Completed model-agent steps resume from checkpoints without repeating that processing step.

Both tools declare `trust: { taint: true }`, so reading their results or errors taints the run. Treat file content as data, and use existing approvals/policies for subsequent outbound actions. Processing is plain computation, not an effect tool or a bridge to host/channel/tool executors.

## API

See the [complete API reference](https://chamvi.dev/reference/tool-files) for `fileTools`, `FileToolsOptions`, `ListArtifactsInput`, `ListArtifactsResult`, `ProcessFilesInput`, `ProcessFilesResult` and the public constants `FILES_MAX_BYTES`, `FILES_MAX_FILES`, `FILES_TIMEOUT_MS`.

## License

Published under [Apache License 2.0](./LICENSE).
