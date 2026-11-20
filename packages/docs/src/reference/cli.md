# @chamvi/cli

The `chamvi` bin: argv, entry loading, signals and exit codes for an app built with [`@chamvi/app`](/reference/app). Each command only calls the app's lifecycle methods; see [Apps & Modules](/guide/app).

```bash
npm install @chamvi/app @chamvi/cli ai
npm install --save-dev tsdown   # for chamvi build and a TypeScript entry
```

Node.js `>=26.0.0`. `@chamvi/app` is a required peer dependency (one copy), `tsdown` an optional one, imported by `build` and by every command loading a [TypeScript entry](#typescript-entries). `@chamvi/store-db` is a dependency, imported by `migration` only.

`package.json` scripts of an agent repository:

```json
{
    "type": "module",
    "scripts": {
        "dev": "chamvi dev",
        "build": "chamvi build",
        "start": "chamvi start"
    }
}
```

## Commands

`chamvi <command> [args] [flags]`, plus `--help` and `--version`. Every command takes `--entry <path>`.

| Command | Arguments and flags | Does | Exit |
|---|---|---|---|
| `dev` | `--entry` | Spawns `node --watch [--env-file-if-exists=.env] <cli.mjs> start --dev --entry <source entry>` (the env flag only when `.env` exists at start: on Linux `node --watch` fails on a missing env file), forwards SIGINT and SIGTERM | the child's code |
| `build` | `--entry`, `--out-dir <dir>` (default `dist`) | Bundles the entry with tsdown (missing: exit 2, "install tsdown as a devDependency"); the out dir is emptied first, so one that is the project folder or above it, holds the entry, or holds anything but `.mjs` and `.mjs.map` files exits 2 | 0, 1 build error, 2 usage |
| `start` | `--entry`, `--check`, `--dev` (hidden) | `app.start()`, then waits for a signal. `--check`: `app.check()` instead, the start path up to the start, writing nothing to the store and serving nothing; prints `chamvi: start check passed`, or each agent folder issue on its own stderr line ([Check before you deploy](/guide/models#check-before-you-deploy)) | 0 clean stop (or a clean check), 1 start failure, forced exit or a check's store failure (unreachable, pending migrations), 2 usage, configuration or (check) an agent folder issue |
| `run-job` | `<agent>`, `[subscriptionId]`, `--entry` | `app.runJob({ agent, subscription })`, prints `<agent>: <status> (run <id>)` (also after a signal); `subscriptionId` defaults to the agent's only cron subscription | 0 completed, waiting, skipped, queued behind an approval or interrupted by a signal; 1 failed or cancelled (also when a signal came meanwhile), an error or a failed stop; 2 usage |
| `migrate` | `--entry` | `app.migrate()` | 0, 1, 2 (`DATABASE_URL` unset is 2) |
| `migration` | `<generate\|run\|revert\|status\|drift>`, `--database <name>`, `--name <Name>` (generate), `--entry` | The migrations of an app's [database module](#migrations) or of chamvi's own store (`--database store`); loads the entry, never starts the app | 0 done; 1 drift found, migrations pending (`status`) or a database failure; 2 usage |

**Entry:** `--entry <path>` (a bare `--entry` or `--no-entry` exits 2), else the command's default. The source commands (`dev`, `build`, `start --dev`) read `package.json` `"chamvi": { "entry": "<path>" }`, then fall back to `src/index.ts`. The built commands (`start`, `run-job`, `migrate`, `migration` except `generate`) never read that field and default to `dist/index.mjs`, so an image built from a repository that sets it still starts; a missing one beside a `src/index.ts` exits 2 with "run `chamvi build` or pass `--entry src/index.ts`". With none of them (no `--entry`, no `chamvi.entry`, no default file), `dev`, `start`, `run-job` and `migrate` run the default app, `createApp({})` configured by env alone, with its agents from `./agents` (or `CHAMVI_AGENTS_DIR`) and the packages of `CHAMVI_AGENTS` or `chamvi.json`, and say so on stderr; `build` exits 2 (nothing to build). The entry is loaded with `import()` (a TypeScript one through the [hooks below](#typescript-entries)); a default export that is not an app exits 2 with `<entry> must export default createApp({...})`.

**`start --dev`** (what `dev` runs): the source entry, `<cwd>/.env` (only the keys the env lacks, through `node:util` `parseEnv`; loaded before the entry is imported, so the optional module factories see them), memory repositories unless `DATABASE_URL` is set and, without any authenticator, one random `*` token with id `dev`, logged once with a warning; `CHAMVI_DRAIN_TIMEOUT_MS` defaults to 5000 and `CHAMVI_FORCE_EXIT_MS` to 15000.

## Migrations

`chamvi migration <operation> [--database <name>] [--name <Name>] [--entry <path>]` works on one database: an app's `databaseModule()` (by its `name`; with one database module the flag may be left out, with several it is required and a missing or unknown name exits 2 listing them, an app without one exits 2), or `--database store`, chamvi's own store (its entities, migrations, `migrations` table and lock `chamvi:migrations`, as `chamvi migrate` uses them; no entry is loaded, and `--entry` with it exits 2). The command loads the entry to read the database modules' declarations and never starts the app, so nothing else connects. The workflow from an app's side: [Database](/guide/database#migrations).

| Operation | Works on | Does | Exit |
|---|---|---|---|
| `generate --name <Name>` | `CHAMVI_MIGRATION_DATABASE_URL` | Creates that throwaway database (it must not exist, or be a leftover `generate` marked), marks it, runs the existing migrations, compares the schema with the entities and drops it again, also after a failure; writes `<timestamp>-<kebab-name>.ts` (class `<Name><timestamp>`) into the module's `migrationsDirectory` and prints its path and the class to add to `migrations`, or `no changes`. Needs the TypeScript source entry (default `src/index.ts`; a built entry exits 2); refused when `NODE_ENV` is `production`. Never connects to `DATABASE_URL` | 0, 1 a database failure, 2 |
| `run` | `DATABASE_URL` | Runs the pending migrations under the module's lock, each in its own transaction, and prints each one applied | 0, 1 |
| `revert` | `DATABASE_URL` | Undoes the last migration run, under the lock | 0, 1 |
| `status` | `DATABASE_URL` | Lists every migration as `[x]` (run) or `[ ]` (pending), read-only; it reads under the lock, so it waits while another process migrates | 0 up to date, 1 pending |
| `drift` | `DATABASE_URL` | Compares the schema with the entities, read-only, and prints the statements that would reconcile them: a CI step after `run` | 0 none, 1 drift |

`run`, `revert`, `status` and `drift` need `DATABASE_URL` (exit 2 without it); `status` and `drift` send no DDL, not even the `CREATE EXTENSION` TypeORM issues for an extension-backed column type. `generate` needs `CHAMVI_MIGRATION_DATABASE_URL`, a development-only variable naming a PostgreSQL database the command creates and drops; only `generate` reads it. `generate --database store` writes only in the chamvi repository (`packages/store-db/src/migrations`, found beside the running `@chamvi/store-db`'s `package.json`); from an app it exits 2, since the store's migrations ship with the package.

`generate` parses `CHAMVI_MIGRATION_DATABASE_URL` once and connects every step (the check, the drop, the create, the marker, the migrations, the last drop) with the host, port, user, password, database and `sslmode` of that one parse, never with the URL. Before anything is dropped it refuses (exit 2):

- a URL naming the database `DATABASE_URL` names in any spelling: `postgres:` or `postgresql:`, the host's case, `localhost`, `127.0.0.1`, `::1` or this machine's name and addresses, the default port given or left out, a trailing slash, percent-encoding, a query string, another user;
- a URL with a fragment (`#...`), a host that is no plain name or IPv4 address (percent-encoding, an IPv6 literal), a database that is no plain name, or a query parameter other than `sslmode` (`disable`, `require`, `verify-ca`, `verify-full`) and `application_name`;
- an existing database without the comment `generate` writes right after creating its scratch database, empty or not: name a database that does not exist, or drop the stale one by hand. A marked leftover of a crashed run is dropped and created again: the drop runs on one connection to the `postgres` database, which reads the comment again right before it and keeps a database that lost it;
- a connection the server reports as reaching another database than the URL names (a pooler routing the name elsewhere); after connecting for the migrations it checks again that the database is the marked scratch one before writing anything.

What the guards cannot catch: a real database someone marked by hand with the comment `chamvi:migration-scratch`; a scratch URL whose host is another name of the production server, where the scratch name does not exist: `generate` then creates, migrates and drops its own database there, touching no other one; and a leftover whose comment is removed in the moment between that last read and its drop. A database created under the scratch name between the check and the create makes the create fail. A failure after the create and before the comment is written (the server reports another database, the comment fails) drops the database that run created, so no unmarked database refuses the next run.

In the URL the user and the password may be percent-encoded, and must be where they hold a reserved character (`@`, `:`, `/`, `?`, `#`, `%`); the host and the database name may not (a host is a plain name or IPv4 address, a database a plain name).

No output line or error carries a URL, a password, a statement's parameters or a row; `drift` prints schema statements only.

## TypeScript entries

`dev` (through `start --dev`), `start` (also with `--check`), `run-job`, `migrate` and `migration` load a TypeScript entry (`.ts`, `.mts`, `.cts`) through a `module.registerHooks()` pair the CLI registers once per process before the import: every TypeScript file outside `node_modules` the entry loads is transformed with rolldown's `transformSync`, taken from the tsdown `chamvi build` uses, with an inline source map, so a stack trace names the TypeScript line. Node still resolves every import (relative imports carry `.ts`), and `node --watch` restarts on a change to any of them. A JavaScript entry, such as the built `dist/index.mjs` an image runs, registers nothing and needs no tsdown.

- The transform reads the nearest `tsconfig.json` at or above the working directory (its `extends` followed), the file `chamvi build` (tsdown) finds, so `dev`, `start --check` and `build` compile the same code alike. Without one, rolldown's defaults apply (no decorators), as in the build. `node --watch` does not follow the tsconfig: restart `chamvi dev` after changing it.
- The app's `package.json` needs `"type": "module"` (or the file the extension `.mts`) for syntax Node cannot strip, such as an `enum` or a decorator: otherwise Node strips the file itself before the transform sees it and fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` (`TypeScript enum is not supported in strip-only mode`), while the build accepts it. The template's `erasableSyntaxOnly` makes the typecheck reject an `enum`: remove that setting to use one.
- Since Node resolves every import, tsconfig `paths` are not applied: an alias import fails with `ERR_MODULE_NOT_FOUND`, although the build resolves it. Use relative imports or `package.json` `imports`.
- Decorators (a `@routup/decorators` controller, a TypeORM entity) need `"experimentalDecorators": true`. Without it the import fails with `SyntaxError: Unexpected token 'export'` and no file name; `chamvi build` succeeds, and the built `dist/index.mjs` then fails the same way at start. `"emitDecoratorMetadata": true` together with `import 'reflect-metadata'` as the entry's first import is the app's choice: TypeORM entities that omit their column types need it.
- tsdown must be installed to load a TypeScript entry; without it the command exits 2 with `The entry is TypeScript: install tsdown ^0.23.4 to load it.` A built entry needs nothing.
- Files of an [agents folder](/guide/agent-folders) (`CHAMVI_AGENTS_DIR`) are loaded by locter's transpiling module reader, not by these hooks, and cannot use decorators.
- `@oxc-project/runtime`, the helpers the transformed code imports, is a dependency of `@chamvi/cli`.

```json
{
    "compilerOptions": {
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    }
}
```

## Exit codes

```ts
const EXIT_CODE: { OK: 0; FAILURE: 1; USAGE: 2 };
const CLI_USAGE_ERROR_CODE: 'cli_usage';
```

| Code | When |
|---|---|
| `0` | Success: a clean stop, a built bundle, a migrated store, a job as listed above, a `start --check` without issues, a `migration` operation done |
| `1` | Runtime failure: a start, check, build or migrate error (a check's store unreachable or not migrated), a failed or cancelled job, a forced exit after `CHAMVI_FORCE_EXIT_MS` or a second signal; `migration drift` that found drift, `migration status` with pending migrations, a database failure of `migration` |
| `2` | Usage or configuration: an unknown command or flag, an entry that is missing or no chamvi app, missing or invalid env (named, its value never echoed), model settings with an issue, an agent with no model and no default or a model string whose provider is not configured or whose package is missing, a `start --check` that found an agent folder issue, a module graph error (a dependency the app does not register, a cycle), any `InvalidAgentDefinitionError` before anything started (the engine starts only once every module checked its configuration), a `migration` refusal (no database module, an unknown `--database`, a refused `CHAMVI_MIGRATION_DATABASE_URL`) |

The CLI sets `process.exitCode` and lets Node exit; `process.exit()` only ends a forced exit. An unknown command or a missing argument prints the usage, every other exit-2 error its message, an exit-1 error its stack.

## Signals

`start` and `run-job`:

- The first SIGTERM or SIGINT calls `app.stop()` (for `run-job`: aborts the job's wait through `runJob({ signal })`, which then drains), then exits 0, or 1 when the stop reported an error.
- A second signal exits 1 at once. A signal within 1 s of the first counts as the same one, since `npm run dev` and `npm start` deliver one Ctrl-C twice (npm forwards SIGINT to the script while the terminal signals the whole group).
- `CHAMVI_FORCE_EXIT_MS` (90 s) after the first signal, a stop still running exits 1.

`migrate` and `migration` install no handlers: Node's default ends them.

On Kubernetes keep `preStop + CHAMVI_FORCE_EXIT_MS < terminationGracePeriodSeconds`. With a 5 s `preStop` sleep and a grace period of 120 s, the worst case is 5 + 0 (readiness delay) + 30 (the background components' stop and the drain, which share one `CHAMVI_DRAIN_TIMEOUT_MS`: the drain gets what the stop left) + 5 (close) + 30 (workspaces) = 70 s, the forced exit comes at 5 + 90 = 95 s and SIGKILL at 120 s.

## dev and process groups

A terminal's Ctrl-C sends SIGINT to the whole foreground process group, and the `node --watch` supervisor forwards the signal it receives to its child. Without care the app would get two signals and the second-signal rule would exit 1 without draining. So `dev` spawns the supervisor `detached`, in a process group of its own: the terminal's SIGINT reaches only the CLI, which forwards that one signal. SIGHUP (the terminal closed) and the CLI's own exit stop the child with SIGTERM, and the child's stdin is a pipe only the CLI writes: when the CLI dies without its exit hook (SIGKILL, the OOM killer), the pipe closes and the app ends the whole group, so it never outlives the CLI. The exit code is the child's, 0 when it ended by a forwarded signal.

`node --watch` restarts on a change of the entry, anything it imports, and `.env` (Node watches the env file it loaded), so `dev` passes no `--watch-path`.

## build output

`chamvi build` calls tsdown with:

```ts
{
    config: false,
    entry: { index: '<entry>' },
    format: 'esm',
    platform: 'node',
    target: 'node26',
    outDir: '<out-dir>',
    fixedExtension: true,
    sourcemap: true,
    dts: false,
    clean: true,
}
```

The result is `<out-dir>/index.mjs` plus its source map. Every `dependencies` and `peerDependencies` package stays external and the app's own modules are inlined; `@chamvi/*`, `typeorm`, `pg`, `dockerode` and `@kubernetes/client-node` are never bundled (`@chamvi/ui` finds its `dist/app` through `import.meta.url`). An image runs `dist/index.mjs` with the production `node_modules`: `CMD ["node", "node_modules/@chamvi/cli/dist/cli.mjs", "start"]`.

## Programmatic use

```ts
function runCli(argv: string[], context?: Partial<CliContext>): Promise<void>;
```

The bin is `await runCli(process.argv.slice(2), processContext(...))`. Every process touch point is injectable, which is how the CLI's own tests run commands in-process:

<<< ../../../cli/src/run/types.ts{ts}

```ts
type ProcessEvent = 'SIGTERM' | 'SIGINT' | 'SIGHUP' | 'exit';

/** Where signals arrive: `process`, or a fake in tests. */
interface ISignalTarget {
    on(event: ProcessEvent, fn: () => void): void;
    off(event: ProcessEvent, fn: () => void): void;
}
```
