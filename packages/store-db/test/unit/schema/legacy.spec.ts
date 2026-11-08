/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterEach, expect, it } from 'vitest';
import { migrateStore } from '../../../src/schema/index.ts';
import { assertStoreNotLegacy } from '../../../src/schema/legacy.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';

const MESSAGE = 'This database holds a chamvi schema from an earlier version that cannot be upgraded in place. ' +
    'Start on a new, empty database; see the upgrade guide (/guide/upgrading).';

describePostgres('legacy schema refusal', () => {
    const dataSources: DataSource[] = [];

    const create = async (migrate = false) => {
        const dataSource = await createTestDataSource({ migrate });

        dataSources.push(dataSource);

        return dataSource;
    };

    const snapshot = async (ds: DataSource) => {
        const tables = await ds.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name');
        const hasMigrations = tables.some((row: { table_name: string }) => row.table_name === 'migrations');
        const rows = hasMigrations ? await ds.query('SELECT name FROM migrations ORDER BY name') : [];

        return { tables, rows };
    };

    const recordMigration = async (ds: DataSource, name: string) => {
        await ds.query('CREATE TABLE IF NOT EXISTS "migrations" ("id" SERIAL PRIMARY KEY, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)');
        await ds.query('INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)', [1792195200000, name]);
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('refuses old-schema tables with no rows', async () => {
        const ds = await create();

        await ds.query('CREATE TABLE "chamvi_runs" ("id" varchar PRIMARY KEY)');

        await expect(assertStoreNotLegacy(ds)).rejects.toMatchObject({ code: 'store_legacy_schema', message: MESSAGE });
        await expect(migrateStore(ds)).rejects.toMatchObject({ code: 'store_legacy_schema' });
    });

    it('refuses a recorded pre-baseline migration', async () => {
        for (const name of ['Init1792195200000', 'Conversations1792713600000']) {
            const ds = await create();

             
            await recordMigration(ds, name);

             
            await expect(migrateStore(ds)).rejects.toMatchObject({ code: 'store_legacy_schema' });
        }
    });

    it('the refusal changes nothing', async () => {
        const ds = await create();

        await ds.query('CREATE TABLE "chamvi_runs" ("id" varchar PRIMARY KEY)');
        await recordMigration(ds, 'Init1792195200000');

        const before = await snapshot(ds);

        await expect(migrateStore(ds)).rejects.toMatchObject({ code: 'store_legacy_schema' });
        expect(await snapshot(ds)).toEqual(before);
    });

    it('accepts an empty database and creates nothing', async () => {
        const ds = await create();

        await expect(assertStoreNotLegacy(ds)).resolves.toBeUndefined();
        expect((await snapshot(ds)).tables).toEqual([]);
    });

    it('accepts a host app\'s unrelated tables and migrations rows', async () => {
        const ds = await create();

        await ds.query('CREATE TABLE "app_users" ("id" serial PRIMARY KEY)');
        await recordMigration(ds, 'CreateUsers1700000000000');

        await expect(assertStoreNotLegacy(ds)).resolves.toBeUndefined();
        await expect(migrateStore(ds)).resolves.toBeUndefined();
    });

    it('accepts a database with the baseline applied', async () => {
        const ds = await create(true);

        await expect(assertStoreNotLegacy(ds)).resolves.toBeUndefined();
        await expect(migrateStore(ds)).resolves.toBeUndefined();
    });
});
