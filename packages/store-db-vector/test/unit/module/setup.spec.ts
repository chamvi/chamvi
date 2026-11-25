/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { configModule, createApp, createLogger } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import * as storeDb from '@chamvi/store-db';
import { DataSource } from 'typeorm';
import {
    afterEach,
    expect,
    it,
    vi,
} from 'vitest';
import { vectorStoreModule } from '@chamvi/store-db-vector';
import { createTestDatabase, describePostgres, postgres } from '../../utils/database.ts';

/** What the next pending-migrations read throws, when set. */
const pending = vi.hoisted(() => ({ error: undefined as unknown }));

// the read the vector store runs after the database module's setup: a fake failure, the rest is the real store-db
vi.mock('@chamvi/store-db', async (importOriginal) => {
    const original = await importOriginal<typeof storeDb>();

    return {
        ...original,
        pendingDatabaseMigrations: async (dataSource: DataSource) => {
            if (pending.error !== undefined) {
                throw pending.error;
            }

            return original.pendingDatabaseMigrations(dataSource);
        },
    };
});

const dataSources: DataSource[] = [];

afterEach(async () => {
    pending.error = undefined;
    await Promise.all(dataSources.splice(0).map((dataSource) => dataSource.destroy()));
});

/** The sessions open on `database`, other than the asking one. */
async function sessionsOn(database: string): Promise<number> {
    const admin = new DataSource({
        type: 'postgres',
        ...postgres!,
        database: 'postgres',
    });

    await admin.initialize();
    dataSources.push(admin);

    const [row] = await admin.query(
        'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [database],
    ) as Array<{ count: number }>;

    return row!.count;
}

describePostgres('vectorStoreModule() setup on PostgreSQL', () => {
    it('a failure after the database module\'s setup closes the data source and is mapped as the base maps it', async () => {
        const {
            username,
            password,
            host,
            port,
        } = postgres!;
        const database = await createTestDatabase();
        const app = createApp({
            agents: [],
            modules: [
                configModule({ logger: createLogger({ level: 'error', write: () => {} }) }),
                memoryStoreModule(),
                vectorStoreModule({ url: `postgres://${username}:${password}@${host}:${port}/${database}` }),
            ],
        });

        pending.error = new storeDb.DatabaseOptionsError('the pending read failed');

        // with migrate on the base check counts nothing: the vector store's own read is the first
        const error = await app.check({ env: { MIGRATE: 'true' } }).then(() => undefined, (e: unknown) => e);

        await expect.poll(() => sessionsOn(database)).toBe(0);
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toBe('The database "vector": the pending read failed');
    });
});
