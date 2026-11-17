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

const SCRIPT = fileURLToPath(new URL('../fixtures/lazy.mjs', import.meta.url));

/** What importing the kit never loads: the database store, TypeORM and its drivers. */
const DATABASE_MODULES = [
    /\/store-db\//,
    /\/node_modules\/typeorm\//,
    /\/node_modules\/typeorm-extension\//,
    /\/node_modules\/@rapiq\/adapter-typeorm\//,
    /\/node_modules\/pg\//,
    /\/node_modules\/better-sqlite3\//,
];

describe('@chamvi/test-kit without a database', () => {
    it('importing the kit and building an engine loads no typeorm, no driver and no @chamvi/store-db', async () => {
        // the built @chamvi/test-kit (nx runs this package's tests after its build)
        const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT], { timeout: 60_000 });
        const result = JSON.parse(stdout.trim()) as { exports: string[]; resolved: string[] };

        expect(result.exports).toContain('createTestDataSource');
        expect(result.exports).toContain('createTestEngine');
        // the walk saw the kit: the store packages it does load
        expect(result.resolved.some((url) => /\/store-memory\//.test(url))).toBe(true);
        expect(result.resolved.filter((url) => DATABASE_MODULES.some((pattern) => pattern.test(url)))).toEqual([]);
    });
});
