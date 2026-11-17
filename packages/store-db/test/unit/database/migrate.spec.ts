/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';
import { afterEach, expect, it } from 'vitest';
import { closeDatabase, migrateDatabase, pendingDatabaseMigrations } from '../../../src/database/index.ts';
import { DatabaseOptionsError } from '../../../src/error/index.ts';
import { describePostgres } from '../../utils/database.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';

type MigrationStep = (queryRunner: QueryRunner) => Promise<void>;

/** A migration class named `name` (TypeORM reads the timestamp from the name's end). */
function migration(name: string, up: MigrationStep): new () => MigrationInterface {
    return class implements MigrationInterface {
        name = name;

        async up(queryRunner: QueryRunner): Promise<void> {
            await up(queryRunner);
        }

        async down(): Promise<void> {
            // never run
        }
    };
}

describePostgres('migrateDatabase', () => {
    let fixture: FixtureDataSource | undefined;

    afterEach(async () => {
        await fixture?.dataSource.destroy();
        fixture = undefined;
    });

    it('two calls at once on one data source run the migration once and leave its up as it was', async () => {
        let runs = 0;

        fixture = await openFixtureDataSource('postgres', {
            migrations: [migration('Notes1795000000001', async (queryRunner) => {
                runs += 1;
                await queryRunner.query('CREATE TABLE "notes" ("name" varchar PRIMARY KEY)');
            })],
        });

        const { dataSource } = fixture;
        const [instance] = dataSource.migrations;
        const { up } = instance!;

        await Promise.all([
            migrateDatabase(dataSource, { lockName: 'fixture' }),
            migrateDatabase(dataSource, { lockName: 'fixture' }),
            migrateDatabase(dataSource, { lockName: 'fixture' }),
        ]);

        expect(runs).toBe(1);
        expect(instance!.up).toBe(up);
        expect(await pendingDatabaseMigrations(dataSource)).toEqual([]);
    });

    it('a call after one that failed still runs', async () => {
        let fail = true;

        fixture = await openFixtureDataSource('postgres', {
            migrations: [migration('Notes1795000000001', async (queryRunner) => {
                await queryRunner.query(fail ? 'SELECT * FROM "no_such_table"' : 'CREATE TABLE "notes" ("name" varchar PRIMARY KEY)');
            })],
        });

        const { dataSource } = fixture;
        const failed = migrateDatabase(dataSource, { lockName: 'fixture' });
        const next = failed.catch(() => {
            fail = false;

            return migrateDatabase(dataSource, { lockName: 'fixture' });
        });

        await expect(failed).rejects.toMatchObject({
            operation: 'migrate',
            driverCode: '42P01',
            subject: 'Notes1795000000001',
        });
        await next;
        expect(await pendingDatabaseMigrations(dataSource)).toEqual([]);
    });

    it('a migration class without a timestamp in its name is a configuration error with TypeORM\'s message', async () => {
        fixture = await openFixtureDataSource('postgres', { migrations: [migration('Misnamed', async () => undefined)] });

        const { dataSource } = fixture;
        const message = 'Misnamed migration name is wrong. Migration class name should have a JavaScript timestamp appended.';

        for (const run of [() => migrateDatabase(dataSource, { lockName: 'fixture' }), () => pendingDatabaseMigrations(dataSource)]) {
            const error = await run().then(() => undefined, (reason: unknown) => reason);

            expect(error).toBeInstanceOf(DatabaseOptionsError);
            expect(error).toMatchObject({ code: 'database_options_invalid', message });
        }

        await closeDatabase(dataSource);
        fixture = undefined;
    });
});
