/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterEach, expect, it } from 'vitest';
import { LeaseLostError } from '@chamvi/core';
import type { Connection } from '@chamvi/core';
import { createDatabaseStore } from '@chamvi/store-db';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { TableName } from '../../../src/entities/constants.ts';
import { ConnectionEntity, ConnectionEntryEntity } from '../../../src/entities/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';

const connection = (name: string): Connection => ({
    name,
    type: 'whatsapp',
    keyId: 'k1',
    wrappedKey: new Uint8Array([1, 2, 3]),
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
});

/** Waits (real time, polling Postgres) until a backend of this database waits on a row lock. */
const waitForLockWait = async (ds: DataSource) => {
    for (let i = 0; i < 500; i++) {
        const [row]: { n: number }[] = await ds.query(
            'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = \'Lock\'',
        );

        if (row!.n > 0) {
            return;
        }

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }

    throw new Error('no backend waits on a lock');
};

/** Holds the lease row of `key` FOR UPDATE in another transaction until `release` is called. */
const holdLeaseRow = async (ds: DataSource, key: string) => {
    const runner = ds.createQueryRunner();

    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SELECT 1 FROM "${TableName.LOCKS}" WHERE key = $1 FOR UPDATE`, [key]);

    return async () => {
        await runner.commitTransaction();
        await runner.release();
    };
};

describePostgres('connections in postgres', () => {
    const dataSources: DataSource[] = [];

    const create = async () => {
        const ds = await createTestDataSource();

        dataSources.push(ds);

        return ds;
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('entries reference their connection: orphans are refused, a delete cascades, the relation loads', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const store = createDatabaseStore({ dataSource: ds, clock });

        await store.connections.insert(connection('wa'));
        await store.locks.acquire('connection:wa', 'o1', 60_000);
        await store.connections.writeEntries('wa', { set: { a: new Uint8Array([7]) } }, { lock: 'connection:wa', owner: 'o1' });

        const { id: connectionId } = await ds.getRepository(ConnectionEntity).findOneByOrFail({ name: 'wa' });
        const entry = await ds.getRepository(ConnectionEntryEntity).findOneOrFail({
            where: { connectionId, key: 'a' },
            relations: { connection: true },
        });

        expect(entry.connection?.name).toBe('wa');
        expect(entry.connection?.type).toBe('whatsapp');
        await expect(ds.query(
            `INSERT INTO "${TableName.CONNECTION_ENTRIES}" (id, connection_id, key, value) VALUES ($1, $2, $3, $4)`,
            [testUuid('entry'), testUuid('missing'), 'a', Buffer.from([1])],
        )).rejects.toMatchObject({ driverError: { code: '23503' } });

        await store.connections.delete('wa');
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_ENTRIES}"`)).toEqual([]);
    });

    it('the fence reads the clock after its row locks: a batch blocked past the lease expiry is refused', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const store = createDatabaseStore({ dataSource: ds, clock });
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await store.connections.insert(connection('wa'));
        await store.locks.acquire(fence.lock, fence.owner, 1_000);

        const release = await holdLeaseRow(ds, fence.lock);
        const writing = store.connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);

        // the lease owner is unchanged, only the time passes while the batch waits
        await waitForLockWait(ds);
        clock.advance(1_000);
        await release();
        await expect(writing).rejects.toBeInstanceOf(LeaseLostError);
        expect(await store.connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('replace reads the clock after its row locks: a replace blocked past the lease expiry deletes nothing', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const store = createDatabaseStore({ dataSource: ds, clock });
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await store.connections.insert(connection('wa'));
        await store.locks.acquire(fence.lock, fence.owner, 1_000);
        await store.connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);

        const release = await holdLeaseRow(ds, fence.lock);
        const replacing = store.connections.replace({ ...connection('wa'), type: 'telegram' }, fence);

        await waitForLockWait(ds);
        clock.advance(1_000);
        await release();
        await expect(replacing).rejects.toBeInstanceOf(LeaseLostError);
        expect((await store.connections.findOneOrFail('wa')).type).toBe('whatsapp');
        expect(Array.from((await store.connections.findEntry('wa', 'a'))!)).toEqual([1]);
    });

    it('renew reads the clock after its row lock: a renew blocked past the lease expiry is refused', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const store = createDatabaseStore({ dataSource: ds, clock });

        await store.locks.acquire('connection:wa', 'o1', 1_000);

        const release = await holdLeaseRow(ds, 'connection:wa');
        const renewing = store.locks.renew('connection:wa', 'o1', 1_000);

        await waitForLockWait(ds);
        clock.advance(1_000);
        await release();
        expect(await renewing).toBe(false);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(true);
    });

    it('renew extends an unexpired lease from a fresh reading', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const store = createDatabaseStore({ dataSource: ds, clock });

        await store.locks.acquire('connection:wa', 'o1', 1_000);
        clock.advance(999);
        expect(await store.locks.renew('connection:wa', 'o1', 1_000)).toBe(true);
        expect(await store.locks.renew('connection:wa', 'o2', 1_000)).toBe(false);
        // renewed at 999 until 1999
        clock.advance(999);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(false);
        clock.advance(1);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(true);
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
