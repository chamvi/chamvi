/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { systemClock } from '../clock/module.ts';
import { ConnectionHeldError, InvalidAgentDefinitionError, LeaseLostError } from '../errors/index.ts';
import {
    dataKeyContextOf,
    lockKeyOf,
    normalizeOpenOptions,
} from './helpers.ts';
import { ConnectionSession } from './session.ts';
import type {
    Connection,
    ConnectionOpenOptions,
    ConnectionVaultOptions,
    IConnectionSession,
    IConnectionVault,
} from './types.ts';
import { assertConnection, assertConnectionName } from './validate.ts';

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

                const create = (): Connection => {
                    const now = clock.now();
                    const { key, wrapped } = keyring.createDataKey(dataKeyContextOf(name));

                    key.fill(0);

                    return {
                        name,
                        type,
                        keyId: wrapped.keyId,
                        wrappedKey: wrapped.wrapped,
                        createdAt: now,
                        updatedAt: now,
                    };
                };

                let connection: Connection | undefined;

                if (recreate) {
                    const replacement = create();

                    // the whole replacement is checked before anything is deleted
                    assertConnection(replacement);
                    // fenced by the lease: an opener whose lease lapsed deletes nothing of the next holder
                    await connections.replace(replacement, { lock, owner });
                } else {
                    connection = await connections.findOne(name);

                    if (!connection) {
                        await connections.insert(create());
                    }
                }

                // re-read: the stored row wins if another holder inserted in between
                connection ??= await connections.findOneOrFail(name);

                if (connection.type !== type) {
                    throw new InvalidAgentDefinitionError(
                        `The connection "${name}" is of type "${connection.type}", not "${type}".`,
                    );
                }

                // the initialization may have outlasted the lease: confirm it before handing out the session
                const confirmed = clock.now().getTime();

                if (!await store.locks.renew(lock, owner, leaseTtlMs)) {
                    throw new LeaseLostError({ lock });
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
                    expiresAt: confirmed + leaseTtlMs,
                    connections,
                    locks: store.locks,
                    clock,
                }, dataKey);
            } catch (error) {
                await store.locks.release(lock, owner).catch(() => undefined);

                throw error;
            }
        },
    };
}
