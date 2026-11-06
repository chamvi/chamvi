# just-bash

Pinned dependency: **`just-bash@3.6.0`**, exact in `packages/tool-files/package.json` and integrity-pinned in `package-lock.json`. Repository: [vercel-labs/just-bash](https://github.com/vercel-labs/just-bash). The installed npm package is the versioned source of the interface mapping below; do not substitute current main during upgrades.

| Published 3.6.0 interface/source | chamvi consumer | Contract to preserve |
|---|---|---|
| `dist/Bash.d.ts`: `BashOptions`, `Bash`, `ExecOptions`; bundled `dist/bundle/index.js` | `packages/tool-files/src/tools/process.ts` | New `Bash` per call, cwd `/workspace`, selected `InitialFiles` byte buffers only; `exec(command, { signal })` |
| `dist/limits.d.ts`: `ExecutionLimits`, `ExecutionLimitProfile`, `resolveLimits()` | `tools/process.ts`, `options/module.ts` | Explicit `hardened` profile; execution/source/output/filesystem limits; other hardened budgets remain active |
| `dist/commands/registry.d.ts`: `CommandName` | `tools/constants.ts`: `FILES_COMMANDS` | Fixed data-command allowlist; no automatic expansion when upstream adds commands |
| `dist/fs/in-memory-fs/in-memory-fs.d.ts`, `dist/fs/interface.d.ts`: `lstat()`, `readFileBuffer()` | `tools/process.ts`: output preflight/staging | Regular-file and byte-size checks before raw reads/publication; byte-preserving output buffers |
| `dist/encoding.d.ts`: `stdoutAsBytes()`, `decodeBytesToUtf8()` | `tools/process.ts`; `tools/helpers.ts`: `boundedText()` | Interpret stdout's byte/text marker before decoding, then cap decoded stdout/stderr together without splitting UTF-8 |
| `dist/Bash.d.ts`: optional `fs`, `env`, `fetch`, `network`, `customCommands`, `python`, `javascript` | `tools/process.ts`, `options/module.ts` | Never forward these capabilities; no host environment/filesystem, network or custom/runtime injection |

Paths under `tools/` and `options/` in this table are relative to `packages/tool-files/src/`. The package root and `/browser` are upstream exports; there is no `/ai` export or `createBashTool` in 3.6.0. Use the plain chamvi tools, not an older integration example. Upstream's `Sandbox` is an interpreter convenience API, not a VM or native-executable workspace.

## Differences from real workspaces

The shell and commands run in the chamvi process. Default virtual files include synthetic command/proc entries; their bytes count toward filesystem limits. chamvi therefore reserves at least 65,536 scratch bytes while enforcing exact aggregate artifact import/export caps independently. No real `git`, `npm`, `node`, Python, SQL or archive executables exist in this command surface. There is no VM isolation or complete host-security boundary.

`@chamvi/coding` instead uses workspace providers and real programs, with run-scoped workspace lifecycle and retained shell state. Keep Docker/Kubernetes for builds, Git, tests and servers; do not implement `ISandboxProvider` with this interpreter. Execution budget exhaustion can return nonzero status/diagnostics rather than throw; chamvi exports nothing on nonzero exits, while unexpected infrastructure exceptions become `SandboxError`.

On upgrade, inspect the pinned declarations and bundled implementation for command registration (including nested `env`/`xargs`/`find` dispatch), filesystem initialization quotas, output encoding and abort/limit behavior. Run the real-interpreter and engine tests under `packages/tool-files/test/unit/tools/`, plus its executable README test. Confirm foreign-run ownership, byte limits, fresh-call state, taint, per-tool-call output identity and cancellation before publication. Native artifact writes remain nontransactional.
