/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ConnectionChangedError,
    LeaseLostError,
    RepositoryNotFoundError,
    assertConnection,
    assertConnectionConfigWrite,
    assertConnectionEntryKey,
    assertConnectionEntryWrite,
    assertConnectionName,
    systemClock,
} from '@chamvi/core';
import type {
    Connection,
    ConnectionConfig,
    ConnectionConfigWrite,
    ConnectionEntryWrite,
    ConnectionFence,
    IClock,
    IConnectionRepository,
} from '@chamvi/core';
import { In, QueryFailedError } from 'typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
    ConnectionEntity,
    ConnectionEntryEntity,
    ConnectionSecretEntity,
    LockEntity,
    TableName,
} from '../entities/index.ts';
import { asValues } from '../repository/helpers.ts';
import type { DatabaseStoreOptions } from '../repository/types.ts';

/** Rows per statement: keeps a large batch well below Postgres' 65535 bind parameters. */
const CHUNK_SIZE = 1_000;

function chunks<T>(items: readonly T[]): T[][] {
    const out: T[][] = [];

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        out.push(items.slice(i, i + CHUNK_SIZE));
    }

    return out;
}

/** Postgres' unique_violation (23505) on the connections table, as TypeORM wraps the driver error. */
function isConnectionNameTaken(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
        return false;
    }

    const driverError = error.driverError as { code?: unknown; table?: unknown } | undefined;

    return driverError?.code === '23505' && driverError.table === TableName.CONNECTIONS;
}

function toConnectionValues(connection: Connection, id: string) {
    return asValues<ConnectionEntity>({
        id,
        name: connection.name,
        type: connection.type,
        keyId: connection.keyId,
        wrappedKey: Buffer.from(connection.wrappedKey),
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
    });
}

