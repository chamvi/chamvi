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
            leaseTtlMs: 0,
        })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
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

        expect(renewals).toEqual([1_000, 2_000, 3_000, 4_000]);
        expect(await store.locks.acquire('connection:wa', 'o2', 1_000)).toBe(false);
        await session.write({ set: { a: text('1') } });
        await session.close();
        clock.advance(10_000);
        await settle();
        expect(renewals).toHaveLength(4);
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

        store.locks.renew = async (...args) => {
            calls++;
            await gate.promise;

            return renew(...args);
        };

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

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
        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });

        await session.write({ set: { a: text('1') } });
        await store.locks.release('connection:wa', 'o1');
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

        store.locks.renew = async (...args) => {
            if (failures-- > 0) {
                throw new Error('store unavailable');
            }

            return renew(...args);
        };

        const session = await vault.open('wa', {
            type: 'whatsapp',
            owner: 'o1',
            leaseTtlMs: 3_000,
        });
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

    it('a write refused by the fence resolves lost', async () => {
        const { store, vault } = setup();
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });

        await store.locks.release('connection:wa', 'o1');
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
        const session = await vault.open('wa', { type: 'whatsapp', owner: 'o1' });
        const fence = { lock: 'connection:wa', owner: 'o1' };

        await session.write({ set: { a: text('secret') } });

        const sealed = (await store.connections.findEntry('wa', 'a'))!;

        await store.connections.writeEntries('wa', { set: { b: sealed } }, fence);
        await expect(session.readOne('b')).rejects.toBeInstanceOf(DecryptionFailedError);
        await session.close();

        const other = await vault.open('wb', { type: 'whatsapp', owner: 'o1' });

        await store.connections.writeEntries('wb', { set: { a: sealed } }, { lock: 'connection:wb', owner: 'o1' });
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
