# @chamvi/tool-files

In-memory JSON, CSV and text processing over run artifacts for chamvi agents. ESM only, Node.js `>=26.0.0`.

```bash
npm install @chamvi/tool-files @chamvi/core ai --save
```

`@chamvi/core` and `ai` are peer dependencies. See [File processing tools](/guide/tools#file-processing-tools) for a model-agent example, or the [executable model-free example](https://github.com/chamvi/chamvi/blob/master/packages/tool-files/test/fixtures/readme-example.ts).

## fileTools

```ts
function fileTools(options?: FileToolsOptions): {
    list_artifacts: Tool<ListArtifactsInput, ListArtifactsResult>;
    process_files: Tool<ProcessFilesInput, ProcessFilesResult>;
};

const FILES_MAX_BYTES: 5_242_880;
const FILES_MAX_FILES: 16;
const FILES_TIMEOUT_MS: 30_000;
```

```ts
type FileToolsOptions = { maxBytes?: number; timeoutMs?: number };
```

`maxBytes` accepts integers `1..16_777_216`; `timeoutMs` accepts integers `1..2_147_483_647`. Invalid options raise `InvalidAgentDefinitionError` at factory creation. There is no runtime, network or custom-command configuration.

## list_artifacts

Returns up to 16 native current-run `Artifact` metadata objects without loading bytes. `offset` defaults to `0` and must be a nonnegative safe integer. Pass `nextOffset` as `offset` to continue; an empty or out-of-range page has no cursor. Model-visible attachment content does not carry artifact IDs, so discover them here before selecting inputs.

## process_files

<<< ../../../tool-files/src/tools/types.ts{ts}

Each call creates a fresh in-memory filesystem, environment and cwd `/workspace`. `inputs` maps selected current-run artifact IDs to relative paths; `outputs` selects files to publish as native run artifacts. Both lists default to empty, at most 16 items each. No unrelated artifacts, host files or previous call state are imported. Pass a returned artifact ID explicitly to a later call to retain a file. Unselected files disappear after the call.

Paths name relative POSIX files of at most 255 UTF-8 bytes: no absolute paths, `..` components, backslashes, control characters or directory-only paths. Harmless `.` and repeated separators normalize; duplicate normalized paths within a selection are refused. An output may name an input path. Media types are `type/subtype` without parameters.

Each selected output must be a regular file and the complete output selection must fit the byte bound before any publication. Raw output bytes are preserved. Returned `Artifact` metadata is the existing core type, usable with `ctx.artifacts.get(id)` and existing artifact-aware tools. No channel delivery happens automatically. See [Artifacts](/reference/#artifacts).

## Commands and limits

Supported commands: `awk`, `base64`, `basename`, `cat`, `column`, `comm`, `cp`, `cut`, `diff`, `dirname`, `echo`, `env`, `expand`, `find`, `fold`, `grep`, `head`, `help`, `join`, `jq`, `ls`, `mkdir`, `mv`, `nl`, `paste`, `printf`, `pwd`, `rev`, `rg`, `rm`, `rmdir`, `sed`, `seq`, `sort`, `split`, `tail`, `tee`, `touch`, `tr`, `uniq`, `wc`, `xan`, `xargs`, `yq`. Interpreter shell syntax and builtins remain available.

| Bound | Value |
|---|---|
| Aggregate input bytes | `maxBytes`, default 5 MiB |
| Aggregate selected output bytes | Independently `maxBytes` |
| Command source | 16,384 UTF-8 bytes |
| Decoded stdout and stderr together | 65,536 UTF-8 bytes, stderr retained first; clipping includes `[output truncated]` within the cap |
| Cumulative interpreter work output | `max(65_536, maxBytes * 4)` bytes, including output before redirection |
| Execution deadline | `timeoutMs`, default 30 seconds, interpreter execution only; the thread is ended 2 seconds later |
| Interpreter heap | 512 MiB; exceeding it exits 137 |
| Scratch filesystem including synthetic files | `65_536 + maxBytes * 2` bytes |

The interpreter uses the hardened execution profile, with loop, command and record budgets raised to 1,000,000 to suit the byte limit. Successful commands can return clipped diagnostics. The additive scratch reserve accommodates synthetic command/proc files alongside full selected input/output room; artifact caps remain exact. Work and scratch budgets stay finite, so arbitrarily long pipelines or intermediate expansion can exhaust them.

Networking, custom commands, Python, JavaScript, SQL, archive commands and host executables are unavailable. The interpreter runs on a worker thread, ended at `timeoutMs` plus 2 seconds (exit 124) or above 512 MiB of heap (exit 137), so a stuck command cannot stall the host's event loop. A thread has no VM isolation or complete host-security boundary. Docker and Kubernetes remain the [coding workspace](/guide/workspaces) choices for Git, installing dependencies, builds, tests and servers.

## Errors and cancellation

Nonzero interpreter exits return bounded diagnostics with `artifacts: []`. Invalid selections, foreign-run IDs, invalid output files or size overflow raise `ValidationError` before publishing any outputs. Unexpected interpreter infrastructure failures raise `SandboxError`; artifact/store errors propagate unchanged. Model agents see tool errors; an unhandled error in a simple agent fails its run.

Run cancellation and SDK abort preserve the original reason. Cancellation stops further puts once observed, but successful puts remain. Store writes are not a transaction: an infrastructure failure or cancellation can leave already-published artifacts.

## Identity, replay and trust

Output filenames are normalized relative paths. The key is `process_files:` plus SHA-256 of JSON `[toolCallKey(ctx), normalizedPath]` (the core key includes run, step and call identity). The same call replay replaces its own artifact IDs; separate calls with the same output path retain separate artifacts, protecting earlier checkpoints.

These are plain computation tools, not effect tools. Simple-agent approval replay can rerun computation, which is neither exactly-once nor necessarily deterministic. Completed model-agent steps resume from their checkpoint without repeating that processing step. Both tools declare `trust: { taint: true }`; file content and results are untrusted data. Existing [outbound gates](/guide/tools#untrusted-content-and-outbound-tools) apply to later outbound operations.
