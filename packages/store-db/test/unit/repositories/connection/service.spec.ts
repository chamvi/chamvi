/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterEach, expect, it } from 'vitest';
import type { IClock, ILockService } from '@chamvi/core';
import { 
    ConnectionChangedError, 
    ConnectionService, 
    LeaseLostError, 
    LockService, 
    RepositoryNotFoundError, 
    ValidationError,
} from '@chamvi/core';
import type { ConnectionInput } from '@chamvi/store';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { DatabaseConnectionRepository } from '../../../../src/repositories/connection/index.ts';
import { TableName } from '../../../../src/entities/constants.ts';
import { ConnectionEntity, ConnectionEntryEntity, ConnectionSecretEntity } from '../../../../src/entities/index.ts';
import { DatabaseLockRepository } from '../../../../src/repositories/lock/index.ts';
import { createTestDataSource, describePostgres, untilLockWait } from '../../../utils/database.ts';

const connection = (name: string): ConnectionInput => ({
    name,
    type: 'whatsapp',
    keyId: 'k1',
    wrappedKey: new Uint8Array([1, 2, 3]),
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
});

/** The connection service and a lock service on the same data source and clock. */
const servicesOf = (ds: DataSource, clock: IClock) => ({
    connections: new ConnectionService({ repository: new DatabaseConnectionRepository(ds), clock }),
    lockService: new LockService({ repository: new DatabaseLockRepository(ds), clock }),
});

/** The statements a data source sends while `recording`. */
function recordStatements(dataSource: DataSource) {
    const log = { recording: false, statements: [] as string[] };

    (dataSource as unknown as { logger: object }).logger = {
        logQuery: (query: string) => {
            if (log.recording) {
                log.statements.push(query.trim());
            }
        },
        logQueryError: () => undefined,
        logQuerySlow: () => undefined,
        logSchemaBuild: () => undefined,
        logMigration: () => undefined,
        log: () => undefined,
    };

    return log;
}

