/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    mkdir,
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { loadDatabaseStore } from '../../src/database/helpers.ts';

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** An app folder whose node_modules holds `name`, which the kit's own folder cannot see (pnpm's layout). */
async function appWith(name: string): Promise<string> {
    const app = await mkdtemp(path.join(tmpdir(), 'chamvi-app-'));
    const folder = path.join(app, 'node_modules', ...name.split('/'));

    directories.push(app);
    await mkdir(path.join(folder, 'dist'), { recursive: true });
    await writeFile(path.join(folder, 'package.json'), JSON.stringify({
        name,
        type: 'module',
        exports: { './package.json': './package.json', '.': { import: './dist/index.mjs' } },
    }));
    await writeFile(path.join(folder, 'dist', 'index.mjs'), 'export const POSTGRES_PROTOCOLS = [\'from-the-app:\'];\n');

    return app;
}

describe('loadDatabaseStore', () => {
    it('finds the package from the app\'s folder when the kit\'s own folder cannot resolve it', async () => {
        const app = await appWith('@chamvi-fixture/store-db');

        const store = await loadDatabaseStore('@chamvi-fixture/store-db', app);

        expect(store.POSTGRES_PROTOCOLS).toEqual(['from-the-app:']);
    });

    it('names the package and says to add it to the app\'s devDependencies when neither folder has it', async () => {
        const app = await mkdtemp(path.join(tmpdir(), 'chamvi-app-'));

        directories.push(app);

        const error = await loadDatabaseStore('@chamvi-fixture/missing-store', app).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toBe(
            'createTestDataSource needs @chamvi-fixture/missing-store: add it to the app\'s devDependencies, ' +
            'with typeorm and better-sqlite3 (SQLite) or pg (PostgreSQL).',
        );
    });
});
