# Vercel Skills SDK reference

Source baseline: the npm package [`skills`](https://github.com/vercel-labs/skills) 1.8.1 (`vercel-labs/skills`, API reference `docs/api.md`, public types `dist/index.d.mts`). `@chamvi/skills` depends on `skills@^1.8.1`; nothing else in chamvi does. Import from `skills` only (its single entry point), never the CLI.

| Upstream function | Chamvi owner and use |
|---|---|
| `resolveSource(source, { ref, includeInternal, signal })` | `packages/skills/src/prepare/module.ts`: clone the pinned commit once and list its skills (`handle.skills`, each with `name`, `path`, optional `duplicates`); `handle.dispose()` removes the temporary clone in `finally`. |
| `installSkills(handle, { cwd, skills: [name], ... })` | `prepare/module.ts`: copy one selected skill into sibling staging, then inspect `installed`, `failed` and `skipped`. |
| `isDiagnostic(error, ...codes)` | `prepare/helpers.ts` `toPreparationError()`: classify a thrown SDK diagnostic by its permanent `code`. |

## Options chamvi passes

- `ref: revision` and the check `handle.source.commit === revision`: a git source is cloned at the pin and the checked-out commit is verified without running git. An absent `commit` is refused. A HEAD that moved past the pin does not matter.
- No `fullDepth`: discovery reads upstream's standard locations (the repository root, `skills/` with `.curated`, `.experimental`, `.system`, the agent project skill folders and plugin paths) and the whole tree only when those hold nothing. A vendored copy or a submodule declaring a selected name in a deep folder is then no duplicate; a skill that exists only deep in a source with standard-location skills is not found. `installSkills` given a handle reuses the handle's discovery, so it takes no discovery option. `includeInternal: true`: the operator selects names explicitly, so `metadata.internal` skills are selectable.
- Submodules: upstream runs `git submodule update --init --recursive --depth 1` after every clone (pinned by the superproject's gitlinks; a failure only prints a `console.warn`). Their content is discovered only through the whole-tree fallback.
- Selection: each requested name must match exactly one `handle.skills` entry with no `duplicates`; otherwise `invalid()`.
- Install: `agents: ['universal']` and `mode: 'copy'` (a plain `<stage>/.agents/skills/<name>` copy, no agent links), `lockfile: false`, `telemetry: false`, `duplicates: 'error'`, `symlinks: 'reject'`, one name per call. Accepted only with `failed` and `skipped` empty and exactly one `installed` entry whose path is `join(stage, '.agents', 'skills', name)` and a real directory.
- No `onWarning`: upstream then drops its warning diagnostics, whose `data.path` can hold temp paths.
- YAML warnings: upstream parses frontmatter with `yaml`'s default log level, so an unresolved tag reaches `process.emitWarning` as a `YAMLWarning` quoting the source text, which `onWarning` does not cover. `withoutYamlWarnings()` (`prepare/helpers.ts`) drops only warnings named `YAMLWarning` while an SDK call runs; overlapping preparations share the filter and the last one restores `process.emitWarning`.
- `signal` goes to both calls.

## What chamvi adds

- **Local paths**: upstream refuses `ref` for a local path, so the adapter recognises a local path itself and passes `pathToFileURL(resolve(path)).href`, which upstream clones and pins like any git URL (working-tree edits excluded).
- **Pre-checks before any fetch** (non-local sources only): a `#` fragment and a `/tree/` path (GitHub `/tree/<ref>`, GitLab `/-/tree/<ref>`; upstream would let `ref` override them), the `owner/repo@skill` or `owner/repo@version` shorthand, also behind `github:`/`gitlab:` (an scp-style `git@host:owner/repo.git` stays valid), and every `<transport>::` remote helper (`ext::`, `fd::`) are refused. After resolve, `handle.source.type` must be `git`, `github` or `gitlab`.
- **Cancellation**: upstream checks `signal` between steps but does not interrupt a running clone. The adapter awaits the SDK call to settlement and disposes the handle before rejecting with `signal.reason`; stop can therefore wait for a clone.

## Symlinks

Upstream policy: a selected skill that contains a symlink is refused (`SKILLS_SKILL_CONTAINS_SYMLINKS`), a symlinked skill folder is not discovered (selecting it is a missing selection), and a tracked symlink in an unselected path does not fail preparation and is not copied. Chamvi inspects no git tree of its own.

## Error mapping

`toPreparationError()` never forwards an SDK or git message (they can hold credentials or private content):

- `InvalidAgentDefinitionError`: `SKILLS_GIT_AUTH_FAILED` (upstream also reports a missing repository this way), `SKILLS_GIT_SAML_SSO_BLOCKED`, `SKILLS_UNSUPPORTED_GIT_TRANSPORT`, `SKILLS_INVALID_OPTION_VALUE`, `SKILLS_LOCAL_PATH_NOT_FOUND`, `SKILLS_NO_VALID_SKILLS`, `SKILLS_NO_MATCHING_SKILLS`, `SKILLS_AMBIGUOUS_SKILL_SELECTOR`, `SKILLS_DUPLICATE_SKILL_NAME`, `SKILLS_SKILL_CONTAINS_SYMLINKS`.
- `InvalidAgentDefinitionError` too: `SKILLS_GIT_CLONE_FAILED` whose raw git answer (`error.cause.message`, never the message, which embeds the URL) says the repository is missing (`does not appear to be a git repository`, `fatal: repository '...' not found`, `returned error: 404`): a missing `file://` or ssh path and a plain https 404 arrive this way, GitHub's "Repository not found" arrives as `SKILLS_GIT_AUTH_FAILED`.
- Retryable `skill_preparation_failed`: `SKILLS_GIT_CLONE_TIMEOUT`, any other `SKILLS_GIT_CLONE_FAILED` (also a missing ref, whose cause stays ambiguous), `SKILLS_SOURCE_FETCH_FAILED`, every unknown code (upstream adds codes in minor releases) and every non-diagnostic.

Upstream's clone falls back to the host's `gh` login and SSH agent/keys after an HTTPS GitHub authentication failure, and honours `SKILLS_CLONE_TIMEOUT_MS`; the public skills reference documents both for operators.

## Ownership

The optional package owns the dependency and the adapter. Its public options/results are chamvi-owned shapes, with no upstream SDK type aliases or re-exports. Application consumers configure sources, independent reviewed pins and role selection through chamvi; they do not import the SDK. No SDK dependency belongs in `@chamvi/app` or core. Preparation preserves the reviewed selected bytes, verifies independent bundle pins before replacing assets and cleans staging on failure. Never approve a newly computed digest during application startup. Importing or loading skills must not invoke the CLI, change process cwd, prompt or execute skill scripts.

Filesystem ownership is `packages/skills/src/bundle/`: `bundle.ts` (`hashSkillBundle`, `readSkillBundle`) verifies complete local inventories and exact framed byte hashes; `helpers.ts` validates strict root metadata; `module.ts` (`loadSkillBundles`) creates immutable catalogs; `packages/skills/src/catalog/` owns domain types, catalog rendering and the ordinary load tool; `runtime/` owns validation, custom adapters and per-engine caches/fingerprints. Core owns only the generic preparation/contribution protocol and lifecycle coordination. Supporting `.yaml`/`.yml` files are opaque UTF-8 references, including `agents/openai.yaml`. Only surrounding description whitespace is trimmed before nonblank/length/control checks. Body/reference bytes and hash framing are unchanged.

The selected `tada5hi/skills` profile at `233532ce04af00916c026f97a3f6097ee7f189df` is the compatibility profile: common `ponytail`, `codebase-design`; maintainer `generate-commit-message`, `investigate-pr-comments`, `create-pull-request`, `release-please-version-bump`. It does not establish compatibility for unselected scripts, SVG/CSS, hidden templates or binary assets.
