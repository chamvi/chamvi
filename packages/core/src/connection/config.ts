/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { isObject } from 'smob';
import { systemClock } from '../clock/module.ts';
import {
    ConnectionChangedError,
    ConnectionHeldError,
    InvalidAgentDefinitionError,
    ValidationError,
} from '../errors/index.ts';
import { open, seal } from '../keyring/module.ts';
import { DEFAULT_CONNECTION_LEASE_TTL_MS } from './constants.ts';
import { dataKeyContextOf, lockKeyOf, secretAadOf } from './helpers.ts';
import type {
    Connection,
    ConnectionConfigStoreOptions,
    ConnectionConfigUpdate,
    ConnectionConfigUpdateOptions,
    ConnectionConfigView,
    ConnectionConfigWrite,
    ConnectionValues,
    IConnectionConfigStore,
} from './types.ts';
import { assertConnectionConfigWrite, assertConnectionName } from './validate.ts';

/** The secrets `update` sets; a ValidationError for a value that is not a plain object (a string would map to fields `0`, `1`, ...). */
const secretsToSet = (update: ConnectionConfigUpdate): Record<string, string> => {
    const set = update.secrets?.set;

    if (set === undefined) {
        return {};
    }

    if (!isObject(set)) {
        throw new ValidationError('A connection config secrets.set must be an object of string values.');
    }

    return set;
};

const hasSecretsToSet = (update: ConnectionConfigUpdate) => Object.keys(secretsToSet(update)).length > 0;

const encodeSecret = (value: string): Uint8Array => {
    // a lone surrogate would encode to U+FFFD: what is sealed must be what was saved
    if (typeof value !== 'string' || !value.isWellFormed()) {
        throw new ValidationError('A connection secret value must be a well-formed string.');
    }

    return new TextEncoder().encode(value);
};

/** The repository write of `update`; `dataKey` is needed only when it sets a secret. */
function toConfigWrite(name: string, update: ConnectionConfigUpdate, dataKey?: Uint8Array): ConnectionConfigWrite {
    const { settings, secrets } = update;
    const set = secretsToSet(update);

    return {
        ...(settings && { settings }),
        ...(dataKey && secrets?.set && {
            // fromEntries defines own properties: an assignment of `__proto__` would set the prototype instead
            setSecrets: Object.fromEntries(Object.entries(set).map(([field, value]) => [
                field,
                seal(dataKey, encodeSecret(value), secretAadOf(name, field)),
            ])),
        }),
        // a non-array passes through, so the write's validation refuses it instead of spreading a string
        ...(secrets?.clear && { clearSecrets: Array.isArray(secrets.clear) ? [...secrets.clear] : secrets.clear as string[] }),
    };
}

/**
 * The connection config store over a store with `connections`. Throws
 * InvalidAgentDefinitionError when the store has no connections repository;
 * `keyring` is resolved only when a data key is really needed.
 */
export function createConnectionConfigStore(options: ConnectionConfigStoreOptions): IConnectionConfigStore {
    const { store, keyring } = options;
    const clock = options.clock ?? systemClock;
    const { connections } = store;

    if (!connections) {
        throw new InvalidAgentDefinitionError('A connection config store needs a store with a connections repository.');
    }

    /** Runs `use` with the unwrapped data key of connection `name` and zeroes it afterwards. */
    const withDataKey = <T>(
        name: string,
        key: Pick<Connection, 'keyId' | 'wrappedKey'>,
        use: (dataKey: Uint8Array) => T,
    ): T => {
        const dataKey = keyring().unwrap(
            { keyId: key.keyId, wrapped: key.wrappedKey },
            dataKeyContextOf(name),
        );

        try {
            return use(dataKey);
        } finally {
            dataKey.fill(0);
        }
    };

    return {
        async create(name: string, type: string, update: ConnectionConfigUpdate): Promise<boolean> {
            assertConnectionName(name);

            // a taken name needs no key material, so an app without a keyring still learns it is taken
            if (await connections.findOne(name)) {
                return false;
            }

            const { key, wrapped } = keyring().createDataKey(dataKeyContextOf(name));
            let write: ConnectionConfigWrite;

            try {
                write = toConfigWrite(name, update, key);
            } finally {
                key.fill(0);
            }

            // the whole write is checked before the row exists: a malformed one leaves nothing behind
            assertConnectionConfigWrite(write, wrapped.wrapped);

            const now = clock.now();
            const inserted = await connections.insert({
                name,
                type,
                keyId: wrapped.keyId,
                wrappedKey: wrapped.wrapped,
                createdAt: now,
                updatedAt: now,
            });

            if (!inserted) {
                return false;
            }

            if (Object.keys(write).length > 0) {
                try {
                    // the row is bare until this write: a writer that filled it meanwhile keeps it, and this create is refused
                    await connections.writeConfig(name, write, wrapped.wrapped, 0);
                } catch (error) {
                    // a recreate or another writer meanwhile owns the row; any other failure must not leave an empty row a retry cannot fill
                    if (!(error instanceof ConnectionChangedError)) {
                        await connections.delete(name).catch(() => undefined);
                    }

                    throw error;
                }
            }

            return true;
        },

        async describe(name: string): Promise<ConnectionConfigView | undefined> {
            const config = await connections.findConfig(name);

            if (!config) {
                return undefined;
            }

            return {
                settings: config.settings,
                secretsSet: config.secrets.keys().toArray().sort(),
                revision: config.revision,
            };
        },

        async read(name: string) {
            // one snapshot: the data key is the one the secrets read with it are sealed under
            const config = await connections.findConfig(name);

            if (!config) {
                return undefined;
            }

            // ignoreBOM keeps a leading U+FEFF: the default decoder would strip it from a stored secret
            const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
            const secrets = config.secrets.size > 0 ?
                withDataKey(name, config, (dataKey) => Object.fromEntries(
                    config.secrets.entries().map(([field, sealed]) => [
                        field,
                        decoder.decode(open(dataKey, sealed, secretAadOf(name, field))),
                    ]),
                )) :
                {};
            // spread defines own properties: an assignment of `__proto__` would set the prototype instead
            const values = { ...config.settings, ...secrets } as ConnectionValues;

            return { values, revision: config.revision };
        },

        async update(name: string, update: ConnectionConfigUpdate, options: ConnectionConfigUpdateOptions = {}): Promise<number> {
            const connection = await connections.findOneOrFail(name);
            const write = hasSecretsToSet(update) ?
                withDataKey(name, connection, (dataKey) => toConfigWrite(name, update, dataKey)) :
                toConfigWrite(name, update);

            // the guard on the wrapped key refuses a secret sealed under a key a recreate replaced meanwhile,
            // the one on the revision a save checked against a snapshot another save replaced
            return connections.writeConfig(name, write, connection.wrappedKey, options.revision);
        },

        async delete(name: string, owner: string): Promise<void> {
            assertConnectionName(name);

            const lock = lockKeyOf(name);
            const holder = `${owner}:${randomUUID()}`;

            if (!await store.locks.acquire(lock, holder, DEFAULT_CONNECTION_LEASE_TTL_MS)) {
                throw new ConnectionHeldError(name);
            }

            try {
                await connections.delete(name, { lock, owner: holder });
            } finally {
                // the lease then expires on its own after its ttl
                await store.locks.release(lock, holder).catch(() => undefined);
            }
        },
    };
}
