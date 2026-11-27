/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import { defineQuery } from '@rapiq/core';
import { uuidv7 } from 'uuidv7';
import type { IConnectionRepository } from '@chamvi/store';
import type { Connection, ConnectionInput, ConnectionRecord } from '@chamvi/core-kit';
import type { IClock } from '../clock/index.ts';
import { ConnectionChangedError, LeaseLostError, RepositoryNotFoundError } from '../errors/index.ts';
import {
    isSameConfig,
    lockKeyOf,
    readConfig,
    readConnection,
} from './helpers.ts';
import type {
    ConnectionConfig,
    ConnectionConfigWrite,
    ConnectionEntryWrite,
    ConnectionFence,
    ConnectionServiceContext,
    ConnectionWriteExpectation,
    IConnectionService,
} from './types.ts';
import {
    assertConnection,
    assertConnectionConfigWrite,
    assertConnectionEntryKey,
    assertConnectionEntryWrite,
    assertConnectionName,
} from './validate.ts';

/** Unlocked config reads `findConfig` tries before one read under the connection row's lock. */
const CONFIG_READ_ATTEMPTS = 3;

/**
 * Connections, their runtime-state entries (opaque sealed bytes: the
 * service never sees plaintext) and their config (plain settings and
 * sealed secrets, kept apart from the entries) over an
 * `IConnectionRepository`. Values are copied in and out as plain
 * Uint8Arrays. A name breaking the agent-name rule, an entry key outside 1
 * to 255 characters or with NUL, a secret field outside 1 to 64 characters
 * or with NUL, or a malformed batch throws ValidationError before anything
 * is read or written; entry calls on an unknown connection throw
 * RepositoryNotFoundError.
 *
 * A change runs in one transaction: the connection row read locked first,
 * then (for a fenced write) the fence's lock row, then the clock, then the
 * writes through the handed-in repository and its `entries` and `secrets`.
 * A fence must name the lease `connection:<name>` its owner holds unexpired
 * at that clock reading: a fence released, expired or taken over before
 * the write is refused with LeaseLostError and nothing is written.
 */
export class ConnectionService implements IConnectionService {
    protected repository: IConnectionRepository;

    protected clock: IClock;

    constructor(ctx: ConnectionServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async create(connection: ConnectionInput): Promise<boolean> {
        assertConnection(connection);

        try {
            await this.repository.transaction((repository) => repository.save(repository.create(this.recordOf(connection))));
        } catch (error) {
            if (error instanceof EntityConflictError) {
                return false;
            }

            throw error;
        }

        return true;
    }

    async findOne(name: string): Promise<Connection | undefined> {
        assertConnectionName(name);

        const record = await this.repository.findOneBy({ name });

        return record ? readConnection(record) : undefined;
    }

    async findOneOrFail(name: string): Promise<Connection> {
        const connection = await this.findOne(name);

        if (!connection) {
            throw new RepositoryNotFoundError('connections');
        }

        return connection;
    }

    async find(): Promise<Connection[]> {
        const { data } = await this.repository.findMany(defineQuery({ sorts: { name: 'ASC' } }));

        return data.map((record) => readConnection(record));
    }

    async delete(name: string, fence?: ConnectionFence): Promise<void> {
        assertConnectionName(name);

        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name });

            if (fence) {
                await this.assertFence(repository, name, fence);
            }

            if (!record) {
                return;
            }

