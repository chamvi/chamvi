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

## Installation

```bash
npm install @chamvi/store-db-vector
```

The database needs the [pgvector](https://github.com/pgvector/pgvector) extension available (for example the `pgvector/pgvector:pg18` image). The first migration runs `CREATE EXTENSION IF NOT EXISTS vector`.

## Schema

| Table | Holds |
|---|---|
| `chamvi_vector_collections` | One row per knowledge collection (`name` unique), with its served and pending generation and a `fence` counter |
| `chamvi_vector_documents` | The documents of a collection (`(collection_id, id)` unique), removed with it |
| `chamvi_vector_chunks` | The embedded chunks (`embedding vector` without a fixed length), removed with their collection |

Its migrations have their own chain, recorded in `chamvi_vector_migrations`, apart from chamvi's store; manage them with `chamvi migration <operation> --database vector`.

| Export | Value |
|---|---|
| `KNOWLEDGE_VECTOR_DATABASE` | `'vector'` |
| `KNOWLEDGE_VECTOR_MIGRATIONS_TABLE` | `'chamvi_vector_migrations'` |
| `KNOWLEDGE_VECTOR_ENTITIES` | The TypeORM entities of the three tables |
| `KNOWLEDGE_VECTOR_MIGRATIONS` | The migration classes, in order |

## License

Published under [Apache License 2.0](./LICENSE).
