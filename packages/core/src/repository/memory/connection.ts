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
    assertConnectionEntryKey,
    assertConnectionEntryWrite,
    assertConnectionName,
} from '../../connection/validate.ts';
import type {
    Connection,
    ConnectionEntryWrite,
    ConnectionFence,
} from '../../connection/types.ts';
import { LeaseLostError, RepositoryNotFoundError } from '../../errors/index.ts';
import type { IConnectionRepository } from '../types.ts';
import { compareCodePoints } from './helpers.ts';
import type { MemoryConnectionRepositoryOptions } from './types.ts';

type Held = {
    connection: Connection;
    entries: Map<string, Uint8Array>;
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

        this.connections.set(connection.name, { connection: copyConnection(connection), entries: new Map() });

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

    async delete(name: string): Promise<void> {
        assertConnectionName(name);
        this.connections.delete(name);
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

        if (!this.holdsLock(fence.lock, fence.owner)) {
            throw new LeaseLostError({ lock: fence.lock });
        }

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
}