            await this.removeChildren(repository, record);
            await repository.remove(record);
        });
    }

    async replace(connection: ConnectionInput, fence: ConnectionFence): Promise<void> {
        assertConnection(connection);

        try {
            await this.replaceOnce(connection, fence);
        } catch (error) {
            if (!(error instanceof EntityConflictError)) {
                throw error;
            }

            // another insert of the name landed between the locked read and the insert: in place, in a new transaction
            await this.replaceOnce(connection, fence);
        }
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

        assertConnectionName(name);

        const record = await this.repository.findOneBy({ name });

        if (!record) {
            throw new RepositoryNotFoundError('connections');
        }

        const found = new Map<string, Uint8Array>();

        if (keys.length === 0) {
            return found;
        }

        for (const entry of await this.repository.entries.findManyBy({ connectionId: record.id, key: [...new Set(keys)] })) {
            found.set(entry.key, new Uint8Array(entry.value));
        }

        return found;
    }

    async writeEntries(name: string, write: ConnectionEntryWrite, fence: ConnectionFence): Promise<void> {
        assertConnectionName(name);
        assertConnectionEntryWrite(write);

        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name });

            if (!record) {
                throw new RepositoryNotFoundError('connections');
            }

            const now = await this.assertFence(repository, name, fence);
            const { entries } = repository;

            if (write.clear) {
                await entries.removeManyBy({ connectionId: record.id });
            }

            await entries.upsertMany(Object.entries(write.set ?? {}).map(([key, value]) => entries.create({
                id: uuidv7(),
                connectionId: record.id,
                key,
                value,
            })));

            if (write.delete && write.delete.length > 0) {
                await entries.removeManyBy({ connectionId: record.id, key: [...new Set(write.delete)] });
            }

            repository.merge(record, { updatedAt: now });
            await repository.save(record);
        });
    }

    async findConfig(name: string): Promise<ConnectionConfig | undefined> {
        assertConnectionName(name);

        for (let attempt = 0; attempt < CONFIG_READ_ATTEMPTS; attempt++) {
            const record = await this.repository.findOneBy({ name });

            if (!record) {
                return undefined;
            }

            const secrets = await this.repository.secrets.findManyBy({ connectionId: record.id });
            const again = await this.repository.findOneBy({ name });

            if (again && isSameConfig(record, again)) {
                return readConfig(record, secrets);
            }
        }

        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name });

            return record ? readConfig(record, await repository.secrets.findManyBy({ connectionId: record.id })) : undefined;
        });
    }

    async writeConfig(name: string, write: ConnectionConfigWrite, expected: ConnectionWriteExpectation): Promise<number> {
        assertConnectionName(name);
        assertConnectionConfigWrite(write, expected);

        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name });

            if (!record) {
                throw new RepositoryNotFoundError('connections');
            }

            // the row lock holds the key, the revision and the id until the commit: a save that read older ones lost the race
            if (Buffer.compare(record.wrappedKey, expected.wrappedKey) !== 0 ||
                (expected.revision !== undefined && record.configRevision !== expected.revision) ||
                (expected.generation !== undefined && record.id !== expected.generation)) {
                throw new ConnectionChangedError(name);
            }

            const { secrets } = repository;

            await secrets.upsertMany(Object.entries(write.setSecrets ?? {}).map(([field, value]) => secrets.create({
                id: uuidv7(),
                connectionId: record.id,
                name: field,
                value,
            })));

            if (write.clearSecrets && write.clearSecrets.length > 0) {
                await secrets.removeManyBy({ connectionId: record.id, name: [...new Set(write.clearSecrets)] });
            }

            const revision = record.configRevision + 1;

            repository.merge(record, {
                ...(write.settings && { settings: write.settings }),
                configRevision: revision,
                updatedAt: new Date(this.clock.now()),
            });
            await repository.save(record);

            return revision;
        });
    }

    /**
     * The fence rule, inside the transaction after the connection row's
     * lock: the fence names this connection's lease, its lock row (read
     * locked) names the fence's owner, and it is unexpired at a clock
     * reading taken after both locks (a wait for them may have outlasted
     * the lease); else LeaseLostError. Resolves that clock reading.
     */
    protected async assertFence(repository: IConnectionRepository, name: string, fence: ConnectionFence): Promise<Date> {
        // only the lease of this connection fences it, never another lock the owner holds
        if (fence.lock !== lockKeyOf(name)) {
            throw new LeaseLostError({ lock: fence.lock });
        }

        const lease = await repository.findFence(fence.lock);
        const now = new Date(this.clock.now());

        if (!lease || lease.owner !== fence.owner || lease.expiresAt.getTime() <= now.getTime()) {
            throw new LeaseLostError({ lock: fence.lock });
        }

        return now;
    }

    protected async replaceOnce(connection: ConnectionInput, fence: ConnectionFence): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const stored = await repository.findOneBy({ name: connection.name });

            await this.assertFence(repository, connection.name, fence);

            if (!stored) {
                await repository.save(repository.create(this.recordOf(connection)));

                return;
            }

            // in place, never delete and insert: a config write queued on this row must see the new key, not a deleted row.
            // The id and createdAt stay (the same row); the revision moves, so a save that read before is stale
            await this.removeChildren(repository, stored);
            repository.merge(stored, {
                type: connection.type,
                keyId: connection.keyId,
                wrappedKey: connection.wrappedKey,
                configRevision: stored.configRevision + 1,
                updatedAt: connection.updatedAt,
            });
            await repository.save(stored);
        });
    }

    /**
     * The entries and secrets of a connection, removed without reading
     * them (they are sealed under its data key), however many there are.
     */
    protected async removeChildren(repository: IConnectionRepository, record: ConnectionRecord): Promise<void> {
        await repository.entries.removeManyBy({ connectionId: record.id });
        await repository.secrets.removeManyBy({ connectionId: record.id });
    }

    /** A new row of a connection: no settings, revision 0. */
    protected recordOf(connection: ConnectionInput): ConnectionRecord {
        return {
            id: uuidv7(),
            name: connection.name,
            type: connection.type,
            keyId: connection.keyId,
            wrappedKey: connection.wrappedKey,
            settings: {},
            configRevision: 0,
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
        };
    }
}
