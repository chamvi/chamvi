/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { systemClock } from '../clock/module.ts';
import { ConnectionHeldError, InvalidAgentDefinitionError } from '../errors/index.ts';
import {
    dataKeyContextOf,
    lockKeyOf,
    normalizeOpenOptions,
} from './helpers.ts';
import { ConnectionSession } from './session.ts';
import type {
    ConnectionOpenOptions,
    ConnectionVaultOptions,
    IConnectionSession,
    IConnectionVault,
} from './types.ts';
import { assertConnectionName } from './validate.ts';

/**
 * A connection vault over a store with `connections` and a keyring. Throws
 * InvalidAgentDefinitionError when the store has no connections repository.
 */
export function createConnectionVault(options: ConnectionVaultOptions): IConnectionVault {
    const { store, keyring } = options;
    const clock = options.clock ?? systemClock;
    const { connections } = store;

    if (!connections) {
        throw new InvalidAgentDefinitionError('A connection vault needs a store with a connections repository.');
    }

    return {
        async open(name: string, opts: ConnectionOpenOptions): Promise<IConnectionSession> {
            assertConnectionName(name);

            const {
                type,
                leaseTtlMs,
                signal,
                recreate,
            } = normalizeOpenOptions(opts);
            const lock = lockKeyOf(name);
            // one token per session: no other session (of this process too) is taken for the holder or passes its fence
            const owner = `${opts.owner}:${randomUUID()}`;

            signal?.throwIfAborted();

            if (!await store.locks.acquire(lock, owner, leaseTtlMs)) {
                throw new ConnectionHeldError(name);
            }

            try {
                signal?.throwIfAborted();

                // under the lease only the holder deletes: the entries go with the row, a fresh data key follows
                if (recreate) {
                    await connections.delete(name);
                }

                let connection = await connections.findOne(name);

                if (!connection) {
                    const now = clock.now();
                    const { key, wrapped } = keyring.createDataKey(dataKeyContextOf(name));

                    key.fill(0);
                    await connections.insert({
                        name,
                        type,
                        keyId: wrapped.keyId,
                        wrappedKey: wrapped.wrapped,
                        createdAt: now,
                        updatedAt: now,
                    });
                    // re-read: the stored row wins if another holder inserted in between
                    connection = await connections.findOneOrFail(name);
                }

                if (connection.type !== type) {
                    throw new InvalidAgentDefinitionError(
                        `The connection "${name}" is of type "${connection.type}", not "${type}".`,
                    );
                }

                const dataKey = keyring.unwrap(
                    { keyId: connection.keyId, wrapped: connection.wrappedKey },
                    dataKeyContextOf(name),
                );

                signal?.throwIfAborted();

                return new ConnectionSession({
                    name,
                    owner,
                    lock,
                    leaseTtlMs,
                    dataKey,
                    connections,
                    locks: store.locks,
                    clock,
                });
            } catch (error) {
                await store.locks.release(lock, owner).catch(() => undefined);

                throw error;
            }
        },
    };
}
