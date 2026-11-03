---
name: release-chamvi
description: Release chamvi end to end - align and merge the release-please PR, wait for npm, write the release notes, adopt the release in chamvi/helm and chamvi/agent-template, release the helm chart and write its notes. Use when asked to "release chamvi", "ship the release PR", "bump helm and the template", or "do the downstream adoption".
---

# release-chamvi

> One chamvi release, from the open release-please PR to a published `agent-app` chart, in phases. Stop for the owner's OK at every ⛔.

Uses the plugin skills `skills:release-please-version-bump` and `skills:write-release-notes`; follow them where named, this file only adds what is chamvi-specific. Work in worktrees under `/opt/projects/chamvi/worktrees/<repo>-chamvi-<minor>` (the main clones of helm and agent-template often have feature branches checked out). Every merge is a squash merge with the PR title; no em dashes and no AI attribution in commits, PRs or release bodies.

## Phase 1: align the release PR

1. Run `skills:release-please-version-bump`.
2. chamvi-specific: `linked-versions` never aligns anything here. With `include-component-in-tag: false`, release-please's `getComponent()` returns `''`, so the plugin finds no group members (the release run logs `Found 0 group components for main`) and each package gets the bump of its own commits. The only fix is a top-level `"release-as": "<version>"` in `release-please-config.json` (a `build:` commit), plus a no-op `fix:` touch for every package without a commit since the last tag (the `node-workspace` plugin patch-bumps those even under the pin). Do not turn on `include-component-in-tag`: it changes the single `v<version>` tag.
3. Re-check the PR until every `package.json` and the manifest show the group version.
4. ⛔ Ask before merging the release PR.

## Phase 2: publish and unpin

1. Watch the `release.yml` run of the merge commit (`gh run watch <id> --exit-status`); its `Publish` step logs `[success] Published @chamvi/<pkg>@<version>` per package.
2. Check npm through the full document: `curl -s https://registry.npmjs.org/@chamvi/<pkg>` and `versions["<version>"]`. `npm view` and `/<pkg>/latest` serve a CDN copy that lags several minutes and mixes old and new versions.
3. Remove the `release-as` pin in a `build:` commit (it would freeze the next release at this version).

## Phase 3: chamvi release notes

Run `skills:write-release-notes` on `v<version>`. chamvi-specific:

- The generated body is the root component's changelog and can miss commits that touch only `packages/*` (0.6.0 lost a `feat(core)!`): list `git log v<prev>..v<version>` and add what is missing.
- Samples come from `packages/docs/src/snippets/*.ts` and `packages/docs/src/guide/*.md` at the tag; the breaking-change table from `guide/upgrading.md` at the tag. Docs live at `https://chamvi.dev/`.
- Publish with `gh release edit v<version> --notes-file <file>` (release-please creates the release).

## Phase 4: chamvi/helm

Read `.agents/references/helm.md` and the PR descriptions of the release for downstream notes ("Downstream: ..."). Then, in a worktree off `origin/master`:

| File | Change |
|---|---|
| `ci/app/package.json` | `@chamvi/app`, `@chamvi/cli` to `^<version>` |
| `scripts/tests/test_ci.py` | `test_fixture_installs_the_published_packages` pins the minor line (`^0.<minor>.`): move it with the fixture |
| `.agents/references/chamvi.md` | the `Source:` line (tag, short sha, date) plus a row per new env variable or route the chart touches |
| `charts/agent-app/README.md.gotmpl` | "Upgrading chamvi with CronJobs": one paragraph per minor (store migration or not, downtime steps, links to `https://chamvi.dev/guide/upgrading#upgrading-to-0-<minor>`); new optional features under their own section |

Run `make generate` (docker; a first run can fail while images pull, run it again), `make test`, commit, then `make drift` (it needs a clean tree). Title `fix(agent-app): document the chamvi <minor> upgrade`: `fix` makes release-please cut a chart release, a `docs:`/`chore:` would not.

## Phase 5: chamvi/agent-template

In a worktree off `origin/main`: bump `@chamvi/app`, `@chamvi/cli`, `@chamvi/ui` to `^<version>`, `npm install` (check `npm ls --all | grep @chamvi` all resolve to the version), add a "For 0.<prev> to 0.<minor>" block under "Upgrading chamvi" in `README.md`, and mention new env variables in `.env.example` and `.agents/deployment.md`. Verify as CI does:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
ANTHROPIC_API_KEY=ci-placeholder-not-a-real-key CHAMVI_SCHEDULER=false \
CHAMVI_TOKENS='[{"value":"ci-placeholder-token-0001","id":"ci","permissions":[]}]' \
node node_modules/@chamvi/cli/dist/cli.mjs start --check
```

Title `chore: upgrade to chamvi <minor>`. The template has no release workflow and no releases: no release notes there.

## Phase 6: land and release helm

1. Open both PRs (evidence-based bodies: what changed, what was run), wait for `gh pr checks <n> --watch`, squash-merge both.
2. helm's `release` workflow (release-please) opens `chore: release master` with the root and `agent-app` at the next patch. ⛔ Ask before merging it.
3. The merge runs release-please plus `tada5hi/hevi`. A `failed to perform "Tag" on destination: sha256:...: not found` from the ghcr push is transient: `gh run rerun <id> --failed` (hevi is idempotent). Confirm with `helm show chart oci://ghcr.io/chamvi/helm/agent-app --version <chart>`.

## Phase 7: helm release notes

Run `skills:write-release-notes` on `agent-app-<chart>` (not `root-<chart>`, which keeps its generated body). Keep hevi's one-line chart description as the first line, then the notes: what the chamvi release means for a chart user (migration and downtime, new env or values), a heads-up table, `helm upgrade <release> oci://ghcr.io/chamvi/helm/agent-app --version <chart>`, the generated changelog. GitHub README anchors are `id="user-content-<slug>"`: check them against the heading in `charts/agent-app/README.md`.

## Finish

Remove the worktrees and their local branches, then report each published version and link (chamvi release, npm, chart release, OCI).
