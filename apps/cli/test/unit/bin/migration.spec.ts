/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { fixtureDir } from '../../utils/app.ts';
import { startEnv } from '../../utils/env.ts';
import { freePort } from '../../utils/port.ts';
import {
    createTestDatabase,
    describePostgres,
    dropTestDatabase,
    postgresUrl,
} from '../../utils/postgres.ts';
import {
    fixtureEntry,
    loadProbeEnv,
    loadedModules,
    spawnCli,
} from '../../utils/spawn.ts';
import type { CliProcess } from '../../utils/spawn.ts';

const ONE = path.join(fixtureDir('database'), 'src/one.ts');

let cli: CliProcess | undefined;

afterEach(() => {
    cli?.kill();
    cli = undefined;
});

it('bin migration without DATABASE_URL exits 2 naming it', async () => {
    cli = spawnCli(['migration', 'status', '--entry', ONE]);

    expect((await cli.exited()).code).toBe(2);
    expect(cli.stderr()).toContain('DATABASE_URL is required');
});

it('bin start --check of an app without a database module loads neither TypeORM nor the migration operations', async () => {
    const port = await freePort();

    cli = spawnCli(['start', '--check', '--entry', fixtureEntry('app')], { env: { ...startEnv(port), ...loadProbeEnv() } });

    expect((await cli.exited()).code).toBe(0);
    expect(loadedModules(cli.stderr())).toEqual([]);
});

it('bin migration loads @chamvi/store-db only when it runs', async () => {
    cli = spawnCli(['migration', 'status', '--entry', ONE], { env: loadProbeEnv() });

    expect((await cli.exited()).code).toBe(2);
    expect(loadedModules(cli.stderr()).some((url) => url.includes('/store-db/'))).toBe(true);
});

describePostgres('bin migration on PostgreSQL', () => {
    let database: string | undefined;

    afterEach(async () => {
        if (!database) {
            return;
        }

        await dropTestDatabase(database);
        database = undefined;
    });

    it('run and drift --database store on a migrated database exit 0', async () => {
        database = await createTestDatabase();

        const env = { DATABASE_URL: postgresUrl(database) };

        cli = spawnCli(['migration', 'run', '--database', 'store'], { env });
        expect((await cli.exited()).code).toBe(0);
        expect(cli.stdout()).toContain('applied UuidBaseline1794096000000');

        cli = spawnCli(['migration', 'drift', '--database', 'store'], { env });
        expect(await cli.exited()).toEqual({ code: 0, signal: null });
        expect(cli.stdout()).toBe('The database "store" matches its entities.\n');
    });

    it('status of an app database with a pending migration exits 1', async () => {
        database = await createTestDatabase();

        cli = spawnCli(['migration', 'status', '--entry', ONE], { env: { DATABASE_URL: postgresUrl(database) } });
        expect((await cli.exited()).code).toBe(1);
        expect(cli.stdout()).toBe('[ ] Init1795000000000\nThe database "notes" has 1 pending migration(s).\n');
    });
});
