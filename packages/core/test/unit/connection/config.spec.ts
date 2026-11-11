/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    ConnectionChangedError,
    ConnectionHeldError,
    DecryptionFailedError,
    InvalidAgentDefinitionError,
    LeaseLostError,
    RepositoryNotFoundError,
    ValidationError,
    createConnectionConfigStore,
    createConnectionVault,
    createKeyring,
    createMemoryStore,
} from '@chamvi/core';
import type { IConnectionRepository, IKeyring, IStore } from '@chamvi/core';
import { DEFAULT_CONNECTION_LEASE_TTL_MS } from '../../../src/connection/constants.ts';
import { ControllableClock } from '../../utils/clock.ts';

const PLAINTEXT = 'hunter2-plaintext-secret';

const text = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array | undefined) => (value ? new TextDecoder().decode(value) : undefined);

const setup = () => {
    const clock = new ControllableClock();
    const store = createMemoryStore({ clock });
    const keyring = createKeyring([{ id: 'k1', key: new Uint8Array(randomBytes(32)) }]);
    const calls = { keyring: 0 };
    const config = createConnectionConfigStore({
        store,
        clock,
        keyring: () => {
            calls.keyring += 1;

            return keyring;
        },
    });
    const vault = createConnectionVault({
        store,
        keyring,
        clock,
    });

    return {
        calls,
        clock,
        config,
        connections: store.connections as IConnectionRepository,
        keyring,
        store,
        vault,
    };
};

const contains = (haystack: Uint8Array, needle: string) => Buffer.from(haystack).includes(Buffer.from(needle));

const throwingKeyring = (error: Error) => (): IKeyring => {
    throw error;
};

