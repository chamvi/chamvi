/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DataSource } from 'typeorm';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import { afterEach, expect, it } from 'vitest';
import { LeaseLostError } from '@chamvi/core';
import type { Connection } from '@chamvi/core';
import {
    STORE_MIGRATIONS,
    createDatabaseStore,
    migrateStore,
    pendingMigrations,
} from '@chamvi/store-db';
import { ControllableClock } from '@chamvi/test-kit';
import { TableName } from '../../../src/entities/constants.ts';
import { ConnectionEntryEntity } from '../../../src/entities/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import { seedRun } from '../../utils/conversation.ts';

const CONNECTIONS = 'Connections1792886400000';

const connection = (name: string): Connection => ({
    name,
    type: 'whatsapp',
    keyId: 'k1',
    wrappedKey: new Uint8Array([1, 2, 3]),
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
});

describePostgres('connections in postgres', () => {
    const dataSources: DataSource[] = [];

    const create = async (migrate = true) => {
        const ds = await createTestDataSource({ migrate });

        dataSources.push(ds);

        return ds;
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('the migration upgrades a v0.7.3 store with data, reverts and reapplies', async () => {
        const ds = await create(false);
        const prior = new DataSource({
            ...ds.options,
            migrations: STORE_MIGRATIONS.filter((migration) => migration.name !== CONNECTIONS),
        });

        await prior.initialize();
        dataSources.push(prior);
        await migrateStore(prior);
        await seedRun(ds, 'kept');
        expect(await pendingMigrations(ds)).toEqual([CONNECTIONS]);

        await migrateStore(ds);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();

        const store = createDatabaseStore({ dataSource: ds });

        expect(await store.runs.findOne('kept')).toMatchObject({ id: 'kept' });
        await store.connections.insert(connection('wa'));
        await ds.undoLastMigration({ transaction: 'each' });

        const runner = ds.createQueryRunner();

        try {
            expect(await runner.hasTable(TableName.CONNECTIONS)).toBe(false);
            expect(await runner.hasTable(TableName.CONNECTION_ENTRIES)).toBe(false);
        } finally {
            await runner.release();
        }

        expect(await store.runs.findOne('kept')).toMatchObject({ id: 'kept' });
        await migrateStore(ds);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
        expect(await store.connections.find()).toEqual([]);
    });

    it('entries reference their connection: orphans are refused, a delete cascades, the relation loads', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const store = createDatabaseStore({ dataSource: ds, clock });

        await store.connections.insert(connection('wa'));
        await store.locks.acquire('connection:wa', 'o1', 60_000);
        await store.connections.writeEntries('wa', { set: { a: new Uint8Array([7]) } }, { lock: 'connection:wa', owner: 'o1' });

        const entry = await ds.getRepository(ConnectionEntryEntity).findOneOrFail({
            where: { connectionName: 'wa', key: 'a' },
            relations: { connection: true },
        });

        expect(entry.connection?.name).toBe('wa');
        expect(entry.connection?.type).toBe('whatsapp');
        await expect(ds.query(
            `INSERT INTO "${TableName.CONNECTION_ENTRIES}" (connection_name, key, value) VALUES ($1, $2, $3)`,
            ['missing', 'a', Buffer.from([1])],
        )).rejects.toMatchObject({ driverError: { code: '23503' } });

        await store.connections.delete('wa');
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_ENTRIES}"`)).toEqual([]);
    });

    it('a fence check holds its lease row until the batch commits, so a takeover waits for it', async () => {
        const ds = await create();
        const early = new ControllableClock();
        const late = new ControllableClock(new Date(10_000));
        const writer = createDatabaseStore({ dataSource: ds, clock: early });
        const taker = createDatabaseStore({ dataSource: ds, clock: late });
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await writer.connections.insert(connection('wa'));
        await writer.locks.acquire(fence.lock, fence.owner, 1_000);

        // under the late clock the lease is expired: the takeover and the batch race
        const results = await Promise.allSettled([
            ...Array.from({ length: 10 }, (_, i) => writer.connections.writeEntries(
                'wa',
                { set: { [`k${i}`]: new Uint8Array([i]) } },
                fence,
            )),
            taker.locks.acquire(fence.lock, 'o2', 1_000),
        ]);

        expect(results.at(-1)).toEqual({ status: 'fulfilled', value: true });

        for (const result of results.slice(0, -1)) {
            if (result.status === 'rejected') {
                expect(result.reason).toBeInstanceOf(LeaseLostError);
            }
        }

        // once the takeover committed, the old owner writes nothing more
        await expect(writer.connections.writeEntries('wa', { set: { late: new Uint8Array([1]) } }, fence))
            .rejects.toBeInstanceOf(LeaseLostError);

        const written = results.slice(0, -1).filter((result) => result.status === 'fulfilled').length;
        const rows: { key: string }[] = await ds.query(`SELECT key FROM "${TableName.CONNECTION_ENTRIES}"`);

        expect(rows).toHaveLength(written);
    });
});
