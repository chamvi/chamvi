<p align="center">
    <img src="https://raw.githubusercontent.com/chamvi/chamvi/master/.github/assets/logo.svg" alt="@chamvi/store-db-vector" width="128" height="128" />
</p>

<h1 align="center">@chamvi/store-db-vector</h1>

<p align="center">
    <b>pgvector store for chamvi knowledge collections.</b><br>
    Collections, documents and their embedded chunks in PostgreSQL,<br>
    so indexed knowledge survives restarts and is shared by every replica.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamvi/store-db-vector"><img src="https://img.shields.io/npm/v/@chamvi/store-db-vector" alt="npm version" /></a>
    <a href="https://github.com/chamvi/chamvi/actions/workflows/ci.yml"><img src="https://github.com/chamvi/chamvi/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamvi/chamvi/blob/master/packages/store-db-vector/LICENSE"><img src="https://img.shields.io/npm/l/@chamvi/store-db-vector" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [The database](#the-database)
- [Migrations](#migrations)
- [Search and replicas](#search-and-replicas)
- [Schema](#schema)
- [License](#license)

## Installation

```bash
npm install @chamvi/store-db-vector
```

ESM only, Node.js `>=26.0.0`. `@chamvi/app`, `@chamvi/core`, `@chamvi/knowledge`, `@chamvi/store`, `@chamvi/store-db`, `typeorm` and `pg` are peer dependencies: the package is an app module and needs the app.

## Usage

`vectorStoreModule()` registers the knowledge repository of the app: `knowledgeModule()` of `@chamvi/knowledge/module` then indexes into PostgreSQL instead of memory, so collections, documents and vectors survive restarts and every replica shares them:

```typescript
import type { EmbeddingModel } from 'ai';
import { createApp } from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import { folder, knowledgeCollection } from '@chamvi/knowledge';
import { knowledgeModule } from '@chamvi/knowledge/module';
import { vectorStoreModule } from '@chamvi/store-db-vector';

export function createSupportApp(input: { handbook: string; embedding: EmbeddingModel }): IApp {
    return createApp({
        agents: [],
        modules: [
            // the knowledge tables in the database of DATABASE_URL, beside chamvi's store
            vectorStoreModule(),
            knowledgeModule({
                collections: [
                    knowledgeCollection('handbook', { model: input.embedding, sources: [folder(input.handbook)] }),
                ],
            }),
        ],
    });
}
```

A `repository` passed to `knowledgeModule()` wins over the module's; without either, the knowledge lives in memory and the module warns outside dev. A second repository module in one app fails as a duplicate module.

## The database

- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) 0.8 or later, for example the `pgvector/pgvector:pg18` image.
- The database of `DATABASE_URL`, the one chamvi's store uses, or `vectorStoreModule({ url })` (a `postgres:` or `postgresql:` URL; it wins over `DATABASE_URL`). Without either the start fails with `InvalidAgentDefinitionError`; there is no SQLite fallback. Connection and migration errors never carry the password.
- The first migration runs `CREATE EXTENSION IF NOT EXISTS vector`, which needs a role allowed to create it. Where the app's role is not, install `vector` beforehand and the migration leaves it alone. Nothing installs it on connect, and no rollback drops it.

## Migrations

The tables have their own migration chain, recorded in `chamvi_vector_migrations` under the lock `chamvi:db:vector`, apart from chamvi's store. They run like the store's: `chamvi migrate`, or at start unless `CHAMVI_MIGRATE=false`. With `CHAMVI_MIGRATE=false` and pending migrations, the start and `chamvi start --check` fail with `store_not_migrated` (`run chamvi migrate or set CHAMVI_MIGRATE=true`) and apply nothing.

`chamvi migration <run|revert|status|drift> --database vector` manages the chain on its own. Beside another `databaseModule()` the flag is required (exit 2 without it). `chamvi migration` reads `DATABASE_URL` only and ignores `vectorStoreModule({ url })`: point `DATABASE_URL` at that database when the knowledge lives elsewhere.

## Search and replicas

Search is exact: each one compares the query with every chunk of the collection's served generation (no approximate index), which stays fast up to tens of thousands of chunks per collection. Chunks of another vector length are skipped, so a re-embed with another model never breaks a search.

Each collection carries a fence: a pass whose lock `knowledge:<name>` lapsed writes nothing once another replica took it over. The lock lives in chamvi's store, so replicas need a shared one (`DATABASE_URL`): with a memory store beside a shared vector database, every process holds its own locks and the replicas fence each other out, so run one replica only.

Text is stored as PostgreSQL can hold it: NUL characters and lone surrogates in content, titles, sources and metadata become U+FFFD.

## Schema

| Table | Holds |
|---|---|
| `chamvi_vector_collections` | One row per knowledge collection (`name` unique), with its served and pending generation and a `fence` counter |
| `chamvi_vector_documents` | The documents of a collection (`(collection_id, id)` unique), removed with it |
| `chamvi_vector_chunks` | The embedded chunks (`embedding vector` without a fixed length), removed with their collection |

| Export | Value |
|---|---|
| `vectorStoreModule(options?)`, `VectorStoreModule` | The app module (`chamvi:knowledge-repository`, database `vector`), options `{ url? }` |
| `DatabaseKnowledgeRepository` | The root knowledge repository on a TypeORM data source, with `DatabaseKnowledgeDocumentRepository` and `DatabaseKnowledgeChunkRepository` as its children |
| `KNOWLEDGE_VECTOR_DATABASE` | `'vector'` |
| `KNOWLEDGE_VECTOR_MIGRATIONS_TABLE` | `'chamvi_vector_migrations'` |
| `KNOWLEDGE_VECTOR_ENTITIES` | The TypeORM entities of the three tables |
| `KNOWLEDGE_VECTOR_MIGRATIONS` | The migration classes, in order |

## License

Published under [Apache License 2.0](./LICENSE).