describe('createConnectionConfigStore', () => {
    it('refuses a store without connections', () => {
        const { store, keyring } = setup();
        const bare: IStore = { ...store, connections: undefined };

        expect(() => createConnectionConfigStore({ store: bare, keyring: () => keyring }))
            .toThrow(InvalidAgentDefinitionError);
    });

    describe('create', () => {
        it('creates a row with a wrapped data key, also without a secret', async () => {
            const {
                calls, 
                config, 
                connections, 
            } = setup();

            await expect(config.create('mail-work', 'mail', { settings: { host: 'imap.example.org' } })).resolves.toBe(true);

            const row = await connections.findOneOrFail('mail-work');

            expect(row.type).toBe('mail');
            expect(row.keyId).toBe('k1');
            expect(row.wrappedKey.length).toBeGreaterThan(0);
            expect(calls.keyring).toBe(1);
            await expect(config.describe('mail-work')).resolves.toEqual({
                settings: { host: 'imap.example.org' },
                secretsSet: [],
                revision: 1,
            });
        });

        it('leaves the revision at 0 for an empty update', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', {});

            await expect(config.describe('mail-work')).resolves.toEqual({
                settings: {},
                secretsSet: [],
                revision: 0,
            });
        });

        it('resolves false and keeps the stored row when the name is taken', async () => {
            const { config, connections } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            const before = await connections.findOneOrFail('mail-work');

            await expect(config.create('mail-work', 'other', { settings: { a: 1 } })).resolves.toBe(false);

            const after = await connections.findOneOrFail('mail-work');

            expect(after.type).toBe('mail');
            expect(after.wrappedKey).toEqual(before.wrappedKey);
            await expect(config.read('mail-work')).resolves.toEqual({
                values: { password: PLAINTEXT },
                revision: 1,
            });
        });

        it('resolves false for a taken name without a keyring', async () => {
            const { store, keyring } = setup();
            const seeded = createConnectionConfigStore({ store, keyring: () => keyring });
            const keyless = createConnectionConfigStore({ store, keyring: throwingKeyring(new Error('no keys')) });

            await seeded.create('mail-work', 'mail', {});

            await expect(keyless.create('mail-work', 'mail', { settings: { a: 1 } })).resolves.toBe(false);
        });

        it('resolves false when another creator inserts first', async () => {
            const { config, connections } = setup();
            const { findOne } = connections;

            connections.findOne = async () => undefined;
            await config.create('mail-work', 'mail', { settings: { first: true } });

            await expect(config.create('mail-work', 'mail', { settings: { second: true } })).resolves.toBe(false);

            connections.findOne = findOne;
            await expect(config.describe('mail-work')).resolves.toMatchObject({ settings: { first: true }, revision: 1 });
        });

        it('rejects with the keyring error and writes nothing, also without a secret', async () => {
            const { store, connections } = setup();
            const failure = new Error('CHAMVI_ENCRYPTION_KEYS is not set');
            const config = createConnectionConfigStore({ store, keyring: throwingKeyring(failure) });

            await expect(config.create('mail-work', 'mail', { settings: { a: 1 } })).rejects.toBe(failure);
            await expect(connections.findOne('mail-work')).resolves.toBeUndefined();
        });

        it('leaves no row behind for a malformed secret field', async () => {
            const { config, connections } = setup();

            await expect(config.create('mail-work', 'mail', { secrets: { set: { 'a\0b': PLAINTEXT } } }))
                .rejects.toBeInstanceOf(ValidationError);
            await expect(connections.findOne('mail-work')).resolves.toBeUndefined();
        });

        it('refuses a malformed name', async () => {
            const { config } = setup();

            await expect(config.create('Not Valid', 'mail', {})).rejects.toBeInstanceOf(ValidationError);
        });

        it('refuses its config write when another writer filled the row after the insert, keeping that writer\'s config', async () => {
            const { config, connections } = setup();
            const { insert } = connections;

            connections.insert = async (...args) => {
                const inserted = await insert.apply(connections, args);

                // what a repair of the bare row does while this create is in flight
                await config.update('mail-work', { settings: { host: 'other' }, secrets: { set: { token: 'other-token' } } });

                return inserted;
            };

            await expect(config.create('mail-work', 'mail', { settings: { host: 'mine' }, secrets: { set: { password: PLAINTEXT } } }))
                .rejects.toBeInstanceOf(ConnectionChangedError);
            await expect(config.describe('mail-work')).resolves.toEqual({
                settings: { host: 'other' },
                secretsSet: ['token'],
                revision: 1,
            });
        });

        it('leaves the bare row when the initial config write fails, so a retry fills it', async () => {
            const { config, connections } = setup();
            const failure = new Error('store down');
            const { writeConfig } = connections;

            connections.writeConfig = async () => {
                connections.writeConfig = writeConfig;

                throw failure;
            };

            await expect(config.create('mail-work', 'mail', { settings: { host: 'a' } })).rejects.toBe(failure);
            await expect(config.describe('mail-work')).resolves.toEqual({
                settings: {},
                secretsSet: [],
                revision: 0,
            });

            // what the http repair of a bare row does
            await expect(config.create('mail-work', 'mail', { settings: { host: 'a' } })).resolves.toBe(false);
            await expect(config.update('mail-work', { settings: { host: 'a' }, secrets: { set: { password: PLAINTEXT } } }, { revision: 0 }))
                .resolves.toBe(1);
            await expect(config.read('mail-work')).resolves.toEqual({
                values: { host: 'a', password: PLAINTEXT },
                revision: 1,
            });
        });

        it('keeps the entries of a session that opened the row before the initial config write failed', async () => {
            const {
                config,
                connections,
                vault,
            } = setup();
            const failure = new Error('store down');
            const { writeConfig } = connections;
            let session: Awaited<ReturnType<typeof vault.open>> | undefined;

            connections.writeConfig = async () => {
                connections.writeConfig = writeConfig;

                // another replica finds the row, takes the lease and writes its entries
                session = await vault.open('whatsapp', { type: 'whatsapp', owner: 'other-replica' });
                await session.write({ set: { creds: text('session-creds') } });

                throw failure;
            };

            await expect(config.create('whatsapp', 'whatsapp', { settings: { label: 'main' } })).rejects.toBe(failure);

            await expect(connections.findOne('whatsapp')).resolves.toBeDefined();
            expect(decode(await session!.readOne('creds'))).toBe('session-creds');
            await session!.write({ set: { creds: text('rotated') } });
            expect(decode(await session!.readOne('creds'))).toBe('rotated');

            await session!.close();
        });
    });

    describe('describe', () => {
        it('describe and an env-only read never call the keyring', async () => {
            const {
                calls, 
                config, 
                keyring, 
                store, 
            } = setup();
            const seeded = createConnectionConfigStore({ store, keyring: () => keyring });

            await seeded.create('secretless', 'mail', { settings: { host: 'a' } });
            await seeded.create('secretive', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            await expect(config.describe('secretless')).resolves.toEqual({
                settings: { host: 'a' },
                secretsSet: [],
                revision: 1,
            });
            await expect(config.describe('secretive')).resolves.toEqual({
                settings: {},
                secretsSet: ['password'],
                revision: 1,
            });
            await expect(config.describe('missing')).resolves.toBeUndefined();
            await expect(config.read('secretless')).resolves.toEqual({ values: { host: 'a' }, revision: 1 });
            await expect(config.read('missing')).resolves.toBeUndefined();

            expect(calls.keyring).toBe(0);
        });

        it('lists the set secrets in a stable order and never their values', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { zeta: PLAINTEXT, alpha: PLAINTEXT } } });

            const view = await config.describe('mail-work');

            expect(view?.secretsSet).toEqual(['alpha', 'zeta']);
            expect(JSON.stringify(view)).not.toContain(PLAINTEXT);
        });
    });

    describe('sealing', () => {
        it('seals a secret so the repository holds no plaintext', async () => {
            const { config, connections } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            const stored = await connections.findConfig('mail-work');
            const sealed = stored?.secrets.get('password') as Uint8Array;

            expect(Buffer.compare(sealed, text(PLAINTEXT))).not.toBe(0);
            expect(contains(sealed, PLAINTEXT)).toBe(false);
            await expect(config.read('mail-work')).resolves.toEqual({
                values: { password: PLAINTEXT },
                revision: 1,
            });
        });

        it('a secret moved to another field fails to open with DecryptionFailedError', async () => {
            const { config, connections } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            const row = await connections.findOneOrFail('mail-work');
            const stored = await connections.findConfig('mail-work');

            await connections.writeConfig(
                'mail-work',
                { setSecrets: { token: stored?.secrets.get('password') as Uint8Array }, clearSecrets: ['password'] },
                row.wrappedKey,
            );

            await expect(config.read('mail-work')).rejects.toBeInstanceOf(DecryptionFailedError);
        });

        it('a secret moved to another connection fails to open', async () => {
            const { config, connections } = setup();

            await config.create('one', 'mail', { secrets: { set: { password: PLAINTEXT } } });
            await config.create('two', 'mail', {});

            const stored = await connections.findConfig('one');
            const target = await connections.findOneOrFail('two');

            await connections.writeConfig(
                'two',
                { setSecrets: { password: stored?.secrets.get('password') as Uint8Array } },
                target.wrappedKey,
            );

            await expect(config.read('two')).rejects.toBeInstanceOf(DecryptionFailedError);
        });

        it('an entry and a secret with one key do not collide', async () => {
            const { config, vault } = setup();
            const session = await vault.open('shared', { type: 'mail', owner: 'test' });

            await session.write({ set: { password: text('entry-value') } });
            await config.update('shared', { secrets: { set: { password: 'secret-value' } } });

            await expect(config.read('shared')).resolves.toMatchObject({ values: { password: 'secret-value' } });
            expect(decode(await session.readOne('password'))).toBe('entry-value');

            await session.close();
        });

        it('a sealed secret does not open as an entry of the same key', async () => {
            const {
                config, 
                connections, 
                store, 
                vault, 
            } = setup();

            await config.create('shared', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            const stored = await connections.findConfig('shared');
            const lock = 'connection:shared';
            const owner = 'writer';

            await store.locks.acquire(lock, owner, 1_000);
            await connections.writeEntries(
                'shared',
                { set: { password: stored?.secrets.get('password') as Uint8Array } },
                { lock, owner },
            );
            await store.locks.release(lock, owner);

            const session = await vault.open('shared', { type: 'mail', owner: 'test' });

            await expect(session.readOne('password')).rejects.toBeInstanceOf(DecryptionFailedError);
            await session.close();
        });

        it('reads settings and secrets as one set of values', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', {
                settings: { host: 'imap.example.org', port: 993 },
                secrets: { set: { password: PLAINTEXT } },
            });

            await expect(config.read('mail-work')).resolves.toEqual({
                values: {
                    host: 'imap.example.org', 
                    port: 993, 
                    password: PLAINTEXT, 
                },
                revision: 1,
            });
        });

        it('keeps a leading byte order mark of a secret', async () => {
            const { config } = setup();
            const secret = `\uFEFF${PLAINTEXT}`;

            await config.create('mail-work', 'mail', { secrets: { set: { password: secret } } });

            const result = await config.read('mail-work');

            expect(result?.values.password).toBe(secret);
        });

        it('keeps a secret field named __proto__ an own value', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: Object.fromEntries([['__proto__', PLAINTEXT]]) } });

            const result = await config.read('mail-work');

            expect(Object.keys(result?.values ?? {})).toEqual(['__proto__']);
            expect(Object.getPrototypeOf(result?.values)).toBe(Object.prototype);
        });

        it('reads the data key with the config, so a recreate and a save between reads still opens', async () => {
            const {
                config,
                connections,
                vault,
            } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            const { findOne, findConfig } = connections;

            // a recreate and a save land right after any read of the row alone
            connections.findOne = async (name) => {
                const found = await findOne.call(connections, name);

                connections.findOne = findOne;

                const session = await vault.open('mail-work', {
                    type: 'mail',
                    owner: 'resetter',
                    recreate: true,
                });

                await session.close();
                await config.update('mail-work', { secrets: { set: { password: 'after-recreate' } } });

                return found;
            };
            connections.findConfig = async (name) => {
                connections.findConfig = findConfig;

                // the row read first, as a two-read implementation would
                await connections.findOne(name);

                return findConfig.call(connections, name);
            };

            await expect(config.read('mail-work')).resolves.toMatchObject({ values: { password: 'after-recreate' } });
        });

        it('refuses a secret value that is not a well-formed string, without echoing it', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', {});

            const notString = config.update('mail-work', { secrets: { set: { password: 42 as unknown as string } } });
            const loneSurrogate = config.update('mail-work', { secrets: { set: { password: 'abc\uD800' } } });

            await expect(notString).rejects.toBeInstanceOf(ValidationError);
            await expect(loneSurrogate).rejects.toBeInstanceOf(ValidationError);
            expect((await loneSurrogate.catch((error: Error) => error) as Error).message).not.toContain('abc');
            await expect(config.describe('mail-work')).resolves.toMatchObject({ secretsSet: [], revision: 0 });
        });
    });

    describe('update', () => {
        it('saves while another session holds the lease and leaves its entries and data key usable', async () => {
            const {
                config, 
                connections, 
                vault, 
            } = setup();
            const session = await vault.open('whatsapp', { type: 'whatsapp', owner: 'other-replica' });

            await session.write({ set: { creds: text('session-creds') } });

            const before = await connections.findOneOrFail('whatsapp');

            await expect(config.update('whatsapp', {
                settings: { label: 'main' },
                secrets: { set: { token: PLAINTEXT } },
            })).resolves.toBe(1);

            const after = await connections.findOneOrFail('whatsapp');

            expect(after.wrappedKey).toEqual(before.wrappedKey);
            expect(decode(await session.readOne('creds'))).toBe('session-creds');
            await expect(config.read('whatsapp')).resolves.toEqual({
                values: { label: 'main', token: PLAINTEXT },
                revision: 1,
            });

            await session.write({ set: { creds: text('rotated') } });
            expect(decode(await session.readOne('creds'))).toBe('rotated');

            await session.close();
        });

        it('replaces the settings as a whole and keeps untouched secrets', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', {
                settings: { host: 'a', port: 1 },
                secrets: { set: { password: PLAINTEXT } },
            });

            await expect(config.update('mail-work', { settings: { host: 'b' } })).resolves.toBe(2);
            await expect(config.read('mail-work')).resolves.toEqual({
                values: { host: 'b', password: PLAINTEXT },
                revision: 2,
            });
        });

        it('clears a secret', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT, token: 'other' } } });
            await config.update('mail-work', { secrets: { clear: ['password'] } });

            await expect(config.describe('mail-work')).resolves.toMatchObject({ secretsSet: ['token'], revision: 2 });
            await expect(config.read('mail-work')).resolves.toMatchObject({ values: { token: 'other' } });
        });

        it('needs no keyring for settings and clears', async () => {
            const { store, keyring } = setup();
            const seeded = createConnectionConfigStore({ store, keyring: () => keyring });
            const keyless = createConnectionConfigStore({ store, keyring: throwingKeyring(new Error('no keys')) });

            await seeded.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT } } });

            await expect(keyless.update('mail-work', {
                settings: { host: 'a' },
                secrets: { clear: ['password'] },
            })).resolves.toBe(2);
        });

        it('refuses secrets.clear that is not an array and writes nothing', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { a: PLAINTEXT, b: PLAINTEXT } } });

            await expect(config.update('mail-work', { secrets: { clear: 'ab' as never } }))
                .rejects.toBeInstanceOf(ValidationError);
            await expect(config.describe('mail-work')).resolves.toMatchObject({ secretsSet: ['a', 'b'], revision: 1 });
        });

        it('refuses secrets.set that is not an object and writes nothing', async () => {
            const { config } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { a: PLAINTEXT } } });

            await expect(config.update('mail-work', { secrets: { set: 'ab' as never } }))
                .rejects.toBeInstanceOf(ValidationError);
            await expect(config.update('mail-work', { secrets: { set: ['x'] as never } }))
                .rejects.toBeInstanceOf(ValidationError);
            await expect(config.create('mail-home', 'mail', { secrets: { set: 'ab' as never } }))
                .rejects.toBeInstanceOf(ValidationError);
            await expect(config.describe('mail-work')).resolves.toMatchObject({ secretsSet: ['a'], revision: 1 });
            await expect(config.describe('mail-home')).resolves.toBeUndefined();
        });

        it('rejects for a connection that does not exist', async () => {
            const { config } = setup();

            await expect(config.update('missing', { settings: {} })).rejects.toBeInstanceOf(RepositoryNotFoundError);
        });

        it('a recreate between read and write surfaces ConnectionChangedError', async () => {
            const {
                config, 
                connections, 
                vault, 
            } = setup();

            await config.create('mail-work', 'mail', {
                settings: { host: 'a' },
                secrets: { set: { password: PLAINTEXT } },
            });

            const { findOne } = connections;
            const recreate = async () => {
                const session = await vault.open('mail-work', {
                    type: 'mail',
                    owner: 'resetter',
                    recreate: true,
                });

                await session.close();
            };

            connections.findOne = async (name) => {
                const found = await findOne.call(connections, name);

                connections.findOne = findOne;
                await recreate();

                return found;
            };

            await expect(config.update('mail-work', { secrets: { set: { password: 'sealed-under-a-dead-key' } } }))
                .rejects.toBeInstanceOf(ConnectionChangedError);

            // the swap dropped the secrets; nothing was sealed under the replaced key
            await expect(connections.findConfig('mail-work')).resolves.toMatchObject({
                settings: { host: 'a' },
                secrets: new Map(),
                revision: 1,
            });
        });

        it('saving a secret with a throwing keyring rejects with that error and writes nothing', async () => {
            const {
                store, 
                keyring, 
                connections, 
            } = setup();
            const seeded = createConnectionConfigStore({ store, keyring: () => keyring });
            const failure = new Error('CHAMVI_ENCRYPTION_KEYS is not set');
            const keyless = createConnectionConfigStore({ store, keyring: throwingKeyring(failure) });

            await seeded.create('mail-work', 'mail', { settings: { host: 'a' } });

            await expect(keyless.update('mail-work', {
                settings: { host: 'b' },
                secrets: { set: { password: PLAINTEXT } },
            })).rejects.toBe(failure);

            await expect(connections.findConfig('mail-work')).resolves.toMatchObject({
                settings: { host: 'a' },
                secrets: new Map(),
                revision: 1,
            });
        });
    });

    describe('delete', () => {
        it('removes the connection and releases its one-shot lease', async () => {
            const {
                config, 
                connections, 
                store, 
            } = setup();

            await config.create('mail-work', 'mail', { secrets: { set: { password: PLAINTEXT } } });
            await config.delete('mail-work', 'api');

            await expect(connections.findOne('mail-work')).resolves.toBeUndefined();
            await expect(store.locks.acquire('connection:mail-work', 'next', 1_000)).resolves.toBe(true);
        });

        it('delete refuses a held lease', async () => {
            const {
                config, 
                connections, 
                vault, 
            } = setup();
            const session = await vault.open('whatsapp', { type: 'whatsapp', owner: 'other-replica' });

            await expect(config.delete('whatsapp', 'api')).rejects.toBeInstanceOf(ConnectionHeldError);
            await expect(connections.findOne('whatsapp')).resolves.toBeDefined();

            await session.close();
        });

        it('acquires under a per-call owner, so one owner cannot pass as a holder', async () => {
            const { config, store } = setup();
            const owners: string[] = [];
            const { acquire } = store.locks;

            store.locks.acquire = async (key, owner, ttl) => {
                owners.push(owner);

                return acquire.call(store.locks, key, owner, ttl);
            };

            await config.create('mail-work', 'mail', {});
            await config.delete('mail-work', 'api');
            await config.delete('mail-work', 'api');

            expect(owners).toHaveLength(2);
            expect(owners[0]).toMatch(/^api:[0-9a-f-]{36}$/);
            expect(owners[0]).not.toBe(owners[1]);
        });

        it('fences the delete: a delete stalled past its lease removes nothing of the next holder', async () => {
            const {
                clock,
                config,
                connections,
                store,
            } = setup();
            const { delete: remove } = connections;

            await config.create('mail-work', 'mail', { settings: { host: 'a' } });

            connections.delete = async (name, fence) => {
                connections.delete = remove;
                clock.advance(DEFAULT_CONNECTION_LEASE_TTL_MS);
                expect(await store.locks.acquire('connection:mail-work', 'next', 60_000)).toBe(true);

                return remove.call(connections, name, fence);
            };

            await expect(config.delete('mail-work', 'api')).rejects.toBeInstanceOf(LeaseLostError);
            await expect(connections.findOne('mail-work')).resolves.toBeDefined();
        });

        it('releases the lease when the delete fails', async () => {
            const {
                config, 
                connections, 
                store, 
            } = setup();
            const failure = new Error('store down');

            await config.create('mail-work', 'mail', {});
            connections.delete = async () => {
                throw failure;
            };

            await expect(config.delete('mail-work', 'api')).rejects.toBe(failure);
            await expect(store.locks.acquire('connection:mail-work', 'next', 1_000)).resolves.toBe(true);
        });
    });
});
