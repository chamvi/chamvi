/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { initAuthCreds, proto } from 'baileys';
import type {
    AuthenticationCreds,
    AuthenticationState,
    SignalDataSet,
    SignalDataTypeMap,
} from 'baileys';
import { InvalidAgentDefinitionError, assertConnectionName } from '@chamvi/core';
import type { IConnectionSession } from '@chamvi/core';
import { isObject } from 'smob';
import type {
    IWhatsAppAuthProvider,
    WhatsAppAuthAcquireOptions,
    WhatsAppAuthLease,
} from '../whatsapp/types.ts';
import { CREDS_ENTRY, WHATSAPP_CONNECTION_TYPE } from './constants.ts';
import {
    decodeValue,
    defaultOwner,
    encodeValue,
    keyEntryOf,
} from './helpers.ts';
import type { StoreWhatsAppAuthOptions } from './types.ts';

function invalid(message: string): InvalidAgentDefinitionError {
    return new InvalidAgentDefinitionError(`createStoreWhatsAppAuth: ${message}`);
}

function assertOptions(options: StoreWhatsAppAuthOptions): void {
    if (!isObject(options)) {
        throw invalid('options must be an object.');
    }

    if (!isObject(options.vault) || typeof options.vault.open !== 'function') {
        throw invalid('vault must be a connection vault (createConnectionVault()).');
    }

    try {
        assertConnectionName(options.connection);
    } catch (error) {
        throw invalid(`connection: ${(error as Error).message}`);
    }

    if (options.owner !== undefined && (typeof options.owner !== 'string' || options.owner.length === 0)) {
        throw invalid('owner must be a non-empty string.');
    }
}

/** The lease over one open session: Baileys' creds and signal keys as sealed entries. */
async function leaseOf(session: IConnectionSession): Promise<WhatsAppAuthLease> {
    const stored = await session.readOne(CREDS_ENTRY);
    const auth: AuthenticationState = {
        creds: stored ? decodeValue<AuthenticationCreds>(stored) : initAuthCreds(),
        keys: {
            async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
                const entries = await session.read(ids.map((id) => keyEntryOf(type, id)));
                const found: { [id: string]: SignalDataTypeMap[T] } = {};

                for (const id of ids) {
                    const bytes = entries.get(keyEntryOf(type, id));

                    if (bytes) {
                        const value = decodeValue<SignalDataTypeMap[T]>(bytes);

                        // Baileys reads this one as its protobuf class, as its own file store revives it
                        found[id] = type === 'app-state-sync-key' ?
                            proto.Message.AppStateSyncKeyData.fromObject(value as object) as unknown as SignalDataTypeMap[T] :
                            value;
                    }
                }

                return found;
            },
            // one Baileys transaction, one atomic batch: a null value deletes
            set(data: SignalDataSet) {
                const set: Record<string, Uint8Array> = {};
                const remove: string[] = [];

                for (const [type, values] of Object.entries(data)) {
                    for (const [id, value] of Object.entries(values ?? {})) {
                        if (value === null || value === undefined) {
                            remove.push(keyEntryOf(type, id));
                        } else {
                            set[keyEntryOf(type, id)] = encodeValue(value);
                        }
                    }
                }

                return session.write({ set, delete: remove });
            },
            clear: () => session.write({ clear: true }),
        },
    };

    return {
        auth,
        // the creds object the lease holds when called (a reset replaces it)
        saveCreds: () => session.write({ set: { [CREDS_ENTRY]: encodeValue(auth.creds) } }),
        flush: () => session.flush(),
        release: () => session.close(),
        lost: session.lost.then(() => undefined),
    };
}

/**
 * A WhatsApp auth provider over a connection of the vault: the session is
 * the connection's entries (`creds`, `key:<type>:<id>`, Baileys JSON sealed
 * with the connection's data key), held under the vault's renewed lease
 * `connection:<name>`. `acquire` rejects with ConnectionHeldError while
 * another process (or another acquire of this one) holds it; a holder that
 * stopped renewing blocks a new one for at most `leaseTtlMs`. Every write is
 * fenced by the lease, so a holder that lost it writes nothing. Nothing is
 * read or acquired before `acquire`.
 */
export function createStoreWhatsAppAuth(options: StoreWhatsAppAuthOptions): IWhatsAppAuthProvider {
    assertOptions(options);

    const owner = options.owner ?? defaultOwner();

    return {
        async acquire(signal: AbortSignal, acquireOptions?: WhatsAppAuthAcquireOptions): Promise<WhatsAppAuthLease> {
            const session = await options.vault.open(options.connection, {
                type: WHATSAPP_CONNECTION_TYPE,
                owner,
                signal,
                // a reset recreates the connection under the lease: a fresh data key, no entries
                ...(acquireOptions?.reset === true ? { recreate: true } : {}),
                ...(options.leaseTtlMs !== undefined ? { leaseTtlMs: options.leaseTtlMs } : {}),
            });

            try {
                return await leaseOf(session);
            } catch (error) {
                await session.close();

                throw error;
            }
        },
    };
}
