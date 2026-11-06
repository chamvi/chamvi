# Reference: PrivateAIM Hub migrations

- Local `/opt/projects/privateaim/hub`, commit `32926d467`: `apps/server-core/src/cli/commands/migration.ts` applies migrations before calling typeorm-extension `generateMigration({ prettify: true })`.
- chamvi mapping: `packages/store-db/test/unit/schema/primary-keys.spec.ts` verifies an empty generation result after migration; the primary-key migration adds a data backfill and preserves legacy foreign-key validation states.
