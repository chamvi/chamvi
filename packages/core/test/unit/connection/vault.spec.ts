/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    ConnectionHeldError,
    DEFAULT_CONNECTION_LEASE_TTL_MS,
    DecryptionFailedError,
    ErrorCode,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    LeaseLostError,
    ValidationError,
    createConnectionVault,
    createKeyring,
    createMemoryStore,
} from '@chamvi/core';
import type {
    ConnectionEntryWrite,
    ConnectionFence,
    IStore,
    KeyringKey,
} from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';

const text = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array | undefined) => (value ? new TextDecoder().decode(value) : undefined);
const masterKey = (id: string): KeyringKey => ({ id, key: new Uint8Array(randomBytes(32)) });
const settle = () => new Promise<void>((resolve) => {
    setImmediate(resolve); 
});

const setup = (keys: KeyringKey[] = [masterKey('k1')]) => {
    const clock = new ControllableClock();
    const store = createMemoryStore({ clock });
    const vault = createConnectionVault({
        store, 
        keyring: createKeyring(keys), 
        clock, 
    });

    return {
        clock,
        store,
        vault,
        keys,
    };
};

/** Records the owner of every lease the vault acquires (each session has its own). */
const recordOwners = (store: IStore) => {
    const owners: string[] = [];
    const acquire = store.locks.acquire.bind(store.locks);

    store.locks.acquire = async (key, owner, ttlMs) => {
        owners.push(owner);

        return acquire(key, owner, ttlMs);
    };

    return owners;
};

describe('createConnectionVault', () => {
    it('refuses a store without connections', () => {
        const store: IStore = { ...createMemoryStore(), connections: undefined };

        expect(() => createConnectionVault({ store, keyring: createKeyring([masterKey('k1')]) }))
            .toThrow(InvalidAgentDefinitionError);
    });

    it('refuses an invalid name, type or lease ttl', async () => {
        const { vault } = setup();

        await expect(vault.open('Bad Name', { type: 'whatsapp', owner: 'o1' })).rejects.toBeInstanceOf(ValidationError);
        await expect(vault.open('wa', { type: '', owner: 'o1' })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        await expect(vault.open('wa', { type: 'whatsapp', owner: '' })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            recreate: 'yes' as unknown as boolean,
        })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 0,
        })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
    });

    it('refuses a lease ttl above the timer limit, which a timer would clamp to 1 ms', async () => {
        const { vault } = setup();

        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 2_147_483_648,
        })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 2_147_483_647,
        });

        await session.close();
    });
});

describe('vault.open', () => {
    it('creates the connection on first open with a data key wrapped under the active key', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();

        clock.advance(5_000);

        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const stored = await store.connections.findOneOrFail('wa');

        expect(session.name).toBe('wa');
        expect(stored).toMatchObject({
            name: 'wa',
            type: 'whatsapp',
            keyId: 'k1',
            createdAt: new Date(5_000),
        });
        expect(stored.wrappedKey.length).toBe(12 + 32 + 16);
        await session.close();
    });

    it('rejects a second open while the lease is held with ConnectionHeldError', async () => {
        const { vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        for (const owner of ['o2', 'o1']) {
            const attempt = vault.open('wa', { type: 'whatsapp', owner });

            await expect(attempt).rejects.toBeInstanceOf(ConnectionHeldError);
            await expect(attempt).rejects.toMatchObject({ code: ErrorCode.CONNECTION_HELD, connection: 'wa' });
        }

        await session.close();
    });

    it('refuses a type mismatch and releases the lease', async () => {
        const { vault } = setup();

        await (await vault.open('wa', { type: 'whatsapp', owner: 'o1' })).close();
        await expect(vault.open('wa', { type: 'telegram', owner: 'o1' })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        await (await vault.open('wa', { type: 'whatsapp', owner: 'o2' })).close();
    });

    it('rejects with LeaseLostError when the lease lapsed during initialization, and the next holder keeps it', async () => {
        const {
            clock,
            store,
            vault,
        } = setup();
        const findOne = store.connections!.findOne.bind(store.connections);

        let delayed = false;

        // the first lookup outlasts the lease and another owner takes it over meanwhile
        store.connections!.findOne = async (name) => {
            if (!delayed) {
                delayed = true;
                clock.advance(3_000);
                expect(await store.locks.acquire('connection:wa', 'o2', 60_000)).toBe(true);
            }

            return findOne(name);
        };

        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        })).rejects.toBeInstanceOf(LeaseLostError);
        expect(await store.locks.acquire('connection:wa', 'o3', 1_000)).toBe(false);
    });

    it('rejects with LeaseLostError when the lease expired during initialization, and releases it', async () => {
        const {
            clock,
            store,
            vault,
        } = setup();
        const findOne = store.connections!.findOne.bind(store.connections);

        let delayed = false;

        store.connections!.findOne = async (name) => {
            if (!delayed) {
                delayed = true;
                clock.advance(3_000);
            }

            return findOne(name);
        };

        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        })).rejects.toBeInstanceOf(LeaseLostError);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(true);
    });

    it('releases a lease acquired after the signal aborted', async () => {
        const { store, vault } = setup();
        const controller = new AbortController();
        const acquire = store.locks.acquire.bind(store.locks);

        store.locks.acquire = async (...args) => {
            const result = await acquire(...args);

            controller.abort(new Error('stopped'));

            return result;
        };

        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            signal: controller.signal,
        })).rejects.toThrow('stopped');
        store.locks.acquire = acquire;
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(true);
    });

    it('does not acquire when the signal is already aborted', async () => {
        const { store, vault } = setup();
        const controller = new AbortController();

        controller.abort(new Error('stopped'));
        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            signal: controller.signal,
        })).rejects.toThrow('stopped');
        expect(await store.connections.findOne('wa')).toBeUndefined();
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(true);
    });
});

