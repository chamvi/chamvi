/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    expect,
    it,
    vi,
} from 'vitest';
import type * as typeormExtension from 'typeorm-extension';
import type * as connect from '../../../src/database/connect.ts';
import { runMigrationOperation } from '../../../src/migration/index.ts';
import { describePostgres } from '../../utils/database.ts';
import { DatabaseOptionsError, DatabaseUnavailableError } from '../../../src/error/index.ts';
import { SCRATCH_MARKER } from '../../../src/migration/constants.ts';
import {
    createTestDatabase,
    databaseExists,
    dropTestDatabase,
    notesDescriptor,
    openPlain,
    postgresUrl,
    recordedInput,
    tablesOf,
} from '../../utils/migration.ts';

type TypeormExtension = typeof typeormExtension;

type Connect = typeof connect;

type Step = {
    step: string;
    database: unknown;
    url: unknown
};

const steps = vi.hoisted((): Step[] => []);

/** Runs once right after the guard found no database: a database appearing under the name meanwhile. */
const race = vi.hoisted(() => ({ afterGuard: undefined as (() => Promise<void>) | undefined }));

/**
 * `beforeMaintenance` runs once before a connection to the maintenance
 * database opens; `failMarker` makes the `COMMENT ON DATABASE` after the
 * create fail. `statements` records what a maintenance connection sends.
 */
const hooks = vi.hoisted(() => ({
    beforeMaintenance: undefined as (() => Promise<void>) | undefined,
    failMarker: false,
    statements: [] as string[],
}));

function record(step: string, options: Record<string, unknown>): void {
    steps.push({
        step,
        database: options.database,
        url: options.url,
    });
}

// record what each step is handed, then run the real step
vi.mock('typeorm-extension', async (importOriginal) => {
    const actual = await importOriginal<TypeormExtension>();

    return {
        ...actual,
        createDatabase: async (context: { options: Record<string, unknown> }) => {
            record('create', context.options);

            return actual.createDatabase(context as never);
        },
        dropDatabase: async (context: { options: Record<string, unknown> }) => {
            record('drop', context.options);

            return actual.dropDatabase(context as never);
        },
    };
});

vi.mock('../../../src/database/connect.ts', async (importOriginal) => {
    const actual = await importOriginal<Connect>();

    return {
        ...actual,
        connectDatabase: async (options: Record<string, unknown>, queue?: object) => {
            record('connect', options);

            if (options.database === 'postgres') {
                const { beforeMaintenance } = hooks;

                hooks.beforeMaintenance = undefined;
                await beforeMaintenance?.();
            }

            try {
                const dataSource = await actual.connectDatabase(options as never, queue);
                const query = dataSource.query.bind(dataSource);

                dataSource.query = (async (sql: string, parameters?: unknown[]) => {
                    if (options.database === 'postgres') {
                        hooks.statements.push(sql);
                    }

                    if (hooks.failMarker && sql.startsWith('COMMENT ON DATABASE')) {
                        throw Object.assign(new Error('the marker could not be written'), { code: '42501' });
                    }

                    return query(sql, parameters);
                }) as typeof dataSource.query;

                return dataSource;
            } catch (error) {
                const { afterGuard } = race;

                race.afterGuard = undefined;
                await afterGuard?.();

                throw error;
            }
        },
    };
});

