/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import { inspect } from 'node:util';
import { pinTimezone } from 'typeorm-extension';
import { describe, expect, it } from 'vitest';
import { DATABASE_MIGRATIONS_TABLE_PATTERN, buildDatabaseOptions } from '../../../src/database/index.ts';
import { DatabaseOptionsError } from '../../../src/error/index.ts';
import type { DatabaseOptionsInput } from '../../../src/database/index.ts';

class NoteEntity {}

class Init1795000000000 {}

const MARKER = 'pw-marker-7c1f';

describe('buildDatabaseOptions', () => {
    it('with DATABASE_URL builds PostgreSQL options', () => {
        const { kind, options } = buildDatabaseOptions({
            url: 'postgres://u:p@db.local:5432/app',
            entities: [NoteEntity],
            migrations: [Init1795000000000],
            migrationsTableName: 'notes_migrations',
            connectTimeoutMs: 10_000,
            production: false,
            mode: 'start',
        });

        expect(kind).toBe('postgres');
        expect(options).toMatchObject({
            type: 'postgres',
            url: 'postgres://u:p@db.local:5432/app',
            entities: [NoteEntity],
            migrations: [Init1795000000000],
            migrationsTableName: 'notes_migrations',
            migrationsRun: false,
            synchronize: false,
            logging: false,
            connectTimeoutMS: 10_000,
        });
    });

    it('pins the PostgreSQL session and the driver to UTC, as pinTimezone does', () => {
        const { options } = buildDatabaseOptions({
            url: 'postgres://u:p@db.local:5432/app',
            entities: [NoteEntity],
            migrations: [],
            migrationsTableName: 'notes_migrations',
            connectTimeoutMs: 10_000,
            production: false,
            mode: 'start',
        });
        const extra = (options as { extra?: Record<string, unknown> }).extra ?? {};

        expect(extra.options).toContain('TimeZone=UTC');
        expect(extra.Client).toBeTypeOf('function');
        // the pin is installed: applying it again keeps the options as they are
        expect(pinTimezone(options, 'UTC')).toBe(options);
    });

    it('without DATABASE_URL builds SQLite in memory', () => {
        const { kind, options } = buildDatabaseOptions({
            entities: [NoteEntity],
            migrations: [Init1795000000000],
            migrationsTableName: 'notes_migrations',
            connectTimeoutMs: 10_000,
            production: false,
            mode: 'start',
        });

        expect(kind).toBe('sqlite');
        expect(options).toMatchObject({
            type: 'better-sqlite3',
            database: ':memory:',
            entities: [NoteEntity],
            migrations: [],
            migrationsRun: false,
            synchronize: false,
            logging: false,
        });
    });

    it('the built options never print the password', () => {
        const { options } = buildDatabaseOptions({
            url: `postgres://u:${MARKER}@db.local:5432/app`,
            entities: [NoteEntity],
            migrations: [],
            migrationsTableName: 'notes_migrations',
            connectTimeoutMs: 10_000,
            production: false,
            mode: 'start',
        });

        // the options hold the url for the driver; nothing else in them repeats it
        expect(inspect({ ...options, url: undefined }, { depth: 5 })).not.toContain(MARKER);
    });

    describe('refuses', () => {
        const input = (extra: Partial<DatabaseOptionsInput>): DatabaseOptionsInput => ({
            url: 'postgres://u:p@db.local:5432/app',
            entities: [NoteEntity],
            migrations: [],
            migrationsTableName: 'notes_migrations',
            connectTimeoutMs: 10_000,
            production: false,
            mode: 'start',
            ...extra,
        });

        function refusal(extra: Partial<DatabaseOptionsInput>): DatabaseOptionsError {
            try {
                buildDatabaseOptions(input(extra));
            } catch (error) {
                expect(error).toBeInstanceOf(DatabaseOptionsError);
                expect(error).toMatchObject({ code: 'database_options_invalid' });

                return error as DatabaseOptionsError;
            }

            throw new Error('expected a refusal');
        }

        it('a url that is not PostgreSQL, naming DATABASE_URL and no part of the url', () => {
            for (const url of [`mysql://u:${MARKER}@db.local/app`, `not a url ${MARKER}`, `http://db.local/${MARKER}`]) {
                const error = refusal({ url });

                expect(error.message).toContain('DATABASE_URL');
                expect(inspect(error, { depth: 5 })).not.toContain(MARKER);
                expect(error.message).not.toContain('db.local');
            }
        });

        it('SQLite when production is set', () => {
            expect(refusal({ url: undefined, production: true }).message).toContain('DATABASE_URL');
        });

        it('a missing url in migrate mode', () => {
            expect(refusal({ url: undefined, mode: 'migrate' }).message).toContain('DATABASE_URL');
        });

        it('a migrations table that is no plain identifier, or chamvi\'s own', () => {
            for (const table of ['', 'migrations', 'public.migrations', '"migrations"', 'Migrations', 'notes-migrations', '1notes', 'a'.repeat(64)]) {
                expect(refusal({ migrationsTableName: table }).message, table).toContain('migrationsTableName');
            }

            expect(DATABASE_MIGRATIONS_TABLE_PATTERN.test('notes_migrations')).toBe(true);
            expect(DATABASE_MIGRATIONS_TABLE_PATTERN.test('_m1')).toBe(true);
        });

        it('a migrations table named like a table of chamvi\'s own store or TypeORM\'s metadata table', () => {
            for (const table of ['chamvi_locks', 'chamvi_', 'chamvi_notes_migrations', 'typeorm_metadata', 'typeorm_metadata_2']) {
                expect(refusal({ migrationsTableName: table }).message, table).toMatch(/^migrationsTableName cannot start with "(chamvi_|typeorm_metadata)"/);
            }

            for (const table of ['chamvinotes', 'my_chamvi_migrations', 'typeorm_migrations']) {
                expect(buildDatabaseOptions(input({ migrationsTableName: table })).kind, table).toBe('postgres');
            }
        });

        it('passes a valid PostgreSQL url in production and in migrate mode', () => {
            expect(buildDatabaseOptions(input({ production: true, mode: 'migrate' })).kind).toBe('postgres');
            expect(buildDatabaseOptions(input({ url: 'postgresql://u:p@db.local/app' })).kind).toBe('postgres');
        });
    });
});
