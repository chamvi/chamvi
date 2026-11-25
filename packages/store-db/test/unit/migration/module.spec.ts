/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspect } from 'node:util';
import type { MigrationInterface } from 'typeorm';
import { withDatabaseLock } from 'typeorm-extension';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { DatabaseOptionsError, DatabaseUnavailableError } from '../../../src/error/index.ts';
import { migrateDatabase } from '../../../src/database/index.ts';
import { runMigrationOperation } from '../../../src/migration/index.ts';
import { describePostgres } from '../../utils/database.ts';
import {
    createTestDatabase,
    databaseExists,
    dropTestDatabase,
    extensionsOf,
    notesDescriptor,
    notesV1,
    notesV2,
    notesWithExtension,
    openPlain,
    postgresUrl,
    recordedInput,
    schemaMigration,
    tablesOf,
} from '../../utils/migration.ts';

/**
 * Inside the package (a `cache` folder, ignored by git), so a generated
 * file's `typeorm` import resolves and Vitest compiles it when the spec
 * imports it.
 */
const TMP_ROOT = fileURLToPath(new URL('../../../cache/migration-spec/', import.meta.url));

async function tempDirectory(): Promise<string> {
    await mkdir(TMP_ROOT, { recursive: true });

    return mkdtemp(TMP_ROOT);
}

async function importMigration(file: string): Promise<new () => MigrationInterface> {
    const exports = await import(/* @vite-ignore */ pathToFileURL(file).href) as Record<string, new () => MigrationInterface>;
    const [migration] = Object.values(exports);

    return migration!;
}

describe('runMigrationOperation without a database server', () => {
    it.each(['run', 'revert', 'status', 'drift'] as const)('%s refuses without DATABASE_URL (the app would run on SQLite) and names it', async (operation) => {
        const input = recordedInput({ operation, descriptors: [notesDescriptor()] });

        await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseOptionsError);
        await expect(runMigrationOperation(input)).rejects.toThrow(/DATABASE_URL/);
        expect(input.lines).toEqual([]);
    });

    it('an app without a database module is refused, pointing at --database store', async () => {
        const input = recordedInput({
            operation: 'status',
            descriptors: [],
            url: 'postgres://u:p@127.0.0.1:1/x',
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(/no database module.*--database store/);
    });

    it('an unknown --database is refused, listing the names', async () => {
        const input = recordedInput({
            operation: 'status',
            descriptors: [notesDescriptor(), notesDescriptor({ name: 'tags', migrationsTableName: 'tags_migrations' })],
            database: 'nope',
            url: 'postgres://u:p@127.0.0.1:1/x',
        });

        await expect(runMigrationOperation(input)).rejects.toThrow('The app has no database "nope"; --database takes one of "notes", "tags", "store".');
    });

    it('several databases without --database are refused, listing the names', async () => {
        const input = recordedInput({
            operation: 'status',
            descriptors: [notesDescriptor(), notesDescriptor({ name: 'tags', migrationsTableName: 'tags_migrations' })],
            url: 'postgres://u:p@127.0.0.1:1/x',
        });

        await expect(runMigrationOperation(input)).rejects.toThrow('The app has several databases; pass --database with one of "notes", "tags", "store".');
    });

    it('an unknown operation is refused', async () => {
        const input = recordedInput({ operation: 'seed' as never, descriptors: [notesDescriptor()] });

        await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseOptionsError);
    });

    it.each(['', undefined])('migrateDatabase refuses the lock name %j: a lock nobody can take never ends', async (lockName) => {
        await expect(migrateDatabase({ migrations: [] } as never, { lockName: lockName as never })).rejects.toThrow(DatabaseOptionsError);
    });

    it('generate refuses without MIGRATION_DATABASE_URL', async () => {
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor()],
            name: 'Init',
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(/MIGRATION_DATABASE_URL is required/);
    });

    it.each([undefined, 'add-rating', 'addRating', ''])('generate refuses the name %j', async (name) => {
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor()],
            ...(name !== undefined && { name }),
            scratchUrl: 'postgres://u:p@127.0.0.1:1/scratch',
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(/--name/);
    });

    it('a database that cannot be reached is a DatabaseUnavailableError without the URL or its password', async () => {
        const marker = `pw-${randomUUID()}`;
        const input = recordedInput({
            operation: 'status',
            descriptors: [notesDescriptor()],
            url: `postgres://user:${marker}@127.0.0.1:1/notes`,
            connectTimeoutMs: 2000,
        });
        const error = await runMigrationOperation(input).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect(inspect(error, { depth: 10 })).not.toContain(marker);
        expect(inspect(error, { depth: 10 })).not.toContain('127.0.0.1:1');
        expect(input.lines.join('\n')).not.toContain(marker);
    });
});

