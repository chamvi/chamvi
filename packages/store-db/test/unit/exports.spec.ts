/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/store-db';

describe('public api', () => {
    it.each([
        'migrateStore',
        'pendingMigrations',
        'assertStoreNotLegacy',
        'DatabaseRunRepository',
        'DatabaseStepRepository',
        'DatabaseCheckpointRepository',
        'DatabaseIdempotencyRepository',
        'DatabaseLockRepository',
        'DatabaseEffectRepository',
        'DatabaseStateRepository',
        'DatabaseStateDocumentRepository',
        'DatabaseArtifactRepository',
        'DatabaseAgentRevisionRepository',
        'DatabaseConversationRepository',
        'DatabaseConversationItemRepository',
        'DatabaseConversationNoteRepository',
        'DatabaseConversationOperationRepository',
        'DatabaseConnectionRepository',
        'DatabaseConnectionEntryRepository',
        'DatabaseConnectionSecretRepository',
        'EntityRepositoryAdapter',
        'DatabaseUnavailableError',
        'DatabaseBusyError',
        'LegacySchemaError',
        'maskDatabaseUrl',
        'errorCode',
        'DatabaseDriverMissingError',
        'buildDatabaseOptions',
        'connectDatabase',
        'synchronizeDatabase',
        'closeDatabase',
        'migrateDatabase',
        'pendingDatabaseMigrations',
        'findUntypedColumns',
        'queueDataSource',
        'DatabaseOptionsError',
        'runMigrationOperation',
        'isSameDatabase',
        'applyQuery',
        'validateEntitySchemas',
    ])('exports %s', (name) => {
        expect(pkg).toHaveProperty(name);
        expect(pkg[name as keyof typeof pkg]).toBeTypeOf('function');
    });

    it('exports the date and optional jsonb column transformers, and no list schema of its own (decodeQuery and defineSchema are @chamvi/http\'s)', () => {
        expect(pkg.dateToISOStringTransformer.to).toBeTypeOf('function');
        expect(pkg.dateToISOStringTransformer.from).toBeTypeOf('function');
        expect(pkg.OPTIONAL_JSON_TRANSFORMER.to).toBeTypeOf('function');
        expect(pkg.OPTIONAL_JSON_TRANSFORMER.from).toBeTypeOf('function');
        expect(pkg).not.toHaveProperty('decodeQuery');
        expect(pkg).not.toHaveProperty('defineSchema');
        expect(pkg).not.toHaveProperty('prepareQuery');
        expect(pkg).not.toHaveProperty('loadTypeormAdapter');
    });

    it('exports the entities, migrations and lock name', () => {
        expect(pkg.STORE_ENTITIES).toBeInstanceOf(Array);
        expect(pkg.STORE_ENTITIES).toHaveLength(17);
        expect(pkg.STORE_MIGRATIONS).toBeInstanceOf(Array);
        expect(pkg.STORE_MIGRATIONS).toHaveLength(2);
        expect(pkg.STORE_MIGRATIONS.at(-1)?.name).toBe('ConnectionsRevisionsItemBytes1794230765000');
        expect(pkg.MIGRATION_LOCK_NAME).toBe('chamvi:migrations');
        expect(pkg.STORE_LEGACY_SCHEMA_CODE).toBe('store_legacy_schema');
        expect(pkg.DatabaseErrorCode).toEqual({
            DATABASE_UNAVAILABLE: 'database_unavailable',
            DATABASE_DRIVER_MISSING: 'database_driver_missing',
            DATABASE_OPTIONS_INVALID: 'database_options_invalid',
        });
        expect(pkg.CHAMVI_MIGRATIONS_TABLE).toBe('migrations');
        expect(pkg.CHAMVI_OWNED_MIGRATIONS_TABLES).toEqual(['chamvi_vector_migrations']);
        expect(pkg.POSTGRES_PROTOCOLS).toEqual(['postgres:', 'postgresql:']);
        expect(pkg.DATABASE_MIGRATIONS_TABLE_PATTERN).toBeInstanceOf(RegExp);
    });

    it('exports the migration commands\' operations, the store\'s --database and the scratch variable', () => {
        expect(pkg.MIGRATION_OPERATIONS).toEqual(['generate', 'run', 'revert', 'status', 'drift']);
        expect(pkg.STORE_DATABASE).toBe('store');
        expect(pkg.MIGRATION_DATABASE_URL_VARIABLE).toBe('CHAMVI_MIGRATION_DATABASE_URL');
        expect(pkg.DATABASE_LOCK_PREFIX).toBe('chamvi:db:');
    });

    it('builds the ports\' repositories on a data source alone and leaves them out of the store', () => {
        for (const Repository of [
            pkg.DatabaseCheckpointRepository,
            pkg.DatabaseEffectRepository,
            pkg.DatabaseArtifactRepository,
            pkg.DatabaseStateRepository,
            pkg.DatabaseStateDocumentRepository,
            pkg.DatabaseLockRepository,
            pkg.DatabaseIdempotencyRepository,
            pkg.DatabaseAgentRevisionRepository,
            pkg.DatabaseConnectionRepository,
            pkg.DatabaseConnectionEntryRepository,
            pkg.DatabaseConnectionSecretRepository,
            pkg.DatabaseConversationRepository,
            pkg.DatabaseConversationItemRepository,
            pkg.DatabaseConversationNoteRepository,
            pkg.DatabaseConversationOperationRepository,
        ]) {
            expect(Repository.prototype).toBeInstanceOf(pkg.EntityRepositoryAdapter);
        }

        // no store aggregate: an app builds each repository by name
        expect(Object.keys(pkg).filter((name) => /^(create)?Database(Store|StoreOptions)$/.test(name))).toEqual([]);
        expect(pkg).not.toHaveProperty('DatabaseConnectionFenceRepository');
    });
});