function toConnection(entity: ConnectionEntity): Connection {
    return {
        name: entity.name,
        type: entity.type,
        keyId: entity.keyId,
        // a copy into a plain Uint8Array: a Buffer would leak its toJSON
        wrappedKey: new Uint8Array(entity.wrappedKey),
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
}

/**
 * Connections, their sealed entries and their config in Postgres. `replace`,
 * `writeEntries` and a fenced `delete` each run in one transaction: it locks the connection row
 * (existence, serialized batches), reads the fence's lock row `FOR SHARE` (an
 * acquire, renew or release of that lease waits for the commit), checks its
 * expiry against a clock reading taken after both locks are held, then clears,
 * upserts and deletes. `writeConfig` takes the same row lock and no fence.
 */
export class DatabaseConnectionRepository implements IConnectionRepository {
    protected dataSource: DataSource;

    protected clock: IClock;

    constructor(opts: DatabaseStoreOptions) {
        this.dataSource = opts.dataSource;
        this.clock = opts.clock ?? systemClock;
    }

    protected get connections(): Repository<ConnectionEntity> {
        return this.dataSource.getRepository(ConnectionEntity);
    }

    protected get entries(): Repository<ConnectionEntryEntity> {
        return this.dataSource.getRepository(ConnectionEntryEntity);
    }

    protected get secrets(): Repository<ConnectionSecretEntity> {
        return this.dataSource.getRepository(ConnectionSecretEntity);
    }

    protected async findIdOrFail(name: string): Promise<string> {
        assertConnectionName(name);

        const entity = await this.connections.findOne({ select: { id: true }, where: { name } });

        if (!entity) {
            throw new RepositoryNotFoundError('connections');
        }

        return entity.id;
    }

    async insert(connection: Connection): Promise<boolean> {
        assertConnection(connection);

        const result = await this.connections.createQueryBuilder()
            .insert()
            .values(toConnectionValues(connection, uuidv7()))
            .orIgnore()
            .returning(['name'])
            .updateEntity(false)
            .execute();

        return result.raw.length === 1;
    }

    async findOne(name: string): Promise<Connection | undefined> {
        assertConnectionName(name);

        const entity = await this.connections.findOneBy({ name });

        return entity ? toConnection(entity) : undefined;
    }

    async findOneOrFail(name: string): Promise<Connection> {
        const result = await this.findOne(name);

        if (result === undefined) {
            throw new RepositoryNotFoundError('connections');
        }

        return result;
    }

    async find(): Promise<Connection[]> {
        const entities = await this.connections.find({ order: { name: 'ASC' } });

        return entities.map((entity) => toConnection(entity));
    }

    async delete(name: string, fence?: ConnectionFence): Promise<void> {
        assertConnectionName(name);

        if (!fence) {
            // the entries and secrets go with it (ON DELETE CASCADE)
            await this.connections.delete({ name });

            return;
        }

        // only the lease of this connection fences it, never another lock the owner holds
        if (fence.lock !== `connection:${name}`) {
            throw new LeaseLostError({ lock: fence.lock });
        }

        await this.dataSource.transaction(async (manager) => {
            const connections = manager.withRepository(this.connections);

            // the row lock serializes the delete with entry batches, config writes and a replace
            await connections.findOne({
                select: { id: true },
                where: { name },
                lock: { mode: 'pessimistic_write' },
            });

            await this.assertLease(manager, fence);
            await connections.delete({ name });
        });
    }

    async findEntry(name: string, key: string): Promise<Uint8Array | undefined> {
        assertConnectionEntryKey(key);

        const found = await this.findEntries(name, [key]);

        return found.get(key);
    }

    async findEntries(name: string, keys: readonly string[]): Promise<Map<string, Uint8Array>> {
        for (const key of keys) {
            assertConnectionEntryKey(key);
        }

        const connectionId = await this.findIdOrFail(name);

        const found = new Map<string, Uint8Array>();

        for (const chunk of chunks([...new Set(keys)])) {
            const entities = await this.entries.findBy({ connectionId, key: In(chunk) });

            for (const entity of entities) {
                found.set(entity.key, new Uint8Array(entity.value));
            }
        }

        return found;
    }

    async replace(connection: Connection, fence: ConnectionFence): Promise<void> {
        assertConnection(connection);

        const { name } = connection;

        if (fence.lock !== `connection:${name}`) {
            throw new LeaseLostError({ lock: fence.lock });
        }

        try {
            await this.replaceOnce(connection, fence);
        } catch (error) {
            // a concurrent insert of the name between the locked lookup and the insert: the retry updates in place
            if (!isConnectionNameTaken(error)) {
                throw error;
            }

            await this.replaceOnce(connection, fence);
        }
    }

    protected async replaceOnce(connection: Connection, fence: ConnectionFence): Promise<void> {
        const { name } = connection;

        await this.dataSource.transaction(async (manager) => {
            const connections = manager.withRepository(this.connections);

            // the row lock serializes the replace with entry batches and config writes on the same connection
            const stored = await connections.findOne({
                select: { id: true },
                where: { name },
                lock: { mode: 'pessimistic_write' },
            });

            await this.assertLease(manager, fence);

            if (!stored) {
                await connections.createQueryBuilder()
                    .insert()
                    .values(toConnectionValues(connection, uuidv7()))
                    .updateEntity(false)
                    .execute();

                return;
            }

            // in place, never delete and insert: a config write queued on this row must see the new key, not a deleted row
            await manager.withRepository(this.entries).delete({ connectionId: stored.id });
            await manager.withRepository(this.secrets).delete({ connectionId: stored.id });
            await connections.createQueryBuilder()
                .update()
                .set(toConnectionValues(connection, stored.id))
                .where({ id: stored.id })
                .updateEntity(false)
                .execute();
        });
    }

    /**
     * Reads the fence's lock row `FOR SHARE` (an acquire, renew or release of
     * that lease waits for the commit) and checks its expiry against a clock
     * reading taken once the row locks are held.
     */
    protected async assertLease(manager: EntityManager, fence: ConnectionFence): Promise<void> {
        const lease = await manager.getRepository(LockEntity).findOne({
            where: { key: fence.lock, owner: fence.owner },
            lock: { mode: 'pessimistic_read' },
        });

        // read the clock once the row locks are held: a wait for them may have outlasted the lease
        if (!lease || lease.expiresAt.getTime() <= this.clock.now().getTime()) {
            throw new LeaseLostError({ lock: fence.lock });
        }
    }

    async writeEntries(name: string, write: ConnectionEntryWrite, fence: ConnectionFence): Promise<void> {
        assertConnectionName(name);
        assertConnectionEntryWrite(write);

        // only the lease of this connection fences it, never another lock the owner holds
        if (fence.lock !== `connection:${name}`) {
            throw new LeaseLostError({ lock: fence.lock });
        }

        await this.dataSource.transaction(async (manager) => {
            // the row lock of this update serializes batches and a delete of the connection
            const touched = await manager.withRepository(this.connections).createQueryBuilder()
                .update()
                .set({ updatedAt: this.clock.now() })
                .where({ name })
                .returning(['id'])
                .updateEntity(false)
                .execute();
            const [row] = touched.raw as { id: string }[];

            if (row === undefined) {
                throw new RepositoryNotFoundError('connections');
            }

            await this.assertLease(manager, fence);

            const connectionId = row.id;
            const entries = manager.withRepository(this.entries);

            if (write.clear) {
                await entries.delete({ connectionId });
            }

            const rows = Object.entries(write.set ?? {}).map(([key, value]) => asValues<ConnectionEntryEntity>({
                id: uuidv7(),
                connectionId,
                key,
                value: Buffer.from(value),
            }));

            for (const chunk of chunks(rows)) {
                await entries.createQueryBuilder()
                    .insert()
                    .values(chunk)
                    .orUpdate(['value'], ['connection_id', 'key'])
                    .updateEntity(false)
                    .execute();
            }

            for (const chunk of chunks([...new Set(write.delete ?? [])])) {
                await entries.delete({ connectionId, key: In(chunk) });
            }
        });
    }

    async findConfig(name: string): Promise<ConnectionConfig | undefined> {
        assertConnectionName(name);

        // one snapshot: the data key and a save's settings, revision and secrets are read together
        return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const entity = await manager.withRepository(this.connections).findOne({
                select: {
                    id: true,
                    keyId: true,
                    wrappedKey: true,
                    settings: true,
                    configRevision: true,
                },
                where: { name },
            });

            if (!entity) {
                return undefined;
            }

            const secrets = await manager.withRepository(this.secrets).findBy({ connectionId: entity.id });

            return {
                keyId: entity.keyId,
                // a copy into a plain Uint8Array: a Buffer would leak its toJSON
                wrappedKey: new Uint8Array(entity.wrappedKey),
                settings: entity.settings,
                secrets: new Map(secrets.map((secret) => [secret.name, new Uint8Array(secret.value)])),
                revision: entity.configRevision,
            };
        });
    }

    async writeConfig(name: string, write: ConnectionConfigWrite, expectedWrappedKey: Uint8Array, expectedRevision?: number): Promise<number> {
        assertConnectionName(name);
        assertConnectionConfigWrite(write, expectedWrappedKey);

        return this.dataSource.transaction(async (manager) => {
            const connections = manager.withRepository(this.connections);
            // the row lock serializes config writes with a replace, so the compare below holds until the commit
            const stored = await connections.findOne({
                select: {
                    id: true,
                    wrappedKey: true,
                    configRevision: true,
                },
                where: { name },
                lock: { mode: 'pessimistic_write' },
            });

            if (!stored) {
                throw new RepositoryNotFoundError('connections');
            }

            // the same lock holds the revision: a save that read an older one lost the race
            if (Buffer.compare(stored.wrappedKey, expectedWrappedKey) !== 0 ||
                (expectedRevision !== undefined && stored.configRevision !== expectedRevision)) {
                throw new ConnectionChangedError(name);
            }

            const connectionId = stored.id;
            const secrets = manager.withRepository(this.secrets);
            const rows = Object.entries(write.setSecrets ?? {}).map(([field, value]) => asValues<ConnectionSecretEntity>({
                id: uuidv7(),
                connectionId,
                name: field,
                value: Buffer.from(value),
            }));

            for (const chunk of chunks(rows)) {
                await secrets.createQueryBuilder()
                    .insert()
                    .values(chunk)
                    .orUpdate(['value'], ['connection_id', 'name'])
                    .updateEntity(false)
                    .execute();
            }

            for (const chunk of chunks([...new Set(write.clearSecrets ?? [])])) {
                await secrets.delete({ connectionId, name: In(chunk) });
            }

            const revision = stored.configRevision + 1;

            await connections.createQueryBuilder()
                .update()
                .set(asValues<ConnectionEntity>({
                    ...(write.settings ? { settings: write.settings } : {}),
                    configRevision: revision,
                    updatedAt: this.clock.now(),
                }))
                .where({ id: connectionId })
                .updateEntity(false)
                .execute();

            return revision;
        });
    }
}