describePostgres('runMigrationOperation', () => {
    const databases: string[] = [];
    let directory: string;

    beforeEach(async () => {
        directory = await tempDirectory();
    });

    afterEach(async () => {
        await Promise.all(databases.splice(0).map((database) => dropTestDatabase(database)));
        await rm(directory, { recursive: true, force: true });
    });

    async function database(): Promise<string> {
        const name = await createTestDatabase();

        databases.push(name);

        return name;
    }

    function scratchName(): string {
        const name = `chamvi_scratch_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

        databases.push(name);

        return name;
    }

    it('generate writes a migration for a changed entity and it applies cleanly', async () => {
        const scratch = scratchName();
        const real = await database();

        // the first migration, from no migrations at all
        const first = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            url: postgresUrl(real),
            scratchUrl: postgresUrl(scratch),
            now: () => 1795000000000,
        });

        expect(await runMigrationOperation(first)).toBe(0);
        expect(await readdir(directory)).toEqual(['1795000000000-init.ts']);
        expect(first.lines).toEqual([
            `wrote ${path.join(directory, '1795000000000-init.ts')}`,
            'Add Init1795000000000 to the migrations of the database "notes".',
        ]);

        const init = await importMigration(path.join(directory, '1795000000000-init.ts'));

        expect(init.name).toBe('Init1795000000000');

        // the entity gains a column
        const second = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({
                migrationsDirectory: directory,
                entities: [notesV2()],
                migrations: [init],
            })],
            name: 'AddNoteRating',
            url: postgresUrl(real),
            scratchUrl: postgresUrl(scratch),
            now: () => 1795000000001,
        });

        expect(await runMigrationOperation(second)).toBe(0);

        const file = path.join(directory, '1795000000001-add-note-rating.ts');
        const content = await readFile(file, 'utf8');

        expect(content).toContain('export class AddNoteRating1795000000001 implements MigrationInterface');
        expect(content).toContain('ALTER TABLE "notes"');
        expect(content).toContain('"rating" integer');
        expect(await databaseExists(scratch)).toBe(false);

        // both apply cleanly to the real database, which then matches the entities
        const rating = await importMigration(file);
        const descriptors = [notesDescriptor({ entities: [notesV2()], migrations: [init, rating] })];

        expect(await runMigrationOperation(recordedInput({
            operation: 'run',
            descriptors,
            url: postgresUrl(real),
        }))).toBe(0);
        expect(await runMigrationOperation(recordedInput({
            operation: 'drift',
            descriptors,
            url: postgresUrl(real),
        }))).toBe(0);
        expect(await tablesOf(real)).toEqual(['notes', 'notes_migrations']);
    });

    it('generate reports no changes for an unchanged schema and writes no file', async () => {
        const scratch = scratchName();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory, migrations: [init] })],
            name: 'Again',
            scratchUrl: postgresUrl(scratch),
        });

        expect(await runMigrationOperation(input)).toBe(0);
        expect(input.lines).toEqual(['The entities of the database "notes" match its migrations: no changes.']);
        expect(await readdir(directory)).toEqual([]);
        expect(await databaseExists(scratch)).toBe(false);
    });

    it('generate drops the scratch database also when a migration fails', async () => {
        const scratch = scratchName();
        const broken = class implements MigrationInterface {
            name = 'Broken1795000000000';

            async up(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
                await queryRunner.query('SELECT * FROM "no_such_table"');
            }

            async down(): Promise<void> {
                // never run
            }
        };
        const input = recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory, migrations: [broken] })],
            name: 'Next',
            scratchUrl: postgresUrl(scratch),
        });

        await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseUnavailableError);
        expect(await databaseExists(scratch)).toBe(false);
        expect(await readdir(directory)).toEqual([]);
    });

    it('run applies, status lists applied and pending, revert undoes the last', async () => {
        const real = await database();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const rating = await schemaMigration('Rating1795000000001', [notesV1(), notesV2()].slice(1));
        const url = postgresUrl(real);
        const only = [notesDescriptor({ migrations: [init] })];
        const both = [notesDescriptor({ migrations: [init, rating] })];

        const before = recordedInput({
            operation: 'status',
            descriptors: both,
            url,
        });

        expect(await runMigrationOperation(before)).toBe(1);
        expect(before.lines).toEqual([
            '[ ] Init1795000000000',
            '[ ] Rating1795000000001',
            'The database "notes" has 2 pending migration(s).',
        ]);
        // status never creates the migrations table
        expect(await tablesOf(real)).toEqual([]);

        const ran = recordedInput({
            operation: 'run',
            descriptors: only,
            url,
        });

        expect(await runMigrationOperation(ran)).toBe(0);
        expect(ran.lines).toEqual(['applied Init1795000000000']);

        const half = recordedInput({
            operation: 'status',
            descriptors: both,
            url,
        });

        expect(await runMigrationOperation(half)).toBe(1);
        expect(half.lines).toEqual([
            '[x] Init1795000000000',
            '[ ] Rating1795000000001',
            'The database "notes" has 1 pending migration(s).',
        ]);

        const again = recordedInput({
            operation: 'run',
            descriptors: only,
            url,
        });

        expect(await runMigrationOperation(again)).toBe(0);
        expect(again.lines).toEqual(['The database "notes" has no pending migrations.']);

        const reverted = recordedInput({
            operation: 'revert',
            descriptors: only,
            url,
        });

        expect(await runMigrationOperation(reverted)).toBe(0);
        expect(reverted.lines).toEqual(['reverted Init1795000000000']);
        expect(await tablesOf(real)).toEqual(['notes_migrations']);

        const nothing = recordedInput({
            operation: 'revert',
            descriptors: only,
            url,
        });

        expect(await runMigrationOperation(nothing)).toBe(0);
        expect(nothing.lines).toEqual(['The database "notes" has no migration to revert.']);

        const after = recordedInput({
            operation: 'status',
            descriptors: only,
            url,
        });

        expect(await runMigrationOperation(after)).toBe(1);
        expect(after.lines).toEqual(['[ ] Init1795000000000', 'The database "notes" has 1 pending migration(s).']);
    });

    it('status lists a recorded migration the database no longer has and is up to date otherwise', async () => {
        const real = await database();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const url = postgresUrl(real);

        await runMigrationOperation(recordedInput({
            operation: 'run',
            descriptors: [notesDescriptor({ migrations: [init] })],
            url,
        }));

        const input = recordedInput({
            operation: 'status',
            descriptors: [notesDescriptor({ migrations: [] })],
            url,
        });

        expect(await runMigrationOperation(input)).toBe(0);
        expect(input.lines).toEqual([
            '[x] Init1795000000000 (recorded, not among the database\'s migrations)',
            'The database "notes" is up to date.',
        ]);
    });

    it('run takes the module\'s lock', async () => {
        const real = await database();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const url = postgresUrl(real);
        const holder = await openPlain(real);
        const runner = holder.createQueryRunner();
        const { promise: release, resolve: unlock } = Promise.withResolvers<void>();
        const { promise: held, resolve: holding } = Promise.withResolvers<void>();

        try {
            const locked = withDatabaseLock(runner, 'chamvi:db:notes', async () => {
                holding();
                await release;
            });

            await held;

            const running = runMigrationOperation(recordedInput({
                operation: 'run',
                descriptors: [notesDescriptor({ migrations: [init] })],
                url,
            }));

            // the run asked for the lock and keeps asking while it is held
            for (let polls = 0; ; polls++) {
                const rows: unknown[] = await holder.query(
                    'SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND query LIKE \'%pg_try_advisory_lock%\' AND pid <> pg_backend_pid()',
                );

                if (rows.length > 0) {
                    break;
                }

                expect(polls).toBeLessThan(10_000);
            }

            expect(await tablesOf(real)).toEqual([]);

            unlock();
            await locked;

            expect(await running).toBe(0);
            expect(await tablesOf(real)).toEqual(['notes', 'notes_migrations']);
        } finally {
            unlock();
            await runner.release();
            await holder.destroy();
        }
    });

    it('drift exits 0 on a migrated schema and 1 after an entity gained a column, printing the statement', async () => {
        const real = await database();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const url = postgresUrl(real);

        await runMigrationOperation(recordedInput({
            operation: 'run',
            descriptors: [notesDescriptor({ migrations: [init] })],
            url,
        }));

        const clean = recordedInput({
            operation: 'drift',
            descriptors: [notesDescriptor({ migrations: [init] })],
            url,
        });

        expect(await runMigrationOperation(clean)).toBe(0);
        expect(clean.lines).toEqual(['The database "notes" matches its entities.']);

        const drifted = recordedInput({
            operation: 'drift',
            descriptors: [notesDescriptor({ entities: [notesV2()], migrations: [init] })],
            url,
        });

        expect(await runMigrationOperation(drifted)).toBe(1);
        expect(drifted.lines).toEqual([
            'The database "notes" differs from its entities; these statements would reconcile it:',
            'ALTER TABLE "notes" ADD "rating" integer;',
        ]);
        // drift never changes the schema
        expect(await runMigrationOperation(drifted)).toBe(1);
    });

    it('drift and status send no DDL: an entity needing an extension installs none', async () => {
        const real = await database();
        const url = postgresUrl(real);
        const descriptors = [notesDescriptor({ entities: [notesWithExtension()] })];

        expect(await runMigrationOperation(recordedInput({
            operation: 'status',
            descriptors,
            url,
        }))).toBe(0);
        expect(await runMigrationOperation(recordedInput({
            operation: 'drift',
            descriptors,
            url,
        }))).toBe(1);
        expect(await extensionsOf(real)).toEqual(['plpgsql']);
        expect(await tablesOf(real)).toEqual([]);
    });

    it('two runs at once: each migration is reported applied once, by the run that applied it', async () => {
        const real = await database();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const url = postgresUrl(real);
        const descriptors = [notesDescriptor({ migrations: [init] })];
        const first = recordedInput({
            operation: 'run',
            descriptors,
            url,
        });
        const second = recordedInput({
            operation: 'run',
            descriptors,
            url,
        });

        expect(await Promise.all([runMigrationOperation(first), runMigrationOperation(second)])).toEqual([0, 0]);
        expect([...first.lines, ...second.lines].sort()).toEqual([
            'The database "notes" has no pending migrations.',
            'applied Init1795000000000',
        ]);
    });

    it('a descriptor without a lock name (an older @chamvi/app) migrates under chamvi:db:<name>', async () => {
        const real = await database();
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const url = postgresUrl(real);
        const older: Record<string, unknown> = { ...notesDescriptor({ migrations: [init] }) };

        delete older.lockName;

        const holder = await openPlain(real);
        const runner = holder.createQueryRunner();
        const { promise: release, resolve: unlock } = Promise.withResolvers<void>();
        const { promise: held, resolve: holding } = Promise.withResolvers<void>();

        try {
            const locked = withDatabaseLock(runner, 'chamvi:db:notes', async () => {
                holding();
                await release;
            });

            await held;

            const running = runMigrationOperation(recordedInput({
                operation: 'run',
                descriptors: [older as never],
                url,
            }));

            for (let polls = 0; ; polls++) {
                const rows: unknown[] = await holder.query(
                    'SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND query LIKE \'%pg_try_advisory_lock%\' AND pid <> pg_backend_pid()',
                );

                if (rows.length > 0) {
                    break;
                }

                expect(polls).toBeLessThan(10_000);
            }

            expect(await tablesOf(real)).toEqual([]);
            unlock();
            await locked;
            expect(await running).toBe(0);
        } finally {
            unlock();
            await runner.release();
            await holder.destroy();
        }
    });

    it('no operation prints the url or its password', async () => {
        const real = await database();
        const scratch = scratchName();
        const marker = `pw${randomUUID().replaceAll('-', '')}`;
        const role = `chamvi_role_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        const admin = await openPlain('postgres');

        try {
            await admin.query(`CREATE ROLE "${role}" LOGIN CREATEDB PASSWORD '${marker}'`);
            await admin.query(`ALTER DATABASE "${real}" OWNER TO "${role}"`);
        } finally {
            await admin.destroy();
        }

        const url = postgresUrl(real, { username: role, password: marker });
        const scratchUrl = postgresUrl(scratch, { username: role, password: marker });
        const init = await schemaMigration('Init1795000000000', [notesV1()]);
        const outputs: string[] = [];
        const descriptors = [notesDescriptor({
            migrationsDirectory: directory,
            entities: [notesV2()],
            migrations: [init],
        })];

        for (const operation of ['status', 'run', 'drift', 'revert', 'generate'] as const) {
            const input = recordedInput({
                operation,
                descriptors,
                url,
                scratchUrl,
                name: 'AddNoteRating',
            });

            outputs.push(String(await runMigrationOperation(input).catch((error: unknown) => inspect(error, { depth: 10 }))));
            outputs.push(...input.lines);
        }

        // a failing one too: a migration that breaks
        const failing = recordedInput({
            operation: 'run',
            descriptors: [notesDescriptor({ migrations: [init, await schemaMigration('Init1795000000001', [notesV1()])] })],
            url,
        });

        outputs.push(inspect(await runMigrationOperation(failing).catch((error: unknown) => error), { depth: 10 }));
        outputs.push(...failing.lines);

        const text = outputs.join('\n');

        expect(text).toContain('wrote');
        expect(text).toContain('DatabaseUnavailableError');
        expect(text).not.toContain(marker);
        expect(text).not.toContain(url);
    });
});
