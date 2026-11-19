/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inspect } from 'node:util';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { describe, expect, it } from 'vitest';
import { configModule, databaseModule } from '@chamvi/app';
import type { AppMode, DatabaseModuleOptions } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import {
    CHAMVI_OWNED_MIGRATIONS_TABLES,
    DATABASE_LOCK_PREFIX,
    DATABASE_MIGRATIONS_TABLE_PATTERN,
    RESERVED_TABLE_PREFIXES,
    STORE_DATABASE,
} from '@chamvi/store-db';
import {
    DATABASE_PREFIX,
    MIGRATIONS_TABLE_PATTERN,
    OWNED_MIGRATIONS_TABLES,
    RESERVED_DATABASE_NAMES,
    RESERVED_MIGRATIONS_TABLE_PREFIXES,
} from '../../../../src/modules/database/constants.ts';
import { notesDatabase, tagsDatabase } from '../../../fixtures/database/index.ts';
import { buildHarness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';

const MARKER = 'pw-marker-5d0a';

/** The database module's setup in `mode`, on the memory store, so only the module reads the database settings. */
async function setupError(options: DatabaseModuleOptions, env: Record<string, string> = {}, mode: AppMode = 'start') {
    const logger = createRecordingLogger(new ControllableClock());
    const harness = buildHarness({
        mode,
        env,
        modules: [configModule({ logger }), memoryStoreModule(), databaseModule(options)],
    });

    const error = await harness.setup().then(() => undefined, (e: unknown) => e as Error);

    await harness.stop();

    return { error, logger };
}

describe('databaseModule options', () => {
    it('refuses SQLite when NODE_ENV is production', async () => {
        const { error } = await setupError(notesDatabase(), { NODE_ENV: 'production' });

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error?.message).toContain('DATABASE_URL');
    });

    it('refuses a missing DATABASE_URL in migrate mode', async () => {
        // the module's own env: chamvi's config reads the app's (which has the URL) and passes
        const { error } = await setupError(
            notesDatabase({ env: {} }),
            { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' },
            'migrate',
        );

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error?.message).toContain('DATABASE_URL');
    });

    it('refuses a url that is not PostgreSQL', async () => {
        const { error } = await setupError(notesDatabase({ env: { DATABASE_URL: 'mysql://u:p@db.local/app' } }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error?.message).toContain('DATABASE_URL');
    });

    it('the error names no part of the url', async () => {
        const { error, logger } = await setupError(notesDatabase({ env: { DATABASE_URL: `mysql://u:${MARKER}@db.local/app` } }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(inspect(error, { depth: 10 })).not.toContain(MARKER);
        expect(inspect(error, { depth: 10 })).not.toContain('db.local');
        expect(logger.lines.join('\n')).not.toContain(MARKER);
    });

    it('refuses an empty migrationsTableName', () => {
        expect(() => databaseModule(notesDatabase({ migrationsTableName: '' }))).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses the table name "migrations" (chamvi\'s own)', () => {
        expect(() => databaseModule(notesDatabase({ migrationsTableName: 'migrations' }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(notesDatabase({ migrationsTableName: 'migrations' }))).toThrow(/chamvi/);
    });

    it('refuses a migrations table that is no plain identifier: a schema, quotes or upper case', () => {
        for (const table of ['public.migrations', '"migrations"', 'Migrations', 'public.notes_migrations', 'notes-migrations', '1notes']) {
            expect(() => databaseModule(notesDatabase({ migrationsTableName: table })), table).toThrow(InvalidAgentDefinitionError);
        }
    });

    it('a second module cannot name the first one\'s table through a schema', () => {
        expect(() => databaseModule(tagsDatabase({ migrationsTableName: 'public.notes_migrations' }))).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses a migrations table named like a table of chamvi\'s own store or TypeORM\'s metadata table', () => {
        for (const table of ['chamvi_locks', 'chamvi_notes_migrations', 'typeorm_metadata']) {
            expect(() => databaseModule(notesDatabase({ migrationsTableName: table })), table).toThrow(InvalidAgentDefinitionError);
            expect(() => databaseModule(notesDatabase({ migrationsTableName: table })), table).toThrow(/chamvi's own store and TypeORM/);
        }

        expect(() => databaseModule(notesDatabase({ migrationsTableName: 'my_chamvi_migrations' }))).not.toThrow();
    });

    it('chamvi_vector_migrations is accepted and any other chamvi_ table still refused', () => {
        expect(() => databaseModule(notesDatabase({ migrationsTableName: 'chamvi_vector_migrations' }))).not.toThrow();

        for (const table of ['chamvi_vector', 'chamvi_vector_migrations_2', 'chamvi_migrations']) {
            expect(() => databaseModule(notesDatabase({ migrationsTableName: table })), table).toThrow(/chamvi's own store and TypeORM/);
        }
    });

    it('postgres: true without DATABASE_URL fails the setup', async () => {
        const { error } = await setupError(notesDatabase({ name: 'vector', postgres: true }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error?.message).toBe('The database "vector" needs PostgreSQL: set DATABASE_URL.');
    });

    it('refuses postgres or installExtensions that is no boolean', () => {
        expect(() => databaseModule(notesDatabase({ postgres: 'yes' as never }))).toThrow(/postgres/);
        expect(() => databaseModule(notesDatabase({ installExtensions: 0 as never }))).toThrow(/installExtensions/);
        expect(() => databaseModule(notesDatabase({ postgres: false, installExtensions: true }))).not.toThrow();
    });

    it('applies the table rule @chamvi/store-db applies', () => {
        expect(MIGRATIONS_TABLE_PATTERN.source).toBe(DATABASE_MIGRATIONS_TABLE_PATTERN.source);
        expect(MIGRATIONS_TABLE_PATTERN.flags).toBe(DATABASE_MIGRATIONS_TABLE_PATTERN.flags);
        expect(RESERVED_MIGRATIONS_TABLE_PREFIXES).toEqual(RESERVED_TABLE_PREFIXES);
        expect(OWNED_MIGRATIONS_TABLES).toEqual(CHAMVI_OWNED_MIGRATIONS_TABLES);
    });

    it.each([0, -1, 1.5, NaN, 2 ** 31, '1000'])('refuses the wait limit %j', (waitTimeoutMs) => {
        expect(() => databaseModule(notesDatabase({ waitTimeoutMs: waitTimeoutMs as number }))).toThrow(/waitTimeoutMs/);
    });

    it('takes a wait limit in milliseconds', () => {
        expect(() => databaseModule(notesDatabase({ waitTimeoutMs: 5_000 }))).not.toThrow();
    });

    it('refuses a name that is no lower-case slug', () => {
        expect(() => databaseModule(notesDatabase({ name: 'Notes DB' }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(notesDatabase({ name: '' }))).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses the name "store", which `chamvi migration --database` gives chamvi\'s own store', () => {
        expect(() => databaseModule(notesDatabase({ name: 'store' }))).toThrow(/"store"/);
        expect(RESERVED_DATABASE_NAMES).toEqual([STORE_DATABASE]);
    });

    it('names its lock as @chamvi/store-db names it for a descriptor without one', () => {
        expect(DATABASE_PREFIX).toBe(DATABASE_LOCK_PREFIX);
    });

    it('refuses entities or migrations that are not lists of classes, and a missing migrations directory', () => {
        expect(() => databaseModule(notesDatabase({ entities: 'x' as never }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(notesDatabase({ entities: [] }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(notesDatabase({ migrations: [{}] as never }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(notesDatabase({ migrationsDirectory: '' }))).toThrow(InvalidAgentDefinitionError);
        expect(() => databaseModule(undefined as never)).toThrow(InvalidAgentDefinitionError);
    });
});
