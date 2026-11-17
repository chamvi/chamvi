/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import {
    mkdtemp,
    readdir,
    rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    afterEach,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { DatabaseOptionsError } from '../../../src/error/index.ts';
import { runMigrationOperation } from '../../../src/migration/index.ts';
import { SCRATCH_MARKER } from '../../../src/migration/constants.ts';
import { describePostgres, postgres } from '../../utils/database.ts';
import {
    createTestDatabase,
    databaseComment,
    databaseExists,
    databaseOwner,
    dropTestDatabase,
    notesDescriptor,
    openPlain,
    postgresUrl,
    recordedInput,
    tablesOf,
} from '../../utils/migration.ts';
import type { UrlSpelling } from '../../utils/migration.ts';

/**
 * Every spelling of the real database's URL `CHAMVI_MIGRATION_DATABASE_URL`
 * may use (Review Focus 8). The server listens on the container's mapped
 * port, so "the default port left out" is covered by isSameDatabase's
 * table only.
 */
const SPELLINGS: Array<[string, (real: string) => UrlSpelling]> = [
    ['as written', () => ({})],
    ['postgresql: for postgres:', () => ({ protocol: 'postgresql' })],
    ['the host in upper case', () => ({ host: postgres!.host.toUpperCase() })],
    ['127.0.0.1 for the host', () => ({ host: '127.0.0.1' })],
    ['::1 for the host', () => ({ host: '[::1]' })],
    ['a trailing slash', (real) => ({ rest: `/${real}/` })],
    ['the name percent-encoded', (real) => ({ rest: `/${real.split('').map((c) => `%${c.charCodeAt(0).toString(16)}`).join('')}` })],
    ['the name in upper case', (real) => ({ rest: `/${real.toUpperCase()}` })],
    ['a query string', (real) => ({ rest: `/${real}?sslmode=disable&application_name=chamvi` })],
    ['the database as a query parameter', (real) => ({ rest: `/other?dbname=${real}` })],
    ['another user', () => ({ username: 'someone_else', password: 'other' })],
];

describePostgres('generate and the database DATABASE_URL names (Review Focus 8)', () => {
    let real: string;
    let directory: string;

    beforeEach(async () => {
        real = await createTestDatabase('chamvi_real');
        directory = await mkdtemp(path.join(tmpdir(), 'chamvi-scratch-'));

        const dataSource = await openPlain(real);

        try {
            await dataSource.query('CREATE TABLE "precious" ("id" int PRIMARY KEY)');
            await dataSource.query('INSERT INTO "precious" VALUES (1)');
        } finally {
            await dataSource.destroy();
        }
    });

    afterEach(async () => {
        await dropTestDatabase(real);
        await rm(directory, { recursive: true, force: true });
    });

    async function preciousRows(): Promise<number> {
        const dataSource = await openPlain(real);

        try {
            const [row] = await dataSource.query('SELECT count(*)::int AS "count" FROM "precious"') as Array<{ count: number }>;

            return row!.count;
        } finally {
            await dataSource.destroy();
        }
    }

    it.each(SPELLINGS)('generate refuses a scratch URL naming it %s, and nothing was dropped', async (_, spelling) => {
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            url: postgresUrl(real),
            scratchUrl: postgresUrl(real, spelling(real)),
        });

        const error = await runMigrationOperation(input).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(DatabaseOptionsError);
        expect(input.lines).toEqual([]);
        expect(await preciousRows()).toBe(1);
        expect(await readdir(directory)).toEqual([]);
    });

    it.each(SPELLINGS)('drift with the scratch URL naming it %s works on DATABASE_URL only, and nothing was dropped', async (_, spelling) => {
        const input = recordedInput({
            operation: 'drift',
            descriptors: [notesDescriptor()],
            url: postgresUrl(real),
            scratchUrl: postgresUrl(real, spelling(real)),
        });

        // the notes table is missing: drift reports it, reading only
        expect(await runMigrationOperation(input)).toBe(1);
        expect(await preciousRows()).toBe(1);
    });

    it('the server refuses a database with tables when the URLs cannot tell (no DATABASE_URL, a DNS alias)', async () => {
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            scratchUrl: postgresUrl(real),
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(/exists and was not created by generate/);
        expect(await preciousRows()).toBe(1);
    });

    it('the server refuses a database with tables even when it carries another comment', async () => {
        const admin = await openPlain(real);

        try {
            await admin.query(`COMMENT ON DATABASE "${real}" IS 'production'`);
        } finally {
            await admin.destroy();
        }

        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            scratchUrl: postgresUrl(real),
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseOptionsError);
        expect(await preciousRows()).toBe(1);
    });

    it('a scratch database generate left behind (marked) is dropped and used', async () => {
        const leftover = await createTestDatabase('chamvi_leftover');
        const dataSource = await openPlain(leftover);

        try {
            await dataSource.query('CREATE TABLE "half" ("id" int)');
            await dataSource.query(`COMMENT ON DATABASE "${leftover}" IS '${SCRATCH_MARKER}'`);
        } finally {
            await dataSource.destroy();
        }

        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            url: postgresUrl(real),
            scratchUrl: postgresUrl(leftover),
            now: () => 1795000000000,
        });

        expect(await runMigrationOperation(input)).toBe(0);
        expect(await readdir(directory)).toEqual(['1795000000000-init.ts']);
        expect(await databaseExists(leftover)).toBe(false);
        expect(await preciousRows()).toBe(1);
    });

    it('an existing database without the marker is refused, even empty, and keeps its owner and its function', async () => {
        const empty = await createTestDatabase('chamvi_empty');
        const admin = await openPlain(empty);

        try {
            await admin.query('CREATE FUNCTION "kept"() RETURNS int LANGUAGE sql AS \'SELECT 1\'');
        } finally {
            await admin.destroy();
        }

        const owner = await databaseOwner(empty);
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            url: postgresUrl(real),
            scratchUrl: postgresUrl(empty),
        });

        try {
            await expect(runMigrationOperation(input)).rejects.toThrow(/exists and was not created by generate.*does not exist/);
            expect(await databaseExists(empty)).toBe(true);
            expect(await databaseOwner(empty)).toBe(owner);
            expect(await databaseComment(empty)).toBeNull();

            const dataSource = await openPlain(empty);

            try {
                expect(await dataSource.query('SELECT "kept"() AS "one"')).toEqual([{ one: 1 }]);
            } finally {
                await dataSource.destroy();
            }
        } finally {
            await dropTestDatabase(empty);
        }
    });

    it('a URL with a fragment is refused, and the database it would reach gains neither the marker nor a table', async () => {
        const target = await createTestDatabase('chamvi_fragment');
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            scratchUrl: `${postgresUrl(target)}#x`,
        });

        try {
            await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseOptionsError);
            expect(await databaseComment(target)).toBeNull();
            expect(await tablesOf(target)).toEqual([]);
            expect(await databaseExists(`${target}#x`)).toBe(false);
        } finally {
            await dropTestDatabase(target);
        }
    });

    it.each([
        ['a host in the query', (name: string) => postgresUrl(name, { rest: `/${name}?host=127.0.0.1` })],
        ['a port in the query', (name: string) => postgresUrl(name, { rest: `/${name}?port=${postgres!.port}` })],
        ['a percent-encoded name', (name: string) => postgresUrl(name, { rest: `/${name.replace('_', '%5F')}` })],
        ['no database name', (name: string) => postgresUrl(name, { rest: '' })],
        ['not PostgreSQL', (name: string) => `mysql://u:p@127.0.0.1/${name}`],
        ['a fragment', (name: string) => `${postgresUrl(name)}#x`],
        ['an empty fragment', (name: string) => `${postgresUrl(name)}#`],
        ['a query parameter it does not read', (name: string) => postgresUrl(name, { rest: `/${name}?options=-c%20search_path%3Dx` })],
    ])('refuses a scratch URL with %s before connecting', async (_, scratch) => {
        const name = `chamvi_never_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            scratchUrl: scratch(name),
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseOptionsError);
        expect(await databaseExists(name)).toBe(false);
    });
});
