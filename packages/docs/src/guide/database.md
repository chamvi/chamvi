# Database

An app keeps tables of its own (tickets, bookmarks, anything its controllers and tools serve) in a database module: `databaseModule()` of `@chamvi/app` gives it a TypeORM data source on the same `DATABASE_URL` as chamvi's store, with its own tables, its own migrations table and its own migration lock. chamvi's store never takes an app's entities, and the app never touches chamvi's tables.

The layers are the ones chamvi's store is built from: an entity per table, a repository that implements a port of `@chamvi/store` and only stores and reads, and a service that holds every rule and takes the port, never a driver. The same service then runs on PostgreSQL in production, on SQLite in development and in memory in a spec.

```bash
npm install @chamvi/app @chamvi/store-db @ebec/http @rapiq/core typeorm pg
npm install --save-dev better-sqlite3   # SQLite without DATABASE_URL: development and tests
```

`@chamvi/app` re-exports the port and the storage errors of `@chamvi/store`; `@chamvi/store-db` (a dependency of `@chamvi/app`, listed for its imports) holds the adapter base and the column transformer, `@ebec/http` the HTTP errors a service throws. Entities use decorators: set `"experimentalDecorators": true` in the app's `tsconfig.json`. An entity that leaves a column's type to TypeScript (a property typed `Date` with no `type`) also needs `"emitDecoratorMetadata": true` and `import 'reflect-metadata';` as the first import of the entry (install `reflect-metadata`); the entities below give every type and need neither.

## Declare a database

<<< @/snippets/database/app.ts#app