/** Holds a row FOR UPDATE in another transaction until `release` is called. */
const holdRow = async (ds: DataSource, table: string, column: string, value: string) => {
    const runner = ds.createQueryRunner();

    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SELECT 1 FROM "${table}" WHERE ${column} = $1 FOR UPDATE`, [value]);

    return async () => {
        await runner.commitTransaction();
        await runner.release();
    };
};

const holdConnectionRow = (ds: DataSource, name: string) => holdRow(ds, TableName.CONNECTIONS, 'name', name);

const holdLeaseRow = (ds: DataSource, key: string) => holdRow(ds, TableName.LOCKS, 'key', key);

describePostgres('connection service in postgres', () => {
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

    it('entries reference their connection: orphans are refused, a delete removes them, the relation loads', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());

        await connections.create(connection('wa'));
        await lockService.acquire('connection:wa', 'o1', 60_000);
        await connections.writeEntries('wa', { set: { a: new Uint8Array([7]) } }, { lock: 'connection:wa', owner: 'o1' });

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

        await connections.delete('wa');
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_ENTRIES}"`)).toEqual([]);
    });

    it('secrets reference their connection: orphans and duplicates are refused, a delete removes them, the relation loads', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());
        const stored = connection('wa');

        await connections.create(stored);
        await connections.writeConfig('wa', { setSecrets: { s: new Uint8Array([7]) } }, { wrappedKey: stored.wrappedKey });

        const { id: connectionId } = await ds.getRepository(ConnectionEntity).findOneByOrFail({ name: 'wa' });
        const secret = await ds.getRepository(ConnectionSecretEntity).findOneOrFail({
            where: { connectionId, name: 's' },
            relations: { connection: true },
        });

        expect(secret.connection?.name).toBe('wa');

        const insertSecret = `INSERT INTO "${TableName.CONNECTION_SECRETS}" (id, connection_id, name, value) VALUES ($1, $2, $3, $4)`;

        await expect(ds.query(insertSecret, [testUuid('orphan'), testUuid('missing'), 's', Buffer.from([1])]))
            .rejects.toMatchObject({ driverError: { code: '23503' } });
        await expect(ds.query(insertSecret, [testUuid('duplicate'), connectionId, 's', Buffer.from([1])]))
            .rejects.toMatchObject({ driverError: { code: '23505' } });

        await connections.delete('wa');
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_SECRETS}"`)).toEqual([]);
    });

    it('a config save queued behind a replace is refused as changed, never written under the dead key', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };
        const stored = connection('wa');

        await connections.create(stored);
        await lockService.acquire(fence.lock, fence.owner, 60_000);
        await connections.writeConfig('wa', { settings: { a: 1 } }, { wrappedKey: stored.wrappedKey });

        const release = await holdConnectionRow(ds, 'wa');
        const replacement = { ...stored, wrappedKey: new Uint8Array([9]) };
        const replacing = connections.replace(replacement, fence);

        await untilLockWait(ds);

        const saving = connections.writeConfig('wa', { setSecrets: { s: new Uint8Array([7]) } }, { wrappedKey: stored.wrappedKey });

        await untilLockWait(ds, 2);
        await release();
        await replacing;
        await expect(saving).rejects.toBeInstanceOf(ConnectionChangedError);
        expect(await connections.findConfig('wa')).toEqual({
            keyId: replacement.keyId,
            wrappedKey: replacement.wrappedKey,
            settings: { a: 1 },
            secrets: new Map(),
            revision: 2,
            generation: expect.any(String),
        });
    });

    it('a replace keeps the connection row, so a secret saved before it is gone and the entries with it', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };
        const stored = connection('wa');

        await connections.create(stored);
        await lockService.acquire(fence.lock, fence.owner, 60_000);
        await connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);
        await connections.writeConfig('wa', { setSecrets: { s: new Uint8Array([7]) } }, { wrappedKey: stored.wrappedKey });

        const { id } = await ds.getRepository(ConnectionEntity).findOneByOrFail({ name: 'wa' });

        await connections.replace({ ...stored, wrappedKey: new Uint8Array([9]) }, fence);
        expect((await ds.getRepository(ConnectionEntity).findOneByOrFail({ name: 'wa' })).id).toBe(id);
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_SECRETS}"`)).toEqual([]);
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_ENTRIES}"`)).toEqual([]);
    });

    it('a replace that finds no row retries in place when a concurrent create takes the name first', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };
        const stored = connection('wa');
        const replacement = {
            ...stored,
            keyId: 'k2',
            wrappedKey: new Uint8Array([9]),
        };

        await lockService.acquire(fence.lock, fence.owner, 60_000);

        // the replace finds no row, then waits on the lease row; the create lands meanwhile
        const release = await holdLeaseRow(ds, fence.lock);
        const replacing = connections.replace(replacement, fence);

        await untilLockWait(ds);
        expect(await connections.create(stored)).toBe(true);

        const { id } = await ds.getRepository(ConnectionEntity).findOneByOrFail({ name: 'wa' });

        await release();
        await replacing;

        const row = await ds.getRepository(ConnectionEntity).findOneByOrFail({ name: 'wa' });

        expect(row.id).toBe(id);
        expect(row.keyId).toBe('k2');
        expect(await connections.findOneOrFail('wa')).toEqual({ ...replacement, id });
    });

    it('concurrent config writes each get their own revision', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());
        const stored = connection('wa');

        await connections.create(stored);

        const revisions = await Promise.all(Array.from({ length: 10 }, (_, i) => connections.writeConfig(
            'wa',
            { setSecrets: { [`s${i}`]: new Uint8Array([i]) } },
            { wrappedKey: stored.wrappedKey },
        )));

        expect([...revisions].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));

        const config = (await connections.findConfig('wa'))!;

        expect(config.revision).toBe(10);
        expect(config.secrets.size).toBe(10);
    });

    it('two rows created in the same millisecond have different uuid v7 ids', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());

        await connections.create(connection('a'));
        await connections.create(connection('b'));

        const [a, b] = await connections.find();

        expect(a!.createdAt).toEqual(b!.createdAt);
        expect(a!.id).not.toBe(b!.id);
        expect(a!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('a delete and create under one name with equal revisions refuses a save expecting the old generation', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());
        const key = connection('wa').wrappedKey;

        await connections.create(connection('wa'));
        await connections.writeConfig('wa', { settings: { host: 'a' } }, { wrappedKey: key });

        const first = (await connections.findConfig('wa'))!;

        await connections.delete('wa');
        await connections.create(connection('wa'));
        await connections.writeConfig('wa', { settings: { host: 'b' } }, { wrappedKey: key });

        const second = (await connections.findConfig('wa'))!;

        expect(second.revision).toBe(first.revision);
        expect(second.generation).not.toBe(first.generation);
        await expect(connections.writeConfig('wa', { settings: { host: 'c' } }, {
            wrappedKey: key,
            revision: first.revision,
            generation: first.generation,
        })).rejects.toThrow(new ConnectionChangedError('wa'));
        expect(await connections.findConfig('wa')).toMatchObject({ settings: { host: 'b' }, revision: 1 });
    });

    it('a save after a replace with the revision read before it is refused', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };
        const stored = connection('wa');

        await connections.create(stored);
        await connections.writeConfig('wa', { settings: { a: 1 } }, { wrappedKey: stored.wrappedKey });

        const before = (await connections.findConfig('wa'))!;
        const replacement = {
            ...stored, 
            wrappedKey: new Uint8Array([9]), 
            createdAt: new Date(2_000), 
        };

        await lockService.acquire(fence.lock, fence.owner, 60_000);
        await connections.replace(replacement, fence);

        const after = await connections.findOneOrFail('wa');

        expect(after.id).toBe(before.generation);
        expect(after.createdAt).toEqual(stored.createdAt);
        await expect(connections.writeConfig('wa', { settings: { a: 2 } }, {
            wrappedKey: replacement.wrappedKey,
            revision: before.revision,
            generation: before.generation,
        })).rejects.toThrow(new ConnectionChangedError('wa'));
        expect(await connections.findConfig('wa')).toMatchObject({ settings: { a: 1 }, revision: before.revision + 1 });
    });

    it('refuses an unstorable settings value with ValidationError, naming no value, and writes nothing', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());
        const key = connection('wa').wrappedKey;

        await connections.create(connection('wa'));

        const refused: Record<string, unknown>[] = [
            { a: 'x\0secret-nul' },
            { a: 'secret\ud800' },
            { a: undefined },
            { a: new Date(0) },
            { a: () => 1 },
            { a: { b: 1 } },
            { a: null },
            { a: NaN },
            { a: Infinity },
            { a: ['ok', 1] },
            { a: ['secret\0'] },
            { 'k\0': 'v' },
            Object.assign(Object.create({ inherited: 1 }), { a: 'x' }),
        ];

        for (const settings of refused) {
            const refusal = connections.writeConfig('wa', { settings }, { wrappedKey: key });

            await expect(refusal).rejects.toBeInstanceOf(ValidationError);
            await expect(refusal).rejects.not.toThrow(/secret/);
        }

        expect(await connections.findConfig('wa')).toMatchObject({ settings: {}, revision: 0 });

        const accepted = {
            s: 'x',
            n: 1.5,
            b: false,
            l: ['a', 'b'],
            empty: [],
        };

        expect(await connections.writeConfig('wa', { settings: accepted }, { wrappedKey: key })).toBe(1);
        expect((await connections.findConfig('wa'))!.settings).toEqual(accepted);
    });

    it('a stale wrappedKey or revision is ConnectionChangedError and writes nothing', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const { connections } = servicesOf(ds, clock);
        const stored = connection('wa');

        await connections.create(stored);
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: new Uint8Array([7]) } }, { wrappedKey: stored.wrappedKey });

        const before = await connections.findOneOrFail('wa');

        clock.advance(10);

        for (const [key, revision] of [[new Uint8Array([9]), undefined], [stored.wrappedKey, 0], [stored.wrappedKey, 2]] as const) {
            await expect(connections.writeConfig('wa', {
                settings: { a: 2 },
                setSecrets: { s: new Uint8Array([8]), t: new Uint8Array([9]) },
                clearSecrets: ['s'],
            }, { wrappedKey: key, revision })).rejects.toThrow(new ConnectionChangedError('wa'));
        }

        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: stored.wrappedKey,
            settings: { a: 1 },
            secrets: new Map([['s', new Uint8Array([7])]]),
            revision: 1,
            generation: expect.any(String),
        });
        expect(await connections.findOneOrFail('wa')).toEqual(before);
    });

    it('findConfig sees one consistent revision', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const repository = new DatabaseConnectionRepository(ds);
        const connections = new ConnectionService({ repository, clock });
        const stored = connection('wa');

        await connections.create(stored);
        await connections.writeConfig('wa', { settings: { v: 1 }, setSecrets: { s: new Uint8Array([1]) } }, { wrappedKey: stored.wrappedKey });

        // a config write lands between the read of the row and the read of its secrets, three times over
        const { findManyBy } = repository.secrets;
        let raced = 0;

        repository.secrets.findManyBy = async function racing(this: unknown, where) {
            if (raced < 3) {
                raced += 1;
                await connections.writeConfig('wa', {
                    settings: { v: raced + 1 },
                    setSecrets: { s: new Uint8Array([raced + 1]) },
                }, { wrappedKey: stored.wrappedKey });
            }

            return Reflect.apply(findManyBy, this, [where]);
        };

        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: stored.wrappedKey,
            settings: { v: 4 },
            secrets: new Map([['s', new Uint8Array([4])]]),
            revision: 4,
            generation: expect.any(String),
        });
        expect(raced).toBe(3);
    });

    it('findConfig does not wait for a fenced entry batch in flight', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());
        const stored = connection('wa');

        await connections.create(stored);
        await connections.writeConfig('wa', { settings: { v: 1 } }, { wrappedKey: stored.wrappedKey });

        // a batch holds the connection row FOR UPDATE until it commits
        const release = await holdConnectionRow(ds, 'wa');

        expect(await connections.findConfig('wa')).toMatchObject({ settings: { v: 1 }, revision: 1 });
        await release();
    });

    it('of eight concurrent config writes expecting revision 0 exactly one lands, the others are ConnectionChangedError', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());
        const stored = connection('wa');

        await connections.create(stored);

        const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => connections.writeConfig(
            'wa',
            { setSecrets: { [`s${i}`]: new Uint8Array([i]) } },
            { wrappedKey: stored.wrappedKey, revision: 0 },
        )));

        expect(results.filter((result) => result.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: 1 }]);

        for (const result of results.filter((item) => item.status === 'rejected')) {
            expect(result.reason).toBeInstanceOf(ConnectionChangedError);
        }

        const config = (await connections.findConfig('wa'))!;

        expect(config.revision).toBe(1);
        expect(config.secrets.size).toBe(1);
    });

    it('an entry call on an absent connection is RepositoryNotFoundError, also with a fence naming another lock', async () => {
        const ds = await create();
        const { connections } = servicesOf(ds, new ControllableClock());

        await expect(connections.writeEntries('missing', { set: { a: new Uint8Array([1]) } }, { lock: 'connection:other', owner: 'o1' }))
            .rejects.toBeInstanceOf(RepositoryNotFoundError);
        await expect(connections.findEntries('missing', ['a'])).rejects.toBeInstanceOf(RepositoryNotFoundError);
    });

    it('the schema cascades: removing a connection row through the repository removes its entries and secrets', async () => {
        const ds = await create();
        const repository = new DatabaseConnectionRepository(ds);
        const { id } = await repository.save(repository.create({
            ...connection('wa'),
            id: testUuid('wa'),
            settings: {},
            configRevision: 0,
        }));

        await repository.entries.upsertMany([{
            id: testUuid('e1'),
            connectionId: id,
            key: 'a',
            value: new Uint8Array([1]),
        }]);
        await repository.secrets.upsertMany([{
            id: testUuid('s1'),
            connectionId: id,
            name: 's',
            value: new Uint8Array([1]),
        }]);
        expect(await repository.removeManyBy({ id })).toBe(1);
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_ENTRIES}"`)).toEqual([]);
        expect(await ds.query(`SELECT * FROM "${TableName.CONNECTION_SECRETS}"`)).toEqual([]);
    });

    it('an entry batch of 812 keys is one upsert statement: six statements in all', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await connections.create(connection('wa'));
        await lockService.acquire(fence.lock, fence.owner, 60_000);

        const log = recordStatements(ds);
        const set = Object.fromEntries(Array.from({ length: 812 }, (_, i) => [`pre-key:${i}`, new Uint8Array([i % 256])]));

        log.recording = true;
        await connections.writeEntries('wa', { set }, fence);
        log.recording = false;

        // BEGIN, the connection row, the lease row, one upsert, the updated_at, COMMIT
        expect(log.statements).toHaveLength(6);
        expect(log.statements.filter((statement) => statement.startsWith('INSERT'))).toHaveLength(1);
        expect((await connections.findEntries('wa', Object.keys(set))).size).toBe(812);
    });

    it('a connection with 70,000 entries is cleared, replaced and deleted', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };
        const set = Object.fromEntries(Array.from({ length: 70_000 }, (_, i) => [`k${i}`, new Uint8Array([i % 256])]));
        const count = async () => Number((await ds.query(`SELECT count(*)::int AS n FROM "${TableName.CONNECTION_ENTRIES}"`))[0].n);

        await connections.create(connection('wa'));
        await lockService.acquire(fence.lock, fence.owner, 60_000);

        await connections.writeEntries('wa', { set }, fence);
        expect(await count()).toBe(70_000);
        await connections.writeEntries('wa', { clear: true }, fence);
        expect(await count()).toBe(0);

        await connections.writeEntries('wa', { set }, fence);
        await connections.writeEntries('wa', { delete: Object.keys(set) }, fence);
        expect(await count()).toBe(0);

        await connections.writeEntries('wa', { set }, fence);
        await connections.replace({ ...connection('wa'), keyId: 'k2' }, fence);
        expect(await count()).toBe(0);
        expect((await connections.findOneOrFail('wa')).keyId).toBe('k2');

        await connections.writeEntries('wa', { set }, fence);
        await connections.delete('wa', fence);
        expect(await count()).toBe(0);
        expect(await connections.findOne('wa')).toBeUndefined();
    }, 300_000);

    it.each([
        ['released', async (ctx: { clock: ControllableClock; lockService: ILockService }) => {
            await ctx.lockService.release('connection:wa', 'o1');
        }],
        ['expired', async (ctx: { clock: ControllableClock; lockService: ILockService }) => {
            ctx.clock.advance(1_000);
        }],
        ['taken over by another owner', async (ctx: { clock: ControllableClock; lockService: ILockService }) => {
            ctx.clock.advance(1_000);
            expect(await ctx.lockService.acquire('connection:wa', 'o2', 60_000)).toBe(true);
        }],
    ])('a fence %s while the fenced write waits for the connection row refuses every fenced write and writes nothing', async (_, change) => {
        const ds = await create();
        const clock = new ControllableClock();
        const { connections, lockService } = servicesOf(ds, clock);
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await connections.create(connection('wa'));
        await lockService.acquire(fence.lock, fence.owner, 1_000);
        await connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);

        const before = await connections.findOneOrFail('wa');
        const release = await holdConnectionRow(ds, 'wa');
        const settled = Promise.allSettled([
            connections.writeEntries('wa', { clear: true, set: { b: new Uint8Array([2]) } }, fence),
            connections.replace({ ...connection('wa'), keyId: 'k2' }, fence),
            connections.delete('wa', fence),
        ]);

        await untilLockWait(ds, 3);
        await change({ clock, lockService });
        await release();

        for (const result of await settled) {
            expect(result).toMatchObject({ status: 'rejected', reason: new LeaseLostError({ lock: 'connection:wa' }) });
        }

        expect(await connections.findOneOrFail('wa')).toEqual(before);
        expect(Object.fromEntries([...await connections.findEntries('wa', ['a', 'b'])].map(([key, value]) => [key, Array.from(value)])))
            .toEqual({ a: [1] });
    });

    it('a fenced write waits for a release of its lease in flight and is refused once it committed', async () => {
        const ds = await create();
        const { connections, lockService } = servicesOf(ds, new ControllableClock());
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await connections.create(connection('wa'));
        await lockService.acquire(fence.lock, fence.owner, 60_000);

        // the lock service's release in flight: the lease read locked, then removed
        const runner = ds.createQueryRunner();

        await runner.connect();
        await runner.startTransaction();
        await runner.query(`SELECT 1 FROM "${TableName.LOCKS}" WHERE key = $1 FOR UPDATE`, [fence.lock]);

        const writing = connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);

        await untilLockWait(ds);
        await runner.query(`DELETE FROM "${TableName.LOCKS}" WHERE key = $1`, [fence.lock]);
        await runner.commitTransaction();
        await runner.release();
        await expect(writing).rejects.toBeInstanceOf(LeaseLostError);
        expect(await connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('the fence reads the clock after its row locks: a batch blocked past the lease expiry is refused', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const { connections, lockService } = servicesOf(ds, clock);
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await connections.create(connection('wa'));
        await lockService.acquire(fence.lock, fence.owner, 1_000);

        const release = await holdLeaseRow(ds, fence.lock);
        const writing = connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);

        // the lease owner is unchanged, only the time passes while the batch waits
        await untilLockWait(ds);
        clock.advance(1_000);
        await release();
        await expect(writing).rejects.toBeInstanceOf(LeaseLostError);
        expect(await connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('replace reads the clock after its row locks: a replace blocked past the lease expiry deletes nothing', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const { connections, lockService } = servicesOf(ds, clock);
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await connections.create(connection('wa'));
        await lockService.acquire(fence.lock, fence.owner, 1_000);
        await connections.writeEntries('wa', { set: { a: new Uint8Array([1]) } }, fence);

        const release = await holdLeaseRow(ds, fence.lock);
        const replacing = connections.replace({ ...connection('wa'), type: 'telegram' }, fence);

        await untilLockWait(ds);
        clock.advance(1_000);
        await release();
        await expect(replacing).rejects.toBeInstanceOf(LeaseLostError);
        expect((await connections.findOneOrFail('wa')).type).toBe('whatsapp');
        expect(Array.from((await connections.findEntry('wa', 'a'))!)).toEqual([1]);
    });

    it('renew reads the clock after its row lock: a renew blocked past the lease expiry is refused', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const { lockService } = servicesOf(ds, clock);

        await lockService.acquire('connection:wa', 'o1', 1_000);

        const release = await holdLeaseRow(ds, 'connection:wa');
        const renewing = lockService.renew('connection:wa', 'o1', 1_000);

        await untilLockWait(ds);
        clock.advance(1_000);
        await release();
        expect(await renewing).toBe(false);
        expect(await lockService.acquire('connection:wa', 'o2', 1_000)).toBe(true);
    });

    it('renew extends an unexpired lease from a fresh reading', async () => {
        const ds = await create();
        const clock = new ControllableClock();
        const { lockService } = servicesOf(ds, clock);

        await lockService.acquire('connection:wa', 'o1', 1_000);
        clock.advance(999);
        expect(await lockService.renew('connection:wa', 'o1', 1_000)).toBe(true);
        expect(await lockService.renew('connection:wa', 'o2', 1_000)).toBe(false);
        // renewed at 999 until 1999
        clock.advance(999);
        expect(await lockService.acquire('connection:wa', 'o2', 1_000)).toBe(false);
        clock.advance(1);
        expect(await lockService.acquire('connection:wa', 'o2', 1_000)).toBe(true);
    });

    it('a fence check holds its lease row until the batch commits, so a takeover waits for it', async () => {
        const ds = await create();
        const writer = servicesOf(ds, new ControllableClock());
        const taker = servicesOf(ds, new ControllableClock(new Date(10_000)));
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await writer.connections.create(connection('wa'));
        await writer.lockService.acquire(fence.lock, fence.owner, 1_000);

        // under the late clock the lease is expired: the takeover and the batches race, and no deadlock forms
        const results = await Promise.allSettled([
            ...Array.from({ length: 10 }, (_, i) => writer.connections.writeEntries(
                'wa',
                { set: { [`k${i}`]: new Uint8Array([i]) } },
                fence,
            )),
            taker.lockService.acquire(fence.lock, 'o2', 1_000),
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