describe('connection session', () => {
    it('writes sealed entries and reads them back', async () => {
        const { store, vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { creds: text('secret'), other: text('x') } });
        expect(decode(await session.readOne('creds'))).toBe('secret');
        expect(decode(await session.readOne('missing'))).toBeUndefined();

        const raw = await store.connections.findEntry('wa', 'creds');

        expect(Buffer.from(raw!).toString('utf8')).not.toContain('secret');

        await session.write({ delete: ['other'] });

        const found = await session.read(['creds', 'other']);

        expect(found.keys().toArray()).toEqual(['creds']);
        await session.write({ clear: true });
        expect((await session.read(['creds'])).size).toBe(0);
        await session.close();
    });

    it('renews the lease every ttl / 3 on the clock', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();
        const renewals: number[] = [];
        const renew = store.locks.renew.bind(store.locks);

        store.locks.renew = async (...args) => {
            renewals.push(clock.now().getTime());

            return renew(...args);
        };

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

        for (let i = 0; i < 4; i++) {
            clock.advance(1_000);
            await settle();
        }

        // the first renew confirms the lease before open returns
        expect(renewals).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(false);
        await session.write({ set: { a: text('1') } });
        await session.close();
        clock.advance(10_000);
        await settle();
        expect(renewals).toHaveLength(5);
    });

    it('uses a default lease ttl of 60 s', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();
        const ttls: number[] = [];
        const acquire = store.locks.acquire.bind(store.locks);

        store.locks.acquire = async (key, owner, ttlMs) => {
            ttls.push(ttlMs);

            return acquire(key, owner, ttlMs);
        };

        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        expect(DEFAULT_CONNECTION_LEASE_TTL_MS).toBe(60_000);
        expect(ttls).toEqual([60_000]);
        clock.advance(19_999);
        await settle();
        expect(await acquire('connection:wa', 'o2', 1_000)).toBe(false);
        await session.close();
    });

    it('a renew in flight while closing schedules no further renew', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();
        const renew = store.locks.renew.bind(store.locks);
        const gate = Promise.withResolvers<void>();
        let calls = 0;

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

        store.locks.renew = async (...args) => {
            calls++;
            await gate.promise;

            return renew(...args);
        };

        clock.advance(1_000);

        const closing = session.close();

        gate.resolve();
        await closing;
        await settle();
        clock.advance(10_000);
        await settle();
        expect(calls).toBe(1);
    });

    it('a failed renew resolves lost and refuses every later call', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();
        const owners = recordOwners(store);
        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

        await session.write({ set: { a: text('1') } });
        await store.locks.release('connection:wa', owners[0]!);
        clock.advance(1_000);

        const lost = await session.lost;

        expect(lost).toBeInstanceOf(LeaseLostError);
        expect(lost.lock).toBe('connection:wa');
        await expect(session.write({ set: { b: text('2') } })).rejects.toBeInstanceOf(LeaseLostError);
        await expect(session.read(['a'])).rejects.toBeInstanceOf(LeaseLostError);
        await expect(session.readOne('a')).rejects.toBeInstanceOf(LeaseLostError);
        await expect(session.flush()).rejects.toBeInstanceOf(LeaseLostError);
        await session.close();
    });

    it('a renew that throws is retried, not treated as lost', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();
        const renew = store.locks.renew.bind(store.locks);
        let failures = 1;

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

        store.locks.renew = async (...args) => {
            if (failures-- > 0) {
                throw new Error('store unavailable');
            }

            return renew(...args);
        };

        let lost = false;

        void session.lost.then(() => {
            lost = true; 
        });

        for (let i = 0; i < 3; i++) {
            clock.advance(1_000);
            await settle();
        }

        expect(lost).toBe(false);
        await session.write({ set: { a: text('1') } });
        await session.close();
    });

    it('renewals that keep throwing resolve lost at the last confirmed expiry and refuse reads and writes', async () => {
        const {
            clock,
            store,
            vault,
        } = setup();
        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

        await session.write({ set: { a: text('1') } });
        store.locks.renew = async () => {
            throw new Error('store unavailable');
        };

        let lost = false;

        void session.lost.then(() => {
            lost = true;
        });

        clock.advance(2_999);
        await settle();
        expect(lost).toBe(false);
        clock.advance(1);
        await settle();
        expect(lost).toBe(true);
        await expect(session.readOne('a')).rejects.toBeInstanceOf(LeaseLostError);
        await expect(session.write({ set: { b: text('2') } })).rejects.toBeInstanceOf(LeaseLostError);
        await session.close();
    });

    it('a renewal that never settles resolves lost at the last confirmed expiry', async () => {
        const {
            clock,
            store,
            vault,
        } = setup();
        const renew = store.locks.renew.bind(store.locks);
        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });
        let calls = 0;

        store.locks.renew = async (...args) => {
            calls++;

            // the second renew hangs: the first confirmed the lease until 1000 + 3000
            if (calls > 1) {
                return Promise.withResolvers<boolean>().promise;
            }

            return renew(...args);
        };

        clock.advance(1_000);
        await settle();
        clock.advance(2_999);
        await settle();
        expect(calls).toBe(2);
        await expect(session.readOne('a')).resolves.toBeUndefined();
        clock.advance(1);
        await expect(session.lost).resolves.toBeInstanceOf(LeaseLostError);
        await expect(session.read(['a'])).rejects.toBeInstanceOf(LeaseLostError);
        await session.close();
    });

    it('a write refused by the fence resolves lost', async () => {
        const { store, vault } = setup();
        const owners = recordOwners(store);
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await store.locks.release('connection:wa', owners[0]!);
        await store.locks.acquire('connection:wa', 'o2', 60_000);
        await expect(session.write({ set: { a: text('1') } })).rejects.toBeInstanceOf(LeaseLostError);
        await expect(session.lost).resolves.toBeInstanceOf(LeaseLostError);
        await expect(session.write({ set: { b: text('1') } })).rejects.toBeInstanceOf(LeaseLostError);
        expect(await store.connections.findEntry('wa', 'a')).toBeUndefined();
        await session.close();
        expect(await store.locks.acquire('connection:wa', 'o3', 1_000)).toBe(false);
    });

    it('serializes writes, and flush and reads wait for the accepted ones', async () => {
        const { store, vault } = setup();
        const { connections } = store;
        const original = connections.writeEntries.bind(connections);
        const gates: PromiseWithResolvers<void>[] = [];
        const events: string[] = [];

        connections.writeEntries = async (name: string, write: ConnectionEntryWrite, fence: ConnectionFence) => {
            const gate = Promise.withResolvers<void>();
            const index = gates.length;

            gates.push(gate);

            events.push(`start ${index}`);
            await gate.promise;
            await original(name, write, fence);
            events.push(`end ${index}`);
        };

        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const first = session.write({ set: { a: text('1') } });
        const second = session.write({ set: { a: text('2') } });
        let flushed = false;
        let read: string | undefined;
        const flush = session.flush().then(() => {
            flushed = true; 
        });
        const reading = session.readOne('a').then((value) => {
            read = decode(value); 
        });

        await settle();
        expect(events).toEqual(['start 0']);
        gates[0]!.resolve();
        await first;
        await settle();
        expect(events).toEqual(['start 0', 'end 0', 'start 1']);
        expect(flushed).toBe(false);
        expect(read).toBeUndefined();
        gates[1]!.resolve();
        await Promise.all([second, flush, reading]);
        expect(flushed).toBe(true);
        expect(read).toBe('2');
        await session.close();
    });

    it('a failed write rejects itself and the next flush, and later writes go on', async () => {
        const { store, vault } = setup();
        const { connections } = store;
        const original = connections.writeEntries.bind(connections);
        let fail = true;

        connections.writeEntries = async (...args) => {
            if (fail) {
                fail = false;

                throw new Error('store unavailable');
            }

            return original(...args);
        };

        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const failed = session.write({ set: { a: text('1') } });
        const next = session.write({ set: { b: text('2') } });

        await expect(failed).rejects.toThrow('store unavailable');
        await expect(next).resolves.toBeUndefined();
        await expect(session.flush()).rejects.toThrow('store unavailable');
        await expect(session.flush()).resolves.toBeUndefined();
        expect(decode(await session.readOne('b'))).toBe('2');
        await session.close();
    });

    it('refuses a malformed batch before queueing it', async () => {
        const { vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await expect(session.write({ set: { '': text('1') } })).rejects.toBeInstanceOf(ValidationError);
        await expect(session.flush()).resolves.toBeUndefined();
        await session.close();
    });

    it('close waits for pending writes, releases the lease and refuses later calls', async () => {
        const { store, vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const pending = session.write({ set: { a: text('1') } });
        const closing = session.close();

        await expect(session.write({ set: { b: text('2') } })).rejects.toBeInstanceOf(InvalidRunStateError);
        await pending;
        await closing;
        await expect(session.close()).resolves.toBeUndefined();
        await expect(session.read(['a'])).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(session.flush()).rejects.toBeInstanceOf(InvalidRunStateError);

        const other = await vault.open('wa', { type: 'whatsapp', owner: 'o2' });

        expect(decode(await other.readOne('a'))).toBe('1');
        await other.close();
        expect(await store.locks.acquire('connection:wa', 'o3', 1_000)).toBe(true);
    });

    it('round-trips the entry key __proto__', async () => {
        const { vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { ['__proto__']: text('p'), other: text('o') } });
        expect(decode(await session.readOne('__proto__'))).toBe('p');
        await session.write({ delete: ['__proto__'] });
        expect(await session.readOne('__proto__')).toBeUndefined();
        expect(decode(await session.readOne('other'))).toBe('o');
        await session.close();
    });

    it('refuses an entry key that is not well-formed UTF-16', async () => {
        const { vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await expect(session.write({ set: { '\ud800': text('1') } })).rejects.toBeInstanceOf(ValidationError);
        await expect(session.read(['\udc00'])).rejects.toBeInstanceOf(ValidationError);
        await session.close();
    });

    it('keeps the data key out of the enumerable and serialized session', async () => {
        const { store, keys } = setup();
        const keyring = createKeyring(keys);
        const unwrap = keyring.unwrap.bind(keyring);
        const unwrapped: Uint8Array[] = [];

        keyring.unwrap = (...args) => {
            const key = unwrap(...args);

            unwrapped.push(key);

            return key;
        };

        const vault = createConnectionVault({ store, keyring });
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const [dataKey] = unwrapped;
        const seen = new Set<unknown>();
        const reaches = (value: unknown): boolean => {
            if (value === dataKey) {
                return true;
            }

            if (typeof value !== 'object' || value === null || seen.has(value)) {
                return false;
            }

            seen.add(value);

            return Object.values(value).some((item) => reaches(item));
        };

        expect(dataKey).toBeInstanceOf(Uint8Array);
        expect(reaches(session)).toBe(false);
        expect(JSON.stringify(session)).not.toContain(JSON.stringify(dataKey));
        await session.close();
    });

    it('close keeps renewing while accepted writes drain, then stops and releases', async () => {
        const {
            clock,
            store,
            vault,
        } = setup();
        const { connections } = store;
        const original = connections!.writeEntries.bind(connections);
        const gate = Promise.withResolvers<void>();
        const renew = store.locks.renew.bind(store.locks);
        let renewals = 0;

        store.locks.renew = async (...args) => {
            renewals++;

            return renew(...args);
        };

        connections!.writeEntries = async (...args) => {
            await gate.promise;

            return original(...args);
        };

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });
        const pending = session.write({ set: { a: text('1') } });
        const closing = session.close();

        for (let i = 0; i < 6; i++) {
            clock.advance(1_000);
            await settle();
        }

        expect(renewals).toBe(7);
        gate.resolve();
        await expect(pending).resolves.toBeUndefined();
        await closing;
        clock.advance(10_000);
        await settle();
        expect(renewals).toBe(7);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(true);
        expect(await connections!.findEntry('wa', 'a')).toBeInstanceOf(Uint8Array);
    });

    it('a read whose entry lookup outlasts the start of close reports the close, not a decryption failure', async () => {
        const { store, vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { a: text('1') } });

        const { connections } = store;
        const findEntries = connections!.findEntries.bind(connections);
        const gate = Promise.withResolvers<void>();

        connections!.findEntries = async (...args) => {
            await gate.promise;

            return findEntries(...args);
        };

        const reading = session.readOne('a');

        await settle();
        await session.close();
        gate.resolve();
        await expect(reading).rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('each session leases under its own owner token: an expired session of the same owner cannot write under the next one', async () => {
        const {
            clock,
            store,
            vault,
            keys,
        } = setup();
        const owners = recordOwners(store);
        // the first session's renewals never run: its lease expires on the store's clock
        const stalled = createConnectionVault({
            store,
            keyring: createKeyring(keys),
            clock: new ControllableClock(),
        });

        await (await vault.open('wa', { type: 'whatsapp', owner: 'o1' })).close();

        const first = await stalled.open('wb', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 1_000,
        });

        clock.advance(1_000);

        const second = await vault.open('wb', { type: 'whatsapp', owner: 'o1' });

        expect(owners).toHaveLength(3);
        expect(new Set(owners).size).toBe(3);

        for (const owner of owners) {
            expect(owner.startsWith('o1:')).toBe(true);
        }

        await expect(first.write({ set: { late: text('1') } })).rejects.toBeInstanceOf(LeaseLostError);
        expect(await store.connections.findEntry('wb', 'late')).toBeUndefined();
        await first.close();
        // the first session's close does not release the second's lease
        expect(await store.locks.acquire('connection:wb', 'o2', 1_000)).toBe(false);
        await second.close();
    });

    it('recreate replaces a connection whose data key cannot be unwrapped, under the lease', async () => {
        const { store, vault } = setup([masterKey('k1')]);
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { creds: text('secret') } });
        await session.close();

        const before = await store.connections.findOneOrFail('wa');
        const lost = createConnectionVault({ store, keyring: createKeyring([masterKey('k2')]) });

        await expect(lost.open('wa', { type: 'whatsapp', owner: 'o2' })).rejects.toBeInstanceOf(DecryptionFailedError);

        const fresh = await lost.open('wa', {
            type: 'whatsapp',
            owner: 'o2',
            recreate: true,
        });
        const after = await store.connections.findOneOrFail('wa');

        expect(after.keyId).toBe('k2');
        expect(Buffer.from(after.wrappedKey).equals(Buffer.from(before.wrappedKey))).toBe(false);
        expect(await fresh.readOne('creds')).toBeUndefined();
        await fresh.write({ set: { creds: text('new') } });
        await fresh.close();

        const reopened = await lost.open('wa', { type: 'whatsapp', owner: 'o3' });

        expect(decode(await reopened.readOne('creds'))).toBe('new');
        await reopened.close();
    });

    it('recreate replaces a connection of another type; held elsewhere it deletes nothing', async () => {
        const { store, vault } = setup();
        const session = await vault.open('wa', { type: 'telegram', owner: 'o1' });

        await session.write({ set: { a: text('1') } });

        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'o2',
            recreate: true,
        })).rejects.toBeInstanceOf(ConnectionHeldError);
        expect((await store.connections.findOneOrFail('wa')).type).toBe('telegram');
        expect(decode(await session.readOne('a'))).toBe('1');
        await session.close();

        const fresh = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o2',
            recreate: true,
        });

        expect((await store.connections.findOneOrFail('wa')).type).toBe('whatsapp');
        expect(await store.connections.findEntry('wa', 'a')).toBeUndefined();
        await fresh.close();
    });

    it('recreate after the lease expired is refused and deletes nothing of the next holder', async () => {
        const {
            clock, 
            store, 
            vault, 
        } = setup();
        const initial = await vault.open('wa', { type: 'whatsapp', owner: 'o0' });

        await initial.write({ set: { creds: text('old') } });
        await initial.close();

        const acquire = store.locks.acquire.bind(store.locks);
        let second: Awaited<ReturnType<typeof vault.open>> | undefined;
        let stalled = false;

        // opener A stalls right after acquiring: its lease expires, B opens and writes meanwhile
        store.locks.acquire = async (key, owner, ttlMs) => {
            const acquired = await acquire(key, owner, ttlMs);

            if (!stalled && owner.startsWith('a:')) {
                stalled = true;
                clock.advance(3_000);
                second = await vault.open('wa', { type: 'whatsapp', owner: 'b' });
                await second.write({ set: { creds: text('new') } });
                await second.flush();
            }

            return acquired;
        };

        const before = await store.connections.findOneOrFail('wa');

        await expect(vault.open('wa', {
            type: 'whatsapp',
            owner: 'a',
            leaseTtlMs: 3_000,
            recreate: true,
        })).rejects.toBeInstanceOf(LeaseLostError);

        const after = await store.connections.findOneOrFail('wa');

        expect(after.keyId).toBe(before.keyId);
        expect(Buffer.from(after.wrappedKey).equals(Buffer.from(before.wrappedKey))).toBe(true);
        expect(decode(await second!.readOne('creds'))).toBe('new');
        await second!.close();
    });

    it('recreate refuses an invalid replacement type before deleting anything', async () => {
        const { store, vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { creds: text('secret') } });
        await session.close();

        const before = await store.connections.findOneOrFail('wa');

        await expect(vault.open('wa', {
            type: '\ud800',
            owner: 'o2',
            recreate: true,
        })).rejects.toBeInstanceOf(ValidationError);
        expect(await store.connections.findOneOrFail('wa')).toEqual(before);

        const reopened = await vault.open('wa', { type: 'whatsapp', owner: 'o3' });

        expect(decode(await reopened.readOne('creds'))).toBe('secret');
        await reopened.close();
    });

    it('restart: a new vault over the same store reads the same plaintext', async () => {
        const {
            store, 
            vault, 
            keys, 
        } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { creds: text('secret') } });
        await session.close();

        const copied = keys.map((entry) => ({ id: entry.id, key: new Uint8Array(entry.key) }));
        const restarted = createConnectionVault({ store, keyring: createKeyring(copied) });
        const reopened = await restarted.open('wa', { type: 'whatsapp', owner: 'o2' });

        expect(decode(await reopened.readOne('creds'))).toBe('secret');
        await reopened.close();
    });

    it('an entry copied to another key or connection fails to open', async () => {
        const { store, vault } = setup();
        const owners = recordOwners(store);
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const fence = { lock: 'connection:wa', owner: owners[0]! };

        await session.write({ set: { a: text('secret') } });

        const sealed = (await store.connections.findEntry('wa', 'a'))!;

        await store.connections.writeEntries('wa', { set: { b: sealed } }, fence);
        await expect(session.readOne('b')).rejects.toBeInstanceOf(DecryptionFailedError);
        await session.close();

        const other = await vault.open('wb', { type: 'whatsapp', owner: 'o1' });

        await store.connections.writeEntries('wb', { set: { a: sealed } }, { lock: 'connection:wb', owner: owners[1]! });
        await expect(other.readOne('a')).rejects.toBeInstanceOf(DecryptionFailedError);
        await other.close();
    });

    it('a rotated keyring [k2, k1] opens a k1 connection; [k2] alone names k1 and releases', async () => {
        const k1 = masterKey('k1');
        const { store, vault } = setup([k1]);
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await session.write({ set: { creds: text('secret') } });
        await session.close();

        const k2 = masterKey('k2');
        const wrong = createConnectionVault({ store, keyring: createKeyring([k2]) });
        const failure = wrong.open('wa', { type: 'whatsapp', owner: 'o2' });

        await expect(failure).rejects.toBeInstanceOf(DecryptionFailedError);
        await expect(failure).rejects.toThrow('"k1"');

        const message = await failure.catch((error: Error) => error.message);

        for (const secret of [k1.key, k2.key]) {
            expect(message).not.toContain(Buffer.from(secret).toString('base64'));
        }

        const rotated = createConnectionVault({ store, keyring: createKeyring([k2, k1]) });
        const reopened = await rotated.open('wa', { type: 'whatsapp', owner: 'o2' });

        expect(decode(await reopened.readOne('creds'))).toBe('secret');
        expect((await store.connections.findOneOrFail('wa')).keyId).toBe('k1');
        await reopened.close();
    });
});
