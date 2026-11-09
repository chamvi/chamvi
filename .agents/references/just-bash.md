# just-bash

Pinned dependency: **`just-bash@3.6.0`**, exact in `packages/tool-files/package.json` and integrity-pinned in `package-lock.json`. Repository: [vercel-labs/just-bash](https://github.com/vercel-labs/just-bash). The installed npm package is the versioned source of the interface mapping below; do not substitute current main during upgrades.

| Published 3.6.0 interface/source | chamvi consumer | Contract to preserve |
|---|---|---|
| `dist/Bash.d.ts`: `BashOptions`, `Bash`, `ExecOptions`; bundled `dist/bundle/index.js` | `packages/tool-files/src/runner/worker.ts` | New `Bash` per call on its own thread, cwd `/workspace`, selected `InitialFiles` byte buffers only; `exec(command)`, cancellation terminates the thread |
| `dist/limits.d.ts`: `ExecutionLimits`, `ExecutionLimitProfile`, `resolveLimits()` | `tools/process.ts`, `options/module.ts` | Explicit `hardened` profile; execution/source limits; cumulative work output `max(65_536, maxBytes * 4)` and filesystem `65_536 + maxBytes * 2`; count budgets raised by `FILES_RECORD_BUDGETS`, other hardened budgets remain active |
| `dist/commands/registry.d.ts`: `CommandName` | `tools/constants.ts`: `FILES_COMMANDS` | Fixed data-command allowlist; no automatic expansion when upstream adds commands |
| `dist/fs/in-memory-fs/in-memory-fs.d.ts`, `dist/fs/interface.d.ts`: `lstat()`, `readFileBuffer()` | `runner/worker.ts`: output preflight/staging | Regular-file and byte-size checks before raw reads/publication; byte-preserving output buffers |
| `dist/encoding.d.ts`: `stdoutAsBytes()`, `decodeBytesToUtf8()` | `runner/worker.ts`; `tools/helpers.ts`: `boundedDiagnostics()` | Interpret stdout's byte/text marker before decoding, then cap decoded stdout/stderr at 65,536 UTF-8 bytes together, stderr first, with a visible `[output truncated]` inside the cap and intact code points |
| `dist/Bash.d.ts`: optional `fs`, `env`, `fetch`, `network`, `customCommands`, `python`, `javascript` | `tools/process.ts`, `options/module.ts` | Never forward these capabilities; no host environment/filesystem, network or custom/runtime injection |

Paths under `tools/` and `options/` in this table are relative to `packages/tool-files/src/`. The package root and `/browser` are upstream exports; there is no `/ai` export or `createBashTool` in 3.6.0. Use the plain chamvi tools, not an older integration example. Upstream's `Sandbox` is an interpreter convenience API, not a VM or native-executable workspace.

## Differences from real workspaces

Default virtual files include synthetic command/proc entries whose bytes count toward filesystem limits, hence the 65,536-byte reserve. just-bash charges cumulative output before redirection and across pipeline stages, hence the separate work allowance. No real `git`, `npm`, `node`, Python, SQL or archive executables exist in this command surface.

`@chamvi/coding` instead uses workspace providers and real programs, with run-scoped workspace lifecycle and retained shell state. Keep Docker/Kubernetes for builds, Git, tests and servers; do not implement `ISandboxProvider` with this interpreter. Execution budget exhaustion can return nonzero status/diagnostics rather than throw; chamvi exports nothing on nonzero exits, while unexpected infrastructure exceptions become `SandboxError`.

On upgrade, inspect the pinned declarations and bundled implementation for command registration (including nested `env`/`xargs`/`find` dispatch), filesystem quotas, output accounting, encoding and limit behaviour, then run `packages/tool-files/test/unit/tools/`.

The 3.6.0 dependency tree pins `guarded-fetch@0.1.3` and `undici@7.29.0`; production `npm audit` reports advisories including [TLS option loss](https://github.com/advisories/GHSA-2m5v-pch6-74hx). Network commands and fetch configuration are unavailable through fileTools, so the affected HTTP/WebSocket paths are not offered here. This is an installed dependency risk, not evidence of an exploitable fileTools path. Recheck the published upstream tree on upgrade; a root-only npm override would not fix this package's consumers.
