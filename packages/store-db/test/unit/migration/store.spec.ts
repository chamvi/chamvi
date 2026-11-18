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
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { STORE_MIGRATIONS } from '../../../src/schema/index.ts';
import { runMigrationOperation } from '../../../src/migration/index.ts';
import { storeMigrationsDirectory } from '../../../src/migration/target.ts';
import { describePostgres } from '../../utils/database.ts';
import {
    createTestDatabase,
    databaseExists,
    dropTestDatabase,
    notesDescriptor,
    postgresUrl,
    recordedInput,
    tablesOf,
} from '../../utils/migration.ts';

const STORE_SOURCE = fileURLToPath(new URL('../../../src/migrations', import.meta.url));

describe('storeMigrationsDirectory', () => {
    it('is the sources\' migrations folder in this repository, from the sources and from the build', () => {
        expect(storeMigrationsDirectory()).toBe(STORE_SOURCE);
        expect(storeMigrationsDirectory(fileURLToPath(new URL('../../../dist/index.mjs', import.meta.url)))).toBe(STORE_SOURCE);
    });

    it('is undefined for a published package, which ships dist only', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'chamvi-store-db-'));

        try {
            await mkdir(path.join(root, 'dist'));
            await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@chamvi/store-db' }));
            await writeFile(path.join(root, 'dist', 'index.mjs'), '');

            expect(storeMigrationsDirectory(path.join(root, 'dist', 'index.mjs'))).toBeUndefined();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describePostgres('runMigrationOperation --database store', () => {
    const databases: string[] = [];

    afterEach(async () => {
        await Promise.all(databases.splice(0).map((database) => dropTestDatabase(database)));
    });

    it('run migrates chamvi\'s store into its own table, status lists every migration and drift finds none', async () => {
        const real = await createTestDatabase();

        databases.push(real);

        const url = postgresUrl(real);
        // an app database beside it: --database store never touches it
        const descriptors = [notesDescriptor()];

        const ran = recordedInput({
            operation: 'run',
            descriptors,
            database: 'store',
            url,
        });

        expect(await runMigrationOperation(ran)).toBe(0);
        expect(ran.lines).toEqual(STORE_MIGRATIONS.map((migration) => `applied ${migration.name}`));
        expect(await tablesOf(real)).toContain('migrations');
        expect(await tablesOf(real)).not.toContain('notes');

        const status = recordedInput({
            operation: 'status',
            descriptors,
            database: 'store',
            url,
        });

        expect(await runMigrationOperation(status)).toBe(0);
        expect(status.lines.at(-1)).toBe('The database "store" is up to date.');
        expect(status.lines).toContain('[x] ConnectionsRevisionsItemBytes1794230765000');

        // the aggregate tasks changed no schema beyond the one deliberate migration
        const drift = recordedInput({
            operation: 'drift',
            descriptors,
            database: 'store',
            url,
        });

        expect(await runMigrationOperation(drift)).toBe(0);
        expect(drift.lines).toEqual(['The database "store" matches its entities.']);
    });

    it('generate finds chamvi\'s entities and migrations equal and writes nothing', async () => {
        const scratch = `chamvi_scratch_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

        databases.push(scratch);

        const before = await readdir(STORE_SOURCE);
        const input = recordedInput({
            operation: 'generate',
            descriptors: [],
            database: 'store',
            name: 'Nothing',
            scratchUrl: postgresUrl(scratch),
        });

        expect(await runMigrationOperation(input)).toBe(0);
        expect(input.lines).toEqual(['The entities of the database "store" match its migrations: no changes.']);
        expect(await readdir(STORE_SOURCE)).toEqual(before);
        expect(await databaseExists(scratch)).toBe(false);
    });
});
