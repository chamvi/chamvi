/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    expect,
    it,
    vi,
} from 'vitest';
import type * as schema from '../../../src/schema/module.ts';
import { runMigrationOperation } from '../../../src/migration/index.ts';
import { describePostgres } from '../../utils/database.ts';
import {
    createTestDatabase,
    dropTestDatabase,
    postgresUrl,
    recordedInput,
} from '../../utils/migration.ts';

type Schema = typeof schema;

const calls = vi.hoisted((): string[][] => []);

// the real migrateStore, recording what it reports
vi.mock('../../../src/schema/module.ts', async (importOriginal) => {
    const actual = await importOriginal<Schema>();

    return {
        ...actual,
        migrateStore: async (...args: Parameters<Schema['migrateStore']>) => {
            const ran = await actual.migrateStore(...args);

            calls.push(ran);

            return ran;
        },
    };
});

describePostgres('runMigrationOperation --database store runs migrateStore', () => {
    const databases: string[] = [];

    afterEach(async () => {
        await Promise.all(databases.splice(0).map((database) => dropTestDatabase(database)));
    });

    it('run --database store migrates through migrateStore and prints what it ran', async () => {
        const real = await createTestDatabase();

        databases.push(real);
        calls.length = 0;

        const input = recordedInput({
            operation: 'run',
            descriptors: [],
            database: 'store',
            url: postgresUrl(real),
        });

        expect(await runMigrationOperation(input)).toBe(0);
        expect(calls).toHaveLength(1);
        expect(input.lines).toEqual(calls[0]!.map((name) => `applied ${name}`));

        const again = recordedInput({
            operation: 'run',
            descriptors: [],
            database: 'store',
            url: postgresUrl(real),
        });

        expect(await runMigrationOperation(again)).toBe(0);
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual([]);
    });
});
