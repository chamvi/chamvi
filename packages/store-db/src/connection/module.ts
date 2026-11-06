/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    LeaseLostError,
    RepositoryNotFoundError,
    assertConnection,
    assertConnectionEntryKey,
    assertConnectionEntryWrite,
    assertConnectionName,
    systemClock,
} from '@chamvi/core';
import type {
    Connection,
    ConnectionEntryWrite,
    ConnectionFence,
    IClock,
    IConnectionRepository,
} from '@chamvi/core';
import { In, MoreThan } from 'typeorm';
import type { DataSource, Repository } from 'typeorm';
import { ConnectionEntity, ConnectionEntryEntity, LockEntity } from '../entities/index.ts';
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
 * Connections and their sealed entries in Postgres. `writeEntries` runs in one
 * transaction: it locks the connection row (existence, serialized batches),
 * reads the fence's lock row `FOR SHARE` (an acquire, renew or release of that
 * lease waits for the commit), then clears, upserts and deletes.
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

    protected async assertExists(name: string): Promise<void> {
        assertConnectionName(name);

        if (!await this.connections.existsBy({ name })) {
            throw new RepositoryNotFoundError('connections');
        }
    }

    async insert(connection: Connection): Promise<boolean> {
        assertConnection(connection);

        const result = await this.connections.createQueryBuilder()
            .insert()
            .values(asValues<ConnectionEntity>({
                name: connection.name,
                type: connection.type,
                keyId: connection.keyId,
                wrappedKey: Buffer.from(connection.wrappedKey),
                createdAt: connection.createdAt,
                updatedAt: connection.updatedAt,
            }))
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

    async delete(name: string): Promise<void> {
        assertConnectionName(name);
        // the entries go with it (ON DELETE CASCADE)
        await this.connections.delete({ name });
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

        await this.assertExists(name);

        const found = new Map<string, Uint8Array>();

        for (const chunk of chunks([...new Set(keys)])) {
            const entities = await this.entries.findBy({ connectionName: name, key: In(chunk) });

            for (const entity of entities) {
                found.set(entity.key, new Uint8Array(entity.value));
            }
        }

        return found;
    }

    async writeEntries(name: string, write: ConnectionEntryWrite, fence: ConnectionFence): Promise<void> {
        assertConnectionName(name);
        assertConnectionEntryWrite(write);

        // only the lease of this connection fences it, never another lock the owner holds
        if (fence.lock !== `connection:${name}`) {
            throw new LeaseLostError({ lock: fence.lock });
        }

        await this.dataSource.transaction(async (manager) => {
            const now = this.clock.now();
            // the row lock of this update serializes batches and a delete of the connection
            const touched = await manager.withRepository(this.connections).createQueryBuilder()
                .update()
                .set({ updatedAt: now })
                .where({ name })
                .returning(['name'])
                .updateEntity(false)
                .execute();

            if (touched.raw.length !== 1) {
                throw new RepositoryNotFoundError('connections');
            }

            const lease = await manager.getRepository(LockEntity).findOne({
                where: {
                    key: fence.lock,
                    owner: fence.owner,
                    expiresAt: MoreThan(now),
                },
                lock: { mode: 'pessimistic_read' },
            });

            if (!lease) {
                throw new LeaseLostError({ lock: fence.lock });
            }

            const entries = manager.withRepository(this.entries);

            if (write.clear) {
                await entries.delete({ connectionName: name });
            }

            const rows = Object.entries(write.set ?? {}).map(([key, value]) => asValues<ConnectionEntryEntity>({
                connectionName: name,
                key,
                value: Buffer.from(value),
            }));

            for (const chunk of chunks(rows)) {
                await entries.createQueryBuilder()
                    .insert()
                    .values(chunk)
                    .orUpdate(['value'], ['connection_name', 'key'])
                    .updateEntity(false)
                    .execute();
            }

            for (const chunk of chunks([...new Set(write.delete ?? [])])) {
                await entries.delete({ connectionName: name, key: In(chunk) });
            }
        });
    }
}
