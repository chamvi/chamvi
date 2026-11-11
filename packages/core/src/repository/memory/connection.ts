/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { systemClock } from '../../clock/index.ts';
import type { IClock } from '../../clock/index.ts';
import {
    assertConnection,
    assertConnectionConfigWrite,
    assertConnectionEntryKey,
    assertConnectionEntryWrite,
    assertConnectionName,
} from '../../connection/validate.ts';
import type {
    Connection,
    ConnectionConfig,
    ConnectionConfigWrite,
    ConnectionEntryWrite,
    ConnectionFence,
} from '../../connection/types.ts';
import { ConnectionChangedError, LeaseLostError, RepositoryNotFoundError } from '../../errors/index.ts';
import type { IConnectionRepository } from '../types.ts';
import { compareCodePoints } from './helpers.ts';
import type { MemoryConnectionRepositoryOptions } from './types.ts';

type Held = {
    connection: Connection;
    entries: Map<string, Uint8Array>;
    settings: Record<string, unknown>;
    secrets: Map<string, Uint8Array>;
    revision: number;
};

const copyConnection = (connection: Connection): Connection => ({
    name: connection.name,
    type: connection.type,
    keyId: connection.keyId,
    wrappedKey: new Uint8Array(connection.wrappedKey),
    createdAt: new Date(connection.createdAt),
    updatedAt: new Date(connection.updatedAt),
});

/**
 * In-process connections. The fence is checked through `holdsLock` (the
 * store's lock repository) with no await between the check and the write.
 */
export class MemoryConnectionRepository implements IConnectionRepository {
    protected clock: IClock;

    protected holdsLock: (lock: string, owner: string) => boolean;

    protected connections = new Map<string, Held>();

    constructor(opts: MemoryConnectionRepositoryOptions) {
        this.clock = opts.clock ?? systemClock;
        this.holdsLock = opts.holdsLock;
    }

    protected assertFence(name: string, fence: ConnectionFence): void {
        // only the lease of this connection fences it, never another lock the owner holds
        if (fence.lock !== `connection:${name}` || !this.holdsLock(fence.lock, fence.owner)) {
            throw new LeaseLostError({ lock: fence.lock });
        }
    }

    protected held(name: string): Held {
        assertConnectionName(name);

        const held = this.connections.get(name);

        if (!held) {
            throw new RepositoryNotFoundError('connections');
        }

        return held;
    }

    async insert(connection: Connection): Promise<boolean> {
        assertConnection(connection);

        if (this.connections.has(connection.name)) {
            return false;
        }

        this.connections.set(connection.name, {
            connection: copyConnection(connection),
            entries: new Map(),
            settings: {},
            secrets: new Map(),
            revision: 0,
        });

        return true;
    }

    async findOne(name: string): Promise<Connection | undefined> {
        assertConnectionName(name);

        const held = this.connections.get(name);

        return held ? copyConnection(held.connection) : undefined;
    }

    async findOneOrFail(name: string): Promise<Connection> {
        const found = await this.findOne(name);

        if (!found) {
            throw new RepositoryNotFoundError('connections');
        }

        return found;
    }

    async find(): Promise<Connection[]> {
        return this.connections.values()
            .toArray()
            .map((held) => copyConnection(held.connection))
            .sort((a, b) => compareCodePoints(a.name, b.name));
    }

    async delete(name: string, fence?: ConnectionFence): Promise<void> {
        assertConnectionName(name);

        if (fence) {
            this.assertFence(name, fence);
        }

        this.connections.delete(name);
    }

    async replace(connection: Connection, fence: ConnectionFence): Promise<void> {
        assertConnection(connection);
        this.assertFence(connection.name, fence);

        const previous = this.connections.get(connection.name);

        // the secrets are sealed under the replaced data key; the settings are plain
        this.connections.set(connection.name, {
            connection: copyConnection(connection),
            entries: new Map(),
            settings: previous?.settings ?? {},
            secrets: new Map(),
            revision: previous?.revision ?? 0,
        });
    }

    async findEntry(name: string, key: string): Promise<Uint8Array | undefined> {
        assertConnectionEntryKey(key);

        const value = this.held(name).entries.get(key);

        return value ? new Uint8Array(value) : undefined;
    }

    async findEntries(name: string, keys: readonly string[]): Promise<Map<string, Uint8Array>> {
        for (const key of keys) {
            assertConnectionEntryKey(key);
        }

        const { entries } = this.held(name);
        const found = new Map<string, Uint8Array>();

        for (const key of keys) {
            const value = entries.get(key);

            if (value) {
                found.set(key, new Uint8Array(value));
            }
        }

        return found;
    }

    async writeEntries(name: string, write: ConnectionEntryWrite, fence: ConnectionFence): Promise<void> {
        assertConnectionEntryWrite(write);

        const held = this.held(name);

        this.assertFence(name, fence);

        if (write.clear) {
            held.entries.clear();
        }

        for (const [key, value] of Object.entries(write.set ?? {})) {
            held.entries.set(key, new Uint8Array(value));
        }

        for (const key of write.delete ?? []) {
            held.entries.delete(key);
        }

        held.connection.updatedAt = this.clock.now();
    }

    async findConfig(name: string): Promise<ConnectionConfig | undefined> {
        assertConnectionName(name);

        const held = this.connections.get(name);

        if (!held) {
            return undefined;
        }

        return {
            keyId: held.connection.keyId,
            wrappedKey: new Uint8Array(held.connection.wrappedKey),
            settings: structuredClone(held.settings),
            secrets: new Map(held.secrets.entries().map(([field, value]) => [field, new Uint8Array(value)])),
            revision: held.revision,
        };
    }

    async writeConfig(name: string, write: ConnectionConfigWrite, expectedWrappedKey: Uint8Array, expectedRevision?: number): Promise<number> {
        assertConnectionConfigWrite(write, expectedWrappedKey);

        const held = this.held(name);

        if (Buffer.compare(held.connection.wrappedKey, expectedWrappedKey) !== 0 ||
            (expectedRevision !== undefined && held.revision !== expectedRevision)) {
            throw new ConnectionChangedError(name);
        }

        if (write.settings) {
            held.settings = structuredClone(write.settings);
        }

        for (const [field, value] of Object.entries(write.setSecrets ?? {})) {
            held.secrets.set(field, new Uint8Array(value));
        }

        for (const field of write.clearSecrets ?? []) {
            held.secrets.delete(field);
        }

        held.revision += 1;
        held.connection.updatedAt = this.clock.now();

        return held.revision;
    }
}
