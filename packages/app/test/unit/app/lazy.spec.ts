/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../fixtures/lazy/memory.mjs', import.meta.url));
const DATABASE_SCRIPT = fileURLToPath(new URL('../../fixtures/lazy/database.mjs', import.meta.url));

type DatabaseRun = {
    started?: boolean;
    descriptors?: string[];
    error?: {
        code?: string;
        operation?: string;
        message: string
    };
    resolved: string[];
};

/** Runs the database fixture in `mode`; `forbid` lists packages that throw when loaded, as a missing one does. */
async function runDatabase(mode: string, options: { forbid?: string[]; url?: string } = {}): Promise<DatabaseRun> {
    const { stdout } = await promisify(execFile)(process.execPath, [DATABASE_SCRIPT, mode], {
        timeout: 60_000,
        env: {
            ...process.env,
            LAZY_FORBID: (options.forbid ?? []).join(','),
            LAZY_DATABASE_URL: options.url ?? '',
        },
    });

    return JSON.parse(stdout.trim()) as DatabaseRun;
}

function loaded(run: DatabaseRun, pattern: RegExp): boolean {
    return run.resolved.some((url) => pattern.test(url));
}

const PG = /\/node_modules\/pg\//;
const SQLITE = /\/node_modules\/better-sqlite3\//;
const TYPEORM_EXTENSION = /\/node_modules\/typeorm-extension\//;
const STORE_DB = /\/store-db\//;

/** What an app on memory never loads: the database store, TypeORM, its drivers and its rapiq adapter. */
const DATABASE_MODULES = [
    /\/store-db\//,
    /\/node_modules\/typeorm\//,
    /\/node_modules\/typeorm-extension\//,
    /\/node_modules\/@rapiq\/adapter-typeorm\//,
    /\/node_modules\/@rapiq\/adapter-sql\//,
    /\/node_modules\/pg\//,
    /\/node_modules\/pg-[a-z-]+\//,
    /\/node_modules\/better-sqlite3\//,
];

describe('an app on memory', () => {
    it('an app on memory loads no typeorm', async () => {
        // the built @chamvi/app and its dependencies (nx runs this package's tests after its build)
        const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT], { timeout: 60_000 });
        const result = JSON.parse(stdout.trim()) as {
            issues: unknown[];
            job: string;
            resolved: string[]
        };

        expect(result.issues).toEqual([]);
        expect(result.job).toBe('completed');
        // the walk saw the app: the store packages it does load
        expect(result.resolved.some((url) => /\/store-memory\//.test(url))).toBe(true);
        expect(result.resolved.filter((url) => DATABASE_MODULES.some((pattern) => pattern.test(url)))).toEqual([]);
    });
});

describe('an app with a database module', () => {
    it('importing the package and reading the descriptors loads no driver', async () => {
        const run = await runDatabase('import', { forbid: ['pg', 'better-sqlite3'], url: 'postgres://u:p@127.0.0.1:1/x' });

        expect(run.descriptors).toEqual(['default']);
        expect(loaded(run, PG)).toBe(false);
        expect(loaded(run, SQLITE)).toBe(false);
        expect(loaded(run, TYPEORM_EXTENSION)).toBe(false);
        expect(loaded(run, STORE_DB)).toBe(false);
    });

    it('an app on SQLite loads the database store and never loads pg', async () => {
        const run = await runDatabase('start', { forbid: ['pg'] });

        expect(run.error).toBeUndefined();
        expect(run.started).toBe(true);
        expect(loaded(run, STORE_DB)).toBe(true);
        expect(loaded(run, SQLITE)).toBe(true);
        expect(loaded(run, PG)).toBe(false);
    });

    it('an app on PostgreSQL never loads better-sqlite3', async () => {
        // a closed port: the start fails on the connection, not on the missing SQLite driver
        const run = await runDatabase('start', { forbid: ['better-sqlite3'], url: 'postgres://u:p@127.0.0.1:1/x' });

        expect(run.error).toMatchObject({ code: 'database_unavailable', operation: 'connect' });
        expect(loaded(run, PG)).toBe(true);
        expect(loaded(run, SQLITE)).toBe(false);
    });

    it('an app on SQLite without better-sqlite3 is told which package to install', async () => {
        const run = await runDatabase('start', { forbid: ['better-sqlite3', 'pg'] });

        expect(run.error?.code).toBe('invalid_agent_definition');
        expect(run.error?.message).toContain('better-sqlite3');
        expect(run.error?.message).toContain('npm install better-sqlite3');
        expect(loaded(run, PG)).toBe(false);
    });
});
