# Host-local Git and simple-git evaluation

Chamvi runs host-local Git through bounded `execFile` in two places: the pinned-tree check of skills preparation (`packages/skills/src/prepare/tree.ts`: a blob-less fetch with a 5 minute timeout, `rev-parse` and `ls-tree` with 30 seconds each, joined on `close`, with the caller's signal) and fixture commands in `packages/test-kit/src/git-fixture/module.ts`. It does not depend directly on simple-git; the `skills` SDK clones with its own private copy of it ([vercel-skills.md](vercel-skills.md)). Sandbox Git stays on `workspace.exec`.

The direct-client experiment inspected simple-git 4.0.2 with argv-parser 2.0.1, using its published `dist/index.mjs.map` primary source contents. Real-process tests reproduced two contract regressions:

| Inspected upstream source | Behavior relevant to Chamvi |
|---------------------------|-----------------------------|
| `src/lib/plugins/error-detection.plugin.ts`, `isTaskError` | Default error detection requires both a nonzero exit and stderr. Silent nonzero exits and external signal termination can resolve successfully, so a failed command could pass as success. |
| `src/lib/runners/git-executor-chain.ts`, `gitResponse` / `context.kill` | Aborts send SIGINT, set `spawned.killed` and do not escalate or destroy output pipes. Its output listeners keep accumulating chunks if the child ignores SIGINT. |
| `src/lib/plugins/abort-plugin.ts`, `src/lib/plugins/timeout-plugin.ts` | Abort/timeout use that kill path. The timeout also stops on process exit even while inherited pipes can remain open. |
| `src/lib/plugins/completion-detection.plugin.ts` | Waiting for close retains complete pipes but cannot bound a SIGINT-resistant child or its continuing buffered output. |

The user chose `execFile` rather than adding a process wrapper, dependency patch or fork. It keeps the default 1048576-byte bounds independently per stream, SIGTERM behavior, rejection of silent failures/signals and the fixture environment/raw-argument contract. Fixture calls have no timeout and remain independent after failures. Test-kit process specs cover these bounds; skills specs cover the tree check's refusals, a failed fetch and an abort during the fetch.
