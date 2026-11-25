/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATION_OPERATIONS, STORE_DATABASE } from '@chamvi/store-db';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { MIGRATION_OPERATION_NAMES, STORE_DATABASE_NAME } from '../../../src/commands/constants.ts';
import { runCli } from '../../../src/run/module.ts';
import { copyFixtureApp, fixtureDir } from '../../utils/app.ts';
import type { TempApp } from '../../utils/app.ts';
import {
    createTestDatabase,
    describePostgres,
    dropTestDatabase,
    postgres,
    postgresUrl,
    tablesOf,
    withDatabase,
} from '../../utils/postgres.ts';
import type { UrlSpelling } from '../../utils/postgres.ts';
import { createFakeProcess } from '../../utils/process.ts';

const TWO = path.join(fixtureDir('database'), 'src/index.ts');
const ONE = path.join(fixtureDir('database'), 'src/one.ts');
const BUILT = path.join(fixtureDir('database'), 'built.mjs');
const NO_DATABASE = fileURLToPath(new URL('../../fixtures/app/src/index.ts', import.meta.url));
const CLOSED = 'postgres://user:pw-closed@127.0.0.1:1/notes';

async function migration(args: string[], env: Record<string, string> = {}, cwd?: string) {
    const fake = createFakeProcess();

    await runCli(['migration', ...args], fake.context({ env, ...(cwd !== undefined && { cwd }) }));

    return {
        code: fake.exitCodes.at(-1) ?? 0,
        stdout: fake.stdout.join(''),
        stderr: fake.stderr.join(''),
    };
}

