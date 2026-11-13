# Testing

## Setup

- **Runner**: Vitest (`vitest --config test/vitest.config.ts --run`), per package.
- **Location**: `packages/<name>/test/unit/<module>/*.spec.ts`, mirroring `src/` (e.g. `engine/lifecycle.spec.ts`); shared helpers in `packages/<name>/test/utils/`.
- **Coverage**: `npm run test:coverage` (v8, thresholds 80% for branches, functions, lines, statements).

```bash
npm run test                                       # all packages via nx
npx nx run @chamvi/core:test                     # one package (or @chamvi/test-kit)
cd packages/core && npx vitest --config test/vitest.config.ts --run test/unit/engine/dispatch.spec.ts   # one file
cd packages/core && npx vitest --config test/vitest.config.ts   # watch mode
```

Only `test/unit/**/*.{test,spec}.{js,ts}` is picked up; a new test directory needs the `include` glob widened. CI runs `npm run test`, not `test:coverage`, so the coverage thresholds do not gate merges.

## Conventions

- Regressions should exercise distinct transport payloads and accepted domain input, real relation navigation plus foreign-key rejection, and configured query/retention bounds. Keep shared store contracts across adapters; do not infer these guarantees from test totals or schema equality alone.
- Trust regressions belong at the execution boundary: drive `Engine` through untrusted ingress/results, final-input hook rewrites, approve/deny and replay, rather than testing classifications alone. Assert no outbound effect before approval, no argument leakage in source notifications, and no exposed result/checkpoint after taint persistence fails. Include recorded/streaming results, inherited dispatch taint, conservative conversation recall and resolved source/default destination exemptions. Shell/provider execution are exclusions, not gated-tool test expectations.
- Test `extract()` from an executing tool frame with a fake model: schema validation/allowlist, raw-JSON effect replay without double transforms, independent structural output checks and prior taint preservation, generic errors without raw content, and only structured output returned to the parent. Repository contracts must round-trip optional `Run.taint`, revive `taint.at` as `Date`, and preserve it across updates; database tests cover the nullable column and untainted terminal runs.

- Tests import the public API by package name (`@chamvi/core`, `@chamvi/test-kit`); each `vitest.config.ts` aliases them to the packages' `src/index.ts`, so tests run against sources, not `dist`. Internals (e.g. `src/effect/helpers.ts`, `src/repository/index.ts`) are imported by relative path.
- Assert the expected behaviour from the module contract, not what the implementation happens to do; a failing test may be a real bug.
- Use `createMemoryStore()` and `mockModel(responses)` (`test/utils/mock-model.ts`, scripted `MockResponse`s per model call) instead of mocking internals. Prefer fakes over `vi.mock()`.
- App and skills model fixtures use `mockModel`, `textModel`, `approvalModel`, `failingModel` and `MockResponse` from `@chamvi/test-kit` (`src/model/`), keeping one AI SDK response/stream implementation.
- Time goes through the injectable `IClock`: pass a `ControllableClock` to the engine and store and advance it, never real timers. Core's tests take it from `test/utils/clock.ts`; every other package takes it from `@chamvi/test-kit`.
- `@chamvi/store-db` tests need Docker: `test/global-setup.ts` starts `postgres:18-alpine` with testcontainers once per run, and each spec file creates its own database (`createTestDataSource()` in `test/utils/database.ts`, sessions in `TimeZone=America/New_York`). Without Docker the Postgres suites skip with a warning locally and fail when `CI` is set.
- Every store implementation runs `describeRepositoryContract()` from `@chamvi/test-kit` (the `createMemoryStore()` run lives in `packages/test-kit/test/unit/memory-repository.spec.ts`).
- `test/unit/smoke.spec.ts` checks that the package entry resolves.
- `test/unit/exports.spec.ts` pins the public exports; `test/unit/readme.spec.ts` runs `test/fixtures/readme-example.ts` and checks that the package's `README.md` contains that file verbatim. Change the example in the fixture, then copy it into the README.
- Tests that need a build first (`nx` `dependsOn: ["build"]`; by hand run `npm run build` first): `@chamvi/app` (`test/unit/loader/identity.spec.ts`, `test/unit/loader/package-identity.spec.ts`), `@chamvi/cli` (`test/unit/bin/`), `@chamvi/http` (`openapi/document.spec.ts`, reads `dist/swagger.json`) and `@chamvi/ui` (`readme.spec.ts`).
- Package-specific fakes and suites (GitHub, OpenClaw, chat, WhatsApp, web, knowledge, sandbox providers, app harness, CLI, UI e2e, skills, structured instructions) are in the `## Testing` section of the matching [topic file](architecture.md#topic-files).
