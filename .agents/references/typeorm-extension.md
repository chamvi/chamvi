# Reference: typeorm-extension migrations

- Local `/opt/projects/tada5hi/typeorm-extension`, commit `aecb696`: `src/database/utils/migration.ts` (`generateMigration`) uses TypeORM schema-builder queries and migration templates; `prettify: true` uses TypeORM SQL formatting. Empty `up` and `down` arrays return without writing a file.
- chamvi mapping: `packages/store-db/src/migrations/1792886400000-connections-primary-keys.ts` uses generated, formatted SQL with explicit backfill and constraint ordering; `test/unit/schema/primary-keys.spec.ts` calls the generator after migration to detect schema drift.