describe('migration', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('names the operations and the store database @chamvi/store-db names', () => {
        expect(MIGRATION_OPERATION_NAMES).toEqual(MIGRATION_OPERATIONS);
        expect(STORE_DATABASE_NAME).toBe(STORE_DATABASE);
    });

    it('an app without a database module exits 2', async () => {
        const result = await migration(['status', '--entry', NO_DATABASE], { DATABASE_URL: CLOSED });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('The app has no database module');
        expect(result.stderr).toContain('--database store');
    });

    it('without an entry file the default app has no database module and exits 2', async () => {
        const result = await migration(['status'], { DATABASE_URL: CLOSED }, path.dirname(fileURLToPath(import.meta.url)));

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('the default app has no database module');
    });

    it('an unknown --database exits 2 and lists the names', async () => {
        const result = await migration(['status', '--entry', TWO, '--database', 'nope'], { DATABASE_URL: CLOSED });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('The app has no database "nope"; --database takes one of "notes", "tags", "store".');
    });

    it('several databases without --database exit 2 and list the names', async () => {
        const result = await migration(['status', '--entry', TWO], { DATABASE_URL: CLOSED });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('pass --database with one of "notes", "tags", "store"');
    });

    it('generate on a built entry exits 2', async () => {
        const result = await migration(['generate', '--entry', BUILT, '--name', 'Init'], { MIGRATION_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/scratch' });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('generate needs the TypeScript source entry');
    });

    it.each([
        [['generate', '--entry', ONE], '--name'],
        [['status', '--entry', ONE, '--name', 'Init'], '--name is for generate only'],
        [['seed', '--entry', ONE], 'The operation must be one of generate, run, revert, status, drift'],
        [['status', '--entry', ONE, '--database'], '--database needs a value'],
        [['status', '--entry', ONE, '--force'], 'Unknown option --force'],
        [[], 'OPERATION'],
    ])('a misuse exits 2: %j', async (args, message) => {
        const result = await migration(args, { MIGRATION_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/scratch', DATABASE_URL: CLOSED });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain(message);
    });

    it.each(['run', 'revert', 'status', 'drift'])('%s without DATABASE_URL exits 2 naming it', async (operation) => {
        const result = await migration([operation, '--entry', ONE]);

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('DATABASE_URL is required');
    });

    it('a DATABASE_URL that is not PostgreSQL exits 2, naming the variable and not the URL', async () => {
        const result = await migration(['status', '--entry', ONE], { DATABASE_URL: 'mysql://user:pw-marker@db.example/notes' });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('DATABASE_URL must use one of the protocols');
        expect(result.stderr).not.toContain('pw-marker');
    });

    it('generate exits 2 when NODE_ENV is production, before reading any URL', async () => {
        const result = await migration(['generate', '--entry', ONE, '--name', 'Next'], {
            NODE_ENV: 'production',
            MIGRATION_DATABASE_URL: 'not a url',
        });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('generate is a development command');
        expect(result.stderr).not.toContain('MIGRATION_DATABASE_URL must');
    });

    it.each(['run', 'status', 'drift', 'revert'])('%s ignores a malformed MIGRATION_DATABASE_URL', async (operation) => {
        const result = await migration([operation, '--entry', ONE], { DATABASE_URL: CLOSED, MIGRATION_DATABASE_URL: 'not a url' });

        // the database, not the development variable, decides: closed port, exit 1
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('DatabaseUnavailableError');
    });

    it('--entry with --database store exits 2: the store needs no app', async () => {
        const result = await migration(['status', '--database', 'store', '--entry', ONE], { DATABASE_URL: CLOSED });

        expect(result.code).toBe(2);
        expect(result.stderr).toContain('--entry');
    });

    it('a database that cannot be reached exits 1 without the URL or its password', async () => {
        const marker = `pw-${randomUUID()}`;
        const result = await migration(['status', '--entry', ONE], { DATABASE_URL: `postgres://user:${marker}@127.0.0.1:1/notes` });

        expect(result.code).toBe(1);
        expect(result.stderr).toContain('DatabaseUnavailableError');
        expect(`${result.stdout}${result.stderr}`).not.toContain(marker);
    });

    it('--help lists the operations and the options', async () => {
        const result = await migration(['--help']);

        expect(result.stdout).toContain('generate|run|revert|status|drift');
        expect(result.stdout).toContain('--database');
        expect(result.stdout).toContain('--name');
    });
});

/**
 * Every spelling of the real database's URL a developer may give
 * `MIGRATION_DATABASE_URL` (Review Focus 8). The server listens
 * on the container's mapped port, so "the default port left out" is
 * covered by `isSameDatabase`'s table in `@chamvi/store-db`.
 */
const SPELLINGS: Array<[string, (real: string) => UrlSpelling]> = [
    ['as written', () => ({})],
    ['postgresql: for postgres:', () => ({ protocol: 'postgresql' })],
    ['the host in upper case', () => ({ host: postgres!.host.toUpperCase() })],
    ['127.0.0.1 for the host', () => ({ host: '127.0.0.1' })],
    ['::1 for the host', () => ({ host: '[::1]' })],
    ['a trailing slash', (real) => ({ rest: `/${real}/` })],
    ['the name percent-encoded', (real) => ({ rest: `/${real.split('').map((c) => `%${c.charCodeAt(0).toString(16)}`).join('')}` })],
    ['a query string', (real) => ({ rest: `/${real}?sslmode=disable&application_name=chamvi` })],
    ['another user', () => ({ username: 'someone_else', password: 'other' })],
];

describePostgres('migration on PostgreSQL', () => {
    const databases: string[] = [];
    let temp: TempApp | undefined;

    afterEach(async () => {
        await Promise.all(databases.splice(0).map((database) => dropTestDatabase(database)));
        await temp?.remove();
        temp = undefined;
    });

    async function database(): Promise<string> {
        const name = await createTestDatabase();

        databases.push(name);

        return name;
    }

    it('passes the operation, the name and the database on', async () => {
        const real = await database();
        const env = { DATABASE_URL: postgresUrl(real) };

        const pending = await migration(['status', '--entry', TWO, '--database', 'notes'], env);

        expect(pending).toMatchObject({ code: 1, stdout: '[ ] Init1795000000000\nThe database "notes" has 1 pending migration(s).\n' });

        const ran = await migration(['run', '--entry', TWO, '--database', 'notes'], env);

        expect(ran).toMatchObject({ code: 0, stdout: 'applied Init1795000000000\n' });
        expect(await tablesOf(real)).toEqual(['notes', 'notes_migrations']);

        // one database: the default
        expect(await migration(['status', '--entry', ONE], env)).toMatchObject({ code: 0 });

        expect(await migration(['revert', '--entry', ONE], env)).toMatchObject({ code: 0, stdout: 'reverted Init1795000000000\n' });

        // generate: the name and the database reach the operation, the file lands in that database's directory
        temp = await copyFixtureApp('database');

        const scratch = `chamvi_scratch_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

        databases.push(scratch);

        const generated = await migration(['generate', '--database', 'tags', '--name', 'CreateTags'], {
            ...env,
            MIGRATION_DATABASE_URL: postgresUrl(scratch),
        }, temp.cwd);

        expect(generated.code).toBe(0);

        // the descriptor resolves the entry's file URL, which macOS gives under /private
        const directory = path.join(await realpath(temp.cwd), 'src/migrations/tags');
        const [file] = await readdir(directory);

        expect(file).toMatch(/^\d{13}-create-tags\.ts$/);
        expect(generated.stdout).toContain(`wrote ${path.join(directory, file!)}`);
        expect(await readFile(path.join(directory, file!), 'utf8')).toContain('CREATE TABLE "tags"');
    });

    it('drift exits 1 when the schema differs, printing the statements', async () => {
        const real = await database();
        const result = await migration(['drift', '--entry', ONE], { DATABASE_URL: postgresUrl(real) });

        expect(result.code).toBe(1);
        expect(result.stdout).toContain('The database "notes" differs from its entities');
        expect(result.stdout).toContain('CREATE TABLE "notes"');
    });

    it('--database store runs chamvi\'s migrations and drift then exits 0', async () => {
        const real = await database();
        const env = { DATABASE_URL: postgresUrl(real) };

        // no entry needed: chamvi's store is the same in every app
        expect((await migration(['run', '--database', 'store'], env)).code).toBe(0);
        expect(await migration(['drift', '--database', 'store'], env)).toEqual({
            code: 0,
            stdout: 'The database "store" matches its entities.\n',
            stderr: '',
        });
        expect(await migration(['status', '--database', 'store'], env)).toMatchObject({ code: 0 });
    });

    describe('MIGRATION_DATABASE_URL naming DATABASE_URL\'s database', () => {
        let real: string;

        beforeEach(async () => {
            real = await database();
            await withDatabase(real, async (dataSource) => {
                await dataSource.query('CREATE TABLE "precious" ("id" int PRIMARY KEY)');
                await dataSource.query('INSERT INTO "precious" VALUES (1)');
            });
        });

        async function preciousRows(): Promise<number> {
            return withDatabase(real, async (dataSource) => {
                const [row] = await dataSource.query('SELECT count(*)::int AS "count" FROM "precious"') as Array<{ count: number }>;

                return row!.count;
            });
        }

        it.each(SPELLINGS)('generate refuses it %s and nothing was dropped', async (_, spelling) => {
            const result = await migration(['generate', '--entry', ONE, '--name', 'Next'], {
                DATABASE_URL: postgresUrl(real),
                MIGRATION_DATABASE_URL: postgresUrl(real, spelling(real)),
            });

            expect(result.code).toBe(2);
            expect(result.stderr).toContain('MIGRATION_DATABASE_URL');
            expect(result.stderr).not.toContain(postgres!.password);
            expect(await preciousRows()).toBe(1);
        });

        it.each(SPELLINGS)('drift with it %s reads DATABASE_URL only and nothing was dropped', async (_, spelling) => {
            const result = await migration(['drift', '--entry', ONE], {
                DATABASE_URL: postgresUrl(real),
                MIGRATION_DATABASE_URL: postgresUrl(real, spelling(real)),
            });

            // the notes table is missing: drift says so
            expect(result.code).toBe(1);
            expect(await preciousRows()).toBe(1);
        });

        it('generate refuses it without DATABASE_URL too: the server reports tables generate did not create', async () => {
            const result = await migration(['generate', '--entry', ONE, '--name', 'Next'], { MIGRATION_DATABASE_URL: postgresUrl(real) });

            expect(result.code).toBe(2);
            expect(result.stderr).toContain('exists and was not created by generate');
            expect(await preciousRows()).toBe(1);
        });
    });
});