describePostgres('generate and its scratch database', () => {
    it('the guard, the drop, the create, every connect and the last drop name one database, never through a URL', async () => {
        const scratch = `chamvi_steps_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
        const directory = await mkdtemp(path.join(tmpdir(), 'chamvi-steps-'));

        try {
            steps.length = 0;

            const input = recordedInput({
                operation: 'generate',
                descriptors: [notesDescriptor({ migrationsDirectory: directory })],
                name: 'Init',
                scratchUrl: postgresUrl(scratch, { rest: `/${scratch}?sslmode=disable&application_name=chamvi` }),
            });

            expect(await runMigrationOperation(input)).toBe(0);
            // no database there: nothing is dropped before the create
            expect(steps.map((step) => step.step)).toEqual(['connect', 'create', 'connect', 'connect', 'drop']);
            expect(steps.map((step) => step.database)).toEqual(steps.map(() => scratch));
            expect(steps.map((step) => step.url)).toEqual(steps.map(() => undefined));
            expect(await databaseExists(scratch)).toBe(false);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('a marked leftover is dropped before the create, by the same name', async () => {
        const scratch = await createTestDatabase('chamvi_leftover');
        const directory = await mkdtemp(path.join(tmpdir(), 'chamvi-steps-'));
        const dataSource = await openPlain(scratch);

        try {
            await dataSource.query(`COMMENT ON DATABASE "${scratch}" IS '${SCRATCH_MARKER}'`);
        } finally {
            await dataSource.destroy();
        }

        try {
            steps.length = 0;

            const input = recordedInput({
                operation: 'generate',
                descriptors: [notesDescriptor({ migrationsDirectory: directory })],
                name: 'Init',
                scratchUrl: postgresUrl(scratch),
            });

            hooks.statements.length = 0;

            expect(await runMigrationOperation(input)).toBe(0);
            // the leftover is dropped on a maintenance connection, which reads the marker right before
            expect(steps.map((step) => step.step)).toEqual(['connect', 'connect', 'create', 'connect', 'connect', 'drop']);
            expect(steps.map((step) => step.database)).toEqual([scratch, 'postgres', scratch, scratch, scratch, scratch]);
            expect(hooks.statements).toHaveLength(2);
            expect(hooks.statements[0]).toContain('pg_database');
            expect(hooks.statements[1]).toBe(`DROP DATABASE IF EXISTS "${scratch}"`);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('a database that appears under the name after the guard found none is never dropped', async () => {
        const scratch = `chamvi_race_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
        const directory = await mkdtemp(path.join(tmpdir(), 'chamvi-steps-'));

        race.afterGuard = async () => {
            const admin = await openPlain('postgres');

            try {
                await admin.query(`CREATE DATABASE "${scratch}"`);
            } finally {
                await admin.destroy();
            }

            const appeared = await openPlain(scratch);

            try {
                await appeared.query('CREATE TABLE "precious" ("id" int)');
            } finally {
                await appeared.destroy();
            }
        };

        try {
            const input = recordedInput({
                operation: 'generate',
                descriptors: [notesDescriptor({ migrationsDirectory: directory })],
                name: 'Init',
                scratchUrl: postgresUrl(scratch),
            });

            await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseUnavailableError);
            expect(await tablesOf(scratch)).toEqual(['precious']);
        } finally {
            race.afterGuard = undefined;
            await dropTestDatabase(scratch);
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('a leftover whose marker is gone by the drop is refused and kept', async () => {
        const scratch = await createTestDatabase('chamvi_unmarked');
        const directory = await mkdtemp(path.join(tmpdir(), 'chamvi-steps-'));
        const dataSource = await openPlain(scratch);

        try {
            await dataSource.query(`COMMENT ON DATABASE "${scratch}" IS '${SCRATCH_MARKER}'`);
        } finally {
            await dataSource.destroy();
        }

        // between the guard and the drop someone claims the database (the comment goes)
        hooks.beforeMaintenance = async () => {
            const admin = await openPlain('postgres');

            try {
                await admin.query(`COMMENT ON DATABASE "${scratch}" IS NULL`);
            } finally {
                await admin.destroy();
            }
        };

        try {
            const input = recordedInput({
                operation: 'generate',
                descriptors: [notesDescriptor({ migrationsDirectory: directory })],
                name: 'Init',
                scratchUrl: postgresUrl(scratch),
            });

            await expect(runMigrationOperation(input)).rejects.toThrow(DatabaseOptionsError);
            expect(await databaseExists(scratch)).toBe(true);
        } finally {
            hooks.beforeMaintenance = undefined;
            await dropTestDatabase(scratch);
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('a failure between the create and the marker drops the database this run created, so the next run is not refused', async () => {
        const scratch = `chamvi_nomark_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
        const directory = await mkdtemp(path.join(tmpdir(), 'chamvi-steps-'));
        const input = () => recordedInput({
            operation: 'generate',
            descriptors: [notesDescriptor({ migrationsDirectory: directory })],
            name: 'Init',
            scratchUrl: postgresUrl(scratch),
        });

        hooks.failMarker = true;

        try {
            await expect(runMigrationOperation(input())).rejects.toThrow(DatabaseUnavailableError);
            expect(await databaseExists(scratch)).toBe(false);

            hooks.failMarker = false;

            expect(await runMigrationOperation(input())).toBe(0);
            expect(await databaseExists(scratch)).toBe(false);
        } finally {
            hooks.failMarker = false;
            await dropTestDatabase(scratch);
            await rm(directory, { recursive: true, force: true });
        }
    });
});