| Option | Does |
|---|---|
| `entities` | The entity classes (or `EntitySchema`s) of the app's tables |
| `migrations` | The migration classes, run on PostgreSQL only. Classes, not a folder: a built entry cannot load `.ts` files |
| `migrationsDirectory` | Where [`chamvi migration generate`](#migrations) writes; nothing else reads it |
| `migrationsTableName` | The table the migrations are recorded in: a plain lower-case identifier, never `migrations` (chamvi's store's), nor one starting with `chamvi_` or `typeorm_metadata` |
| `schemas` | The [list schemas](#a-list-endpoint) over these entities, checked against them at start |
| `name` | Default `default`. The module is `chamvi:db:<name>`, its data source `dataSourceToken(name)` (`DatabaseToken.DATA_SOURCE` for `default`), its migration lock `chamvi:db:<name>`. `store` is reserved |
| `env` | Where `DATABASE_URL` and `NODE_ENV` are read; default the app's env |
| `waitTimeoutMs` | SQLite only: how long work waits behind one holder of the connection, default 30 s |
| `postgres` | `true` requires PostgreSQL: without `DATABASE_URL` the start fails with `InvalidAgentDefinitionError` instead of running on SQLite in memory. Default `false` |
| `installExtensions` | PostgreSQL only: whether TypeORM creates the extensions the entities' column types need when it connects (`CREATE EXTENSION`). Default TypeORM's (it does); `false` for a database whose migration or operator installs them, so the app needs no right to create extensions |

What the module does depends on `DATABASE_URL` and on what the app is doing:

| | With `DATABASE_URL` (PostgreSQL) | Without it (SQLite in memory) |
|---|---|---|
| `start`, `runJob` | Connects, runs the pending migrations under the lock `chamvi:db:<name>` (with `MIGRATE=false` a pending migration fails the start) | Creates the tables from the entities; the rows live as long as the process. Refused when `NODE_ENV` is `production` |
| `migrate` (`chamvi migrate`) | Migrates after chamvi's store | Refused: `DATABASE_URL` is required |
| `check` (`chamvi start --check`) | Connects and writes nothing; pending migrations fail only with `MIGRATE=false`, as the store's do | As at start |

The data source closes after the engine drained, so a module may still use it in its own `drained` hook (register that hook in `setup`). A database failure is a `DatabaseUnavailableError` naming the operation and the driver's code, never the URL, a statement's parameters or a row; a configuration mistake (a refused option, SQLite in production, an entity TypeORM refuses, a date column whose type could not be derived) is an `InvalidAgentDefinitionError` and makes `chamvi start` and `chamvi start --check` exit 2.

The base image sets `NODE_ENV=production`: a container of an app with a database module needs `DATABASE_URL`, also for a `chamvi start --check` smoke test.

## Entities

One set of entities runs on PostgreSQL and SQLite:

<<< @/snippets/database/entity.ts#entity

- Give every scalar column a `type` valid on both: `varchar` with a length, `text`, `boolean`, `integer`, `uuid`. A vocabulary is a `varchar`, never an `enum` type. JSON values are `json`.
- A date column takes `type: Date` (each driver's own date type) or `@CreateDateColumn()`/`@UpdateDateColumn()`. `dateToISOStringTransformer` of `@chamvi/store-db` makes it read and write an ISO 8601 UTC string, the same on both drivers (the PostgreSQL connection is pinned to UTC). A column typed `Date | null`, `any` or an interface without a `type` would get a wrong type silently: the start refuses it, naming the entity and the property.
- chamvi's store tables are `chamvi_*`: keep your table names apart.

## A repository

The service takes a port: the generic entity port `IEntityRepository<T>` of `@chamvi/store`, plus any finder the app adds:

<<< @/snippets/database/types.ts#types

On the database, extend `EntityRepositoryAdapter` of `@chamvi/store-db`: it implements the whole port (reads and writes, `transaction(fn)` with row locks, rapiq queries, batches, the storage errors), so the subclass only names its entity:

<<< @/snippets/database/repository.ts#repository

A repository decides nothing: no status compare, no default, no time stamp, no choice of error. It reports a missing row as `EntityNotFoundError`, a taken unique value as `EntityConflictError`, a missing referenced row as `EntityRelationError`, a deadlock as `EntityDeadlockError`, a refused query as `EntityQueryError` and a value the table refuses (a missing required column, a failed check, a value too long) as `EntityInvalidError`, naming the column or constraint, each with the entity's label and a fixed message. A storage error that reaches a route answers with its code: `404 entity_not_found`, `409 entity_conflict`, `400 entity_relation_invalid`, `400 entity_query_invalid`, `400 entity_invalid`, `409 entity_deadlock`, `503 database_unavailable`. `toEntity`/`fromEntity` map a stored row that differs from the public value, `fields` renames public field paths of a filter or sort, `related` labels the entities a foreign key names, `upsertKey` lets `upsert` replace by a unique field group.

## A service

Every rule lives in the service:

<<< @/snippets/database/service.ts#service

- A method that changes a row runs in `repository.transaction(fn)` and uses only the repository `fn` is handed. A single-row read there (`findOneById`, `findOneBy`) locks the row until the transaction ends; a list read (`findMany`, `findManyBy`) locks nothing.
- Read the clock after the locked read, so a caller that waited compares a fresh time.
- `save` inserts an object `create()` returned and updates one a read returned (its changed properties only); it resolves the stored row. Return that, not a second read.
- Check the caller's right to the row after the locked read, as `close` checks the reporter: another reporter's ticket answers 404 like a missing one, so its existence does not leak. `list` is scoped the same way through `scopeQuery`.
- Call other services outside the transaction; react to an `EntityConflictError` in a new one.

## A list endpoint

A list schema says what a client may ask of a list: filters, operators, sorts, relations, fields and the page size. Nothing is allowed by default. `fields` limits what a request may select with `fields=`; it hides nothing: a list without `fields=` answers every column, and `include=` returns whole related rows, so a column that must never leave is removed in the controller or kept off the entity.

<<< @/snippets/database/schema.ts#schema

`decodeQuery(searchParams, schema)` turns the request's query (`filter[status]=open`, `sort=-openedAt`, `page[limit]=20`, `include=...`, `fields=...`) into the query `findMany` takes; anything the schema does not allow, a malformed page value or a limit above `maxLimit` (default 100) is a `400 bad_request` naming the key, never the value. Every page is ordered and ends with the schema's `key` (default `id`), so page boundaries are stable. A service that restricts a list ands its condition onto the decoded query with `scopeQuery(query, ...conditions)`, as `TicketService.list` does above, never by pushing it into `query.filters`.

<<< @/snippets/database/controller.ts#controller

A module builds the service on the database module's data source and contributes the controller ([Controllers](/guide/controllers)):

<<< @/snippets/database/module.ts#module

- `databaseModule({ schemas })` checks each schema against its entity after connecting and before migrating or serving, also in a check: a field, filter, sort or relation the entity lacks fails the start with `InvalidAgentDefinitionError` naming the database, the schema and the name.
- Matching is case-sensitive on every driver. A filter value that is no uuid on a uuid column matches nothing. A filter value on a date column (an ISO string in any offset, or a `Date`) is compared as the instant it names; one that names no instant is refused with `EntityQueryError` (`400 entity_query_invalid` on a route).
- String sorts follow the driver: memory and SQLite order by code point, PostgreSQL by the database's collation, so a database created with `en_US.UTF-8` orders `b` before `C`, where SQLite orders `C` first.
- A field, filter or sort of a related entity (`author.name`) is not supported, and `fields=` cannot be combined with `include=`.

## Migrations

PostgreSQL takes its schema from the migrations only; generate each one from the entities with the CLI ([`chamvi migration`](/reference/cli#migrations)):

```bash
# development only: a PostgreSQL database the command creates, migrates, compares and drops
export MIGRATION_DATABASE_URL=postgres://dev:dev@localhost:5432/ticket_scratch
npx chamvi migration generate --name TicketInit
```

`generate` reads the TypeScript source entry (default `src/index.ts`), writes `<timestamp>-ticket-init.ts` with the class `TicketInit<timestamp>` into `migrationsDirectory`, or prints `no changes`. Add the class to `migrations`. It refuses a scratch URL that names the database of `DATABASE_URL`, and it is refused when `NODE_ENV` is `production`: `MIGRATION_DATABASE_URL` is never a deployment variable.

A start migrates under the lock `chamvi:db:<name>` (replicas starting at once wait for each other; each migration runs once), and so does `chamvi migrate`. In CI, against a service PostgreSQL:

```bash
npx chamvi migration run --entry src/index.ts     # or the built dist/index.mjs, the default
npx chamvi migration drift --entry src/index.ts   # exit 1 when the entities and the migrated schema differ
```

`run`, `revert`, `status` and `drift` load the built entry `dist/index.mjs` unless `--entry` names another; a TypeScript entry needs tsdown installed. With several database modules, `--database <name>` picks one.

## SQLite in development

Without `DATABASE_URL` the database is SQLite in memory through `better-sqlite3`, its tables created from the entities: nothing to set up, everything gone on a restart, as chamvi's memory store. Its one connection takes one statement, transaction or operation at a time; work inside a transaction joins it. Work that waits `waitTimeoutMs` (30 s) behind one holder, such as a transaction opened by hand on a query runner and never ended, is refused with `DatabaseBusyError`. Go through the repositories, or end what you open.

## Testing

Run the service spec on memory and on the database repository with one body, a race and the reporter check included; see [Testing](/guide/testing#an-app-s-database).

## Read next

- [Controllers](/guide/controllers): contributing the controller, authentication per method, the OpenAPI document
- [`@chamvi/cli` reference](/reference/cli#migrations): every migration operation and its guards
- [Writing a Repository](/repositories/writing-a-repository): the port contract in detail
