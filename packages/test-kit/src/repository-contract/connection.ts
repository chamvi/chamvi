/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import {
    ConnectionChangedError,
    LeaseLostError,
    RepositoryNotFoundError,
    ValidationError,
} from '@chamvi/core';
import type { ConnectionConfigWrite, ConnectionEntryWrite, IStore } from '@chamvi/core';
import type { ControllableClock } from '../clock/index.ts';
import { makeConnection } from './helpers.ts';

type Setup = () => Promise<{ clock: ControllableClock; store: IStore }>;

const bytes = (...values: number[]) => new Uint8Array(values);

/** Plain Uint8Array copies of a findEntries result, for equality checks. */
const plain = (entries: Map<string, Uint8Array>) => Object.fromEntries(
    [...entries].map(([key, value]) => [key, Array.from(value)]),
);

/**
 * The `IStore.connections` part of the repository contract. A store without
 * the optional capability skips every case.
 */
export function describeConnectionContract(setup: Setup): void {
    const prepare = async (skip: (note: string) => never) => {
        const { clock, store } = await setup();

        if (!store.connections) {
            return skip('the store has no connections repository');
        }

        const { connections } = store;
        const hold = async (name: string, owner = 'o1', ttlMs = 1_000) => {
            const lock = `connection:${name}`;

            expect(await store.locks.acquire(lock, owner, ttlMs)).toBe(true);

            return { lock, owner };
        };

        return {
            clock,
            store,
            connections,
            hold,
        };
    };

    it('connections.insert inserts only when the name is absent, also under concurrency', async ({ skip }) => {
        const { connections } = await prepare(skip);

        expect(await connections.findOne('wa')).toBeUndefined();
        await expect(connections.findOneOrFail('wa')).rejects.toBeInstanceOf(RepositoryNotFoundError);
        expect(await connections.find()).toEqual([]);
        expect(await connections.insert(makeConnection('wa'))).toBe(true);
        expect(await connections.insert(makeConnection('wa', { type: 'other', keyId: 'k2' }))).toBe(false);
        expect(await connections.findOneOrFail('wa')).toEqual(makeConnection('wa'));

        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) => connections.insert(makeConnection('race', { keyId: `k${i}` }))),
        );

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await connections.find()).map((c) => c.name)).toEqual(['race', 'wa']);
    });

    it('connections.find orders by name code point', async ({ skip }) => {
        const { connections } = await prepare(skip);

        for (const name of ['b', 'a-b', 'a', 'a0']) {
            await connections.insert(makeConnection(name));
        }

        expect((await connections.find()).map((c) => c.name)).toEqual(['a', 'a-b', 'a0', 'b']);
    });

    it('connections.insert refuses an invalid name, type or key id with ValidationError', async ({ skip }) => {
        const { connections } = await prepare(skip);

        for (const connection of [
            makeConnection('Bad'),
            makeConnection('a'.repeat(65)),
            makeConnection('ok', { type: '' }),
            makeConnection('ok', { type: 'x'.repeat(65) }),
            makeConnection('ok', { keyId: '' }),
            makeConnection('ok', { wrappedKey: 'nope' as unknown as Uint8Array }),
        ]) {
            await expect(connections.insert(connection)).rejects.toBeInstanceOf(ValidationError);
        }

        expect(await connections.find()).toEqual([]);
    });

    it('connections.writeEntries applies clear, then set, then delete in one batch', async ({ skip }) => {
        const {
            clock, 
            connections, 
            hold, 
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa');

        clock.advance(10);
        await connections.writeEntries('wa', { set: { old: bytes(9), keep: bytes(8) } }, fence);
        expect(plain(await connections.findEntries('wa', ['old', 'keep', 'absent']))).toEqual({ old: [9], keep: [8] });
        await connections.writeEntries('wa', {
            clear: true,
            set: { a: bytes(1), b: bytes(2) },
            delete: ['b'],
        }, fence);
        expect(plain(await connections.findEntries('wa', ['a', 'b', 'old', 'keep']))).toEqual({ a: [1] });
        expect(await connections.findEntry('wa', 'b')).toBeUndefined();
        expect(Array.from((await connections.findEntry('wa', 'a'))!)).toEqual([1]);
        expect((await connections.findEntries('wa', [])).size).toBe(0);

        await connections.writeEntries('wa', { set: { a: bytes(3) }, delete: ['absent'] }, fence);
        expect(Array.from((await connections.findEntry('wa', 'a'))!)).toEqual([3]);
        await connections.writeEntries('wa', {}, fence);
        expect(plain(await connections.findEntries('wa', ['a']))).toEqual({ a: [3] });
    });

    it('connections.writeEntries bumps updatedAt and keeps createdAt', async ({ skip }) => {
        const {
            clock, 
            connections, 
            hold, 
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 60_000);

        clock.advance(5_000);
        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        const stored = await connections.findOneOrFail('wa');

        expect(stored.createdAt).toEqual(new Date(1_000));
        expect(stored.updatedAt).toEqual(clock.now());
    });

    it('connections.writeEntries with an expired fence throws LeaseLostError and writes nothing', async ({ skip }) => {
        const {
            clock, 
            connections, 
            hold, 
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        clock.advance(500);
        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        clock.advance(500);
        await expect(connections.writeEntries('wa', { clear: true, set: { b: bytes(2) } }, fence))
            .rejects.toBeInstanceOf(LeaseLostError);
        expect(plain(await connections.findEntries('wa', ['a', 'b']))).toEqual({ a: [1] });
        expect((await connections.findOneOrFail('wa')).updatedAt).toEqual(new Date(500));
    });

    it('connections.writeEntries with another owner\'s, a released or a taken-over fence writes nothing', async ({ skip }) => {
        const {
            clock, 
            store, 
            connections, 
            hold, 
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        await expect(connections.writeEntries('wa', { set: { a: bytes(1) } }, { lock: fence.lock, owner: 'o2' }))
            .rejects.toBeInstanceOf(LeaseLostError);
        await expect(connections.writeEntries('wa', { set: { a: bytes(1) } }, { lock: 'connection:other', owner: 'o1' }))
            .rejects.toBeInstanceOf(LeaseLostError);
        clock.advance(1_000);

        const taken = await hold('wa', 'o2', 1_000);

        await expect(connections.writeEntries('wa', { set: { a: bytes(1) } }, fence))
            .rejects.toBeInstanceOf(LeaseLostError);
        await connections.writeEntries('wa', { set: { b: bytes(2) } }, taken);
        await store.locks.release(taken.lock, taken.owner);
        await expect(connections.writeEntries('wa', { set: { c: bytes(3) } }, taken))
            .rejects.toBeInstanceOf(LeaseLostError);
        expect(plain(await connections.findEntries('wa', ['a', 'b', 'c']))).toEqual({ b: [2] });
    });

    it('connections.writeEntries refuses a lease of another lock the owner holds, writing nothing', async ({ skip }) => {
        const { store, connections } = await prepare(skip);

        await connections.insert(makeConnection('wa'));
        expect(await store.locks.acquire('agents:wa', 'o1', 1_000)).toBe(true);
        expect(await store.locks.acquire('connection:other', 'o1', 1_000)).toBe(true);

        for (const lock of ['agents:wa', 'connection:other']) {
            await expect(connections.writeEntries('wa', { set: { a: bytes(1) } }, { lock, owner: 'o1' }))
                .rejects.toBeInstanceOf(LeaseLostError);
        }

        expect(await connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('a write that fails validation anywhere in the batch writes nothing', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa');

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        const writes: ConnectionEntryWrite[] = [
            { clear: true, set: { b: bytes(2), ['x'.repeat(256)]: bytes(3) } },
            { clear: true, set: { b: bytes(2), 'a\0b': bytes(3) } },
            { clear: true, set: { b: bytes(2), '': bytes(3) } },
            // a lone surrogate: Postgres would store U+FFFD, merging distinct keys
            { clear: true, set: { b: bytes(2), '\ud800': bytes(3) } },
            {
                clear: true,
                set: { b: bytes(2) },
                delete: ['\udc00'],
            },
            { clear: true, set: { b: bytes(2), c: 'nope' as unknown as Uint8Array } },
            {
                clear: true, 
                set: { b: bytes(2) }, 
                delete: ['ok', 'x'.repeat(256)], 
            },
        ];

        for (const write of writes) {
            await expect(connections.writeEntries('wa', write, fence)).rejects.toBeInstanceOf(ValidationError);
        }

        expect(plain(await connections.findEntries('wa', ['a', 'b']))).toEqual({ a: [1] });
        await expect(connections.findEntries('wa', ['a', 'x'.repeat(256)])).rejects.toBeInstanceOf(ValidationError);
        await expect(connections.findEntry('wa', '')).rejects.toBeInstanceOf(ValidationError);
        await expect(connections.findEntries('wa', ['a', 'x\ud800'])).rejects.toBeInstanceOf(ValidationError);
        await expect(connections.findEntry('wa', '\udc00')).rejects.toBeInstanceOf(ValidationError);
    });

    it('connections.delete removes the connection with its entries and ignores a missing one', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);

        await connections.insert(makeConnection('wa'));
        await connections.insert(makeConnection('other'));

        const fence = await hold('wa');

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        await connections.delete('wa');
        await expect(connections.delete('missing')).resolves.toBeUndefined();
        expect((await connections.find()).map((c) => c.name)).toEqual(['other']);
        await expect(connections.findEntry('wa', 'a')).rejects.toBeInstanceOf(RepositoryNotFoundError);
        await connections.insert(makeConnection('wa'));
        expect((await connections.findEntries('wa', ['a'])).size).toBe(0);
    });

    it('connections.delete with a fence deletes only under the held lease of that connection', async ({ skip }) => {
        const {
            clock,
            store,
            connections,
            hold,
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        expect(await store.locks.acquire('connection:other', 'o1', 1_000)).toBe(true);

        for (const refused of [{ lock: fence.lock, owner: 'o2' }, { lock: 'connection:other', owner: 'o1' }]) {
            await expect(connections.delete('wa', refused)).rejects.toBeInstanceOf(LeaseLostError);
        }

        clock.advance(1_000);
        await expect(connections.delete('wa', fence)).rejects.toBeInstanceOf(LeaseLostError);

        // a new holder took over: the stalled owner's delete removes nothing of its
        const taken = await hold('wa', 'o2', 1_000);

        await expect(connections.delete('wa', fence)).rejects.toBeInstanceOf(LeaseLostError);
        expect(await connections.findOne('wa')).toBeDefined();
        expect(plain(await connections.findEntries('wa', ['a']))).toEqual({ a: [1] });

        await connections.delete('wa', taken);
        expect(await connections.findOne('wa')).toBeUndefined();
        await expect(connections.delete('missing', await hold('missing'))).resolves.toBeUndefined();
    });

    it('connections.replace swaps the connection, drops its entries and inserts an absent one, under the fence', async ({ skip }) => {
        const {
            clock,
            connections,
            hold,
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));
        await connections.insert(makeConnection('other'));

        const fence = await hold('wa');
        const other = await hold('other');

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        await connections.writeEntries('other', { set: { a: bytes(2) } }, other);
        clock.advance(10);

        const replacement = makeConnection('wa', {
            type: 'telegram',
            keyId: 'k2',
            wrappedKey: bytes(7),
            createdAt: new Date(1_010),
            updatedAt: new Date(1_010),
        });

        await connections.replace(replacement, fence);
        expect(await connections.findOneOrFail('wa')).toEqual(replacement);
        expect((await connections.findEntries('wa', ['a'])).size).toBe(0);
        expect(plain(await connections.findEntries('other', ['a']))).toEqual({ a: [2] });

        const absent = await hold('fresh');

        await connections.replace(makeConnection('fresh'), absent);
        expect(await connections.findOneOrFail('fresh')).toEqual(makeConnection('fresh'));
    });

    it('connections.replace with an expired, another owner\'s or another lock\'s fence throws LeaseLostError and changes nothing', async ({ skip }) => {
        const {
            clock,
            store,
            connections,
            hold,
        } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        expect(await store.locks.acquire('connection:other', 'o1', 1_000)).toBe(true);

        const replacement = makeConnection('wa', { type: 'telegram', keyId: 'k2' });

        for (const refused of [{ lock: fence.lock, owner: 'o2' }, { lock: 'connection:other', owner: 'o1' }]) {
            await expect(connections.replace(replacement, refused)).rejects.toBeInstanceOf(LeaseLostError);
        }

        await expect(connections.replace(makeConnection('fresh'), fence)).rejects.toBeInstanceOf(LeaseLostError);
        clock.advance(1_000);
        await expect(connections.replace(replacement, fence)).rejects.toBeInstanceOf(LeaseLostError);

        // a new holder took over: the stalled owner's replace deletes nothing of its
        const taken = await hold('wa', 'o2', 1_000);

        await connections.writeEntries('wa', { set: { b: bytes(2) } }, taken);
        await expect(connections.replace(replacement, fence)).rejects.toBeInstanceOf(LeaseLostError);
        expect(await connections.findOneOrFail('wa')).toEqual({ ...makeConnection('wa'), updatedAt: clock.now() });
        expect(plain(await connections.findEntries('wa', ['a', 'b']))).toEqual({ a: [1], b: [2] });
        expect(await connections.findOne('fresh')).toBeUndefined();
    });

    it('connections.replace refuses an invalid replacement with ValidationError and changes nothing', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa');

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        const before = await connections.findOneOrFail('wa');

        for (const connection of [
            makeConnection('wa', { type: '\ud800' }),
            makeConnection('wa', { type: 'a\0b' }),
            makeConnection('wa', { type: 'x'.repeat(65) }),
            makeConnection('wa', { keyId: '' }),
            makeConnection('wa', { wrappedKey: 'nope' as unknown as Uint8Array }),
            makeConnection('wa', { createdAt: new Date(NaN) }),
        ]) {
            await expect(connections.replace(connection, fence)).rejects.toBeInstanceOf(ValidationError);
        }

        await expect(connections.replace(makeConnection('Bad'), { lock: 'connection:Bad', owner: 'o1' }))
            .rejects.toBeInstanceOf(ValidationError);
        expect(await connections.findOneOrFail('wa')).toEqual(before);
        expect(plain(await connections.findEntries('wa', ['a']))).toEqual({ a: [1] });
    });

    it('entry calls on an unknown connection throw RepositoryNotFoundError', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);
        const fence = await hold('missing');

        await expect(connections.findEntry('missing', 'a')).rejects.toBeInstanceOf(RepositoryNotFoundError);
        await expect(connections.findEntries('missing', ['a'])).rejects.toBeInstanceOf(RepositoryNotFoundError);
        await expect(connections.writeEntries('missing', { set: { a: bytes(1) } }, fence))
            .rejects.toBeInstanceOf(RepositoryNotFoundError);
    });

    it('connections and entries are copied in and out as plain Uint8Arrays', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);
        const connection = makeConnection('wa');

        await connections.insert(connection);
        connection.wrappedKey[0] = 99;
        connection.createdAt.setTime(0);
        connection.type = 'evil';

        const found = await connections.findOneOrFail('wa');

        expect(found).toEqual(makeConnection('wa'));
        expect(Object.getPrototypeOf(found.wrappedKey)).toBe(Uint8Array.prototype);
        found.wrappedKey[0] = 99;
        found.updatedAt.setTime(0);

        const [listed] = await connections.find();

        expect(listed).toEqual(makeConnection('wa'));
        listed!.wrappedKey[0] = 99;
        expect(await connections.findOne('wa')).toEqual(makeConnection('wa'));

        const fence = await hold('wa');
        const value = bytes(1, 2);
        const set = { a: value };

        await connections.writeEntries('wa', { set }, fence);
        value[0] = 99;
        set.a = bytes(7);

        const read = (await connections.findEntry('wa', 'a'))!;

        expect(Object.getPrototypeOf(read)).toBe(Uint8Array.prototype);
        expect(Array.from(read)).toEqual([1, 2]);
        read[0] = 99;

        const map = await connections.findEntries('wa', ['a']);

        expect(Object.getPrototypeOf(map.get('a'))).toBe(Uint8Array.prototype);
        expect(Array.from(map.get('a')!)).toEqual([1, 2]);
        map.get('a')![0] = 99;
        expect(Array.from((await connections.findEntry('wa', 'a'))!)).toEqual([1, 2]);
    });

    it('stores an empty value and large batches', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa');
        const set = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`key:${i}`, bytes(i % 256)]));

        await connections.writeEntries('wa', { set: { ...set, empty: new Uint8Array(0) } }, fence);

        const keys = Object.keys(set);
        const found = await connections.findEntries('wa', [...keys, 'empty']);

        expect(found.size).toBe(301);
        expect(found.get('empty')!.length).toBe(0);
        expect(Array.from(found.get('key:299')!)).toEqual([299 % 256]);
    });

    it('round-trips settings and secrets and bumps the revision', async ({ skip }) => {
        const { clock, connections } = await prepare(skip);
        const key = makeConnection('wa').wrappedKey;

        expect(await connections.findConfig('wa')).toBeUndefined();
        await connections.insert(makeConnection('wa'));
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
        });

        clock.advance(10);
        expect(await connections.writeConfig('wa', {
            settings: {
                host: 'imap.example', 
                port: 993, 
                nested: { tls: true, list: ['a'] }, 
            },
            setSecrets: { password: bytes(1, 2), token: bytes(3) },
        }, key)).toBe(1);

        const first = (await connections.findConfig('wa'))!;

        expect(first.settings).toEqual({
            host: 'imap.example', 
            port: 993, 
            nested: { tls: true, list: ['a'] }, 
        });
        expect(plain(first.secrets)).toEqual({ password: [1, 2], token: [3] });
        expect(first.revision).toBe(1);
        expect((await connections.findOneOrFail('wa')).updatedAt).toEqual(clock.now());

        // settings replace the stored ones as a whole, absent settings keep them; a clear beats a set of one field
        expect(await connections.writeConfig('wa', {
            setSecrets: { password: bytes(9), both: bytes(8) },
            clearSecrets: ['token', 'both', 'absent'],
        }, key)).toBe(2);

        const second = (await connections.findConfig('wa'))!;

        expect(second.settings).toEqual(first.settings);
        expect(plain(second.secrets)).toEqual({ password: [9] });
        expect(await connections.writeConfig('wa', { settings: { host: 'other' } }, key)).toBe(3);
        expect(await connections.findConfig('wa')).toMatchObject({ settings: { host: 'other' }, revision: 3 });
        expect(await connections.writeConfig('wa', {}, key)).toBe(4);
    });

    it('writes config with no lease held', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);
        const key = makeConnection('wa').wrappedKey;

        await connections.insert(makeConnection('wa'));
        expect(await connections.writeConfig('wa', { settings: { a: 1 } }, key)).toBe(1);

        // and while another process's session holds the lease
        await hold('wa', 'session', 60_000);
        expect(await connections.writeConfig('wa', { setSecrets: { s: bytes(1) } }, key)).toBe(2);
        expect(plain((await connections.findConfig('wa'))!.secrets)).toEqual({ s: [1] });
    });

    it('leaves entries untouched', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);
        const stored = makeConnection('wa');

        await connections.insert(stored);

        const fence = await hold('wa', 'session', 60_000);

        await connections.writeEntries('wa', { set: { creds: bytes(1), same: bytes(2) } }, fence);
        await connections.writeConfig('wa', {
            settings: { creds: 'not-an-entry' },
            setSecrets: { same: bytes(9) },
            clearSecrets: ['creds'],
        }, stored.wrappedKey);

        expect(plain(await connections.findEntries('wa', ['creds', 'same']))).toEqual({ creds: [1], same: [2] });
        expect(await connections.findOneOrFail('wa')).toMatchObject({
            keyId: stored.keyId,
            wrappedKey: stored.wrappedKey,
        });

        // an entry clear leaves the secrets too
        await connections.writeEntries('wa', { clear: true }, fence);
        expect(plain((await connections.findConfig('wa'))!.secrets)).toEqual({ same: [9] });
    });

    it('refuses a stale wrapped key with ConnectionChangedError and writes nothing', async ({ skip }) => {
        const { connections } = await prepare(skip);
        const key = bytes(1, 2, 3, 4);

        await connections.insert(makeConnection('wa', { wrappedKey: key }));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, key);

        const before = await connections.findOneOrFail('wa');

        for (const stale of [bytes(1, 2, 3, 5), bytes(1, 2, 3), bytes(1, 2, 3, 4, 0), new Uint8Array(0)]) {
            await expect(connections.writeConfig('wa', {
                settings: { a: 2 },
                setSecrets: { s: bytes(8) },
                clearSecrets: ['s'],
            }, stale)).rejects.toBeInstanceOf(ConnectionChangedError);
        }

        const config = (await connections.findConfig('wa'))!;

        expect(config.settings).toEqual({ a: 1 });
        expect(plain(config.secrets)).toEqual({ s: [7] });
        expect(config.revision).toBe(1);
        expect(await connections.findOneOrFail('wa')).toEqual(before);
    });

    it('absent connection is RepositoryNotFoundError', async ({ skip }) => {
        const { connections } = await prepare(skip);

        await expect(connections.writeConfig('missing', { settings: {} }, bytes(1)))
            .rejects.toBeInstanceOf(RepositoryNotFoundError);
        expect(await connections.findConfig('missing')).toBeUndefined();
    });

    it('refuses a malformed config write with ValidationError and writes nothing', async ({ skip }) => {
        const { connections } = await prepare(skip);
        const key = makeConnection('wa').wrappedKey;

        await connections.insert(makeConnection('wa'));

        const writes = [
            'nope',
            { settings: ['a'] },
            { settings: 'a' },
            { settings: { a: 1 }, setSecrets: 'a' },
            { settings: { a: 1 }, setSecrets: { s: 'plain' } },
            { settings: { a: 1 }, setSecrets: { '': bytes(1) } },
            { settings: { a: 1 }, setSecrets: { ['x'.repeat(65)]: bytes(1) } },
            { settings: { a: 1 }, setSecrets: { 'a\0b': bytes(1) } },
            { settings: { a: 1 }, setSecrets: { '\ud800': bytes(1) } },
            { settings: { a: 1 }, clearSecrets: 'a' },
            { settings: { a: 1 }, clearSecrets: ['x'.repeat(65)] },
        ] as unknown as ConnectionConfigWrite[];

        for (const write of writes) {
            await expect(connections.writeConfig('wa', write, key)).rejects.toBeInstanceOf(ValidationError);
        }

        await expect(connections.writeConfig('wa', {}, 'nope' as unknown as Uint8Array))
            .rejects.toBeInstanceOf(ValidationError);
        await expect(connections.writeConfig('Bad', {}, key)).rejects.toBeInstanceOf(ValidationError);
        await expect(connections.findConfig('Bad')).rejects.toBeInstanceOf(ValidationError);
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
        });
    });

    it('replace keeps settings and drops secrets', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);
        const key = makeConnection('wa').wrappedKey;

        await connections.insert(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, key);

        const replacement = makeConnection('wa', { wrappedKey: bytes(7, 7) });

        await connections.replace(replacement, await hold('wa'));

        expect(await connections.findConfig('wa')).toEqual({
            keyId: replacement.keyId,
            wrappedKey: replacement.wrappedKey,
            settings: { a: 1 },
            secrets: new Map(),
            revision: 1,
        });
        expect(await connections.findOneOrFail('wa')).toEqual(replacement);
        // the replaced key is stale now, the replacement's is current
        await expect(connections.writeConfig('wa', { settings: {} }, key)).rejects.toBeInstanceOf(ConnectionChangedError);
        expect(await connections.writeConfig('wa', { setSecrets: { s: bytes(1) } }, replacement.wrappedKey)).toBe(2);

        const absent = await hold('fresh');

        await connections.replace(makeConnection('fresh'), absent);
        expect(await connections.findConfig('fresh')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
        });
    });

    it('a delete removes the config with the connection', async ({ skip }) => {
        const { connections } = await prepare(skip);
        const key = makeConnection('wa').wrappedKey;

        await connections.insert(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, key);
        await connections.delete('wa');
        expect(await connections.findConfig('wa')).toBeUndefined();
        await connections.insert(makeConnection('wa'));
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
        });
    });

    it('findConfig reads the key with the config, the replacement\'s after a replace', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);
        const stored = makeConnection('wa', { keyId: 'k1', wrappedKey: bytes(1, 2) });

        await connections.insert(stored);
        stored.wrappedKey[0] = 99;

        const first = (await connections.findConfig('wa'))!;

        expect(first.keyId).toBe('k1');
        expect(Object.getPrototypeOf(first.wrappedKey)).toBe(Uint8Array.prototype);
        expect(Array.from(first.wrappedKey)).toEqual([1, 2]);
        first.wrappedKey[0] = 99;
        expect(Array.from((await connections.findConfig('wa'))!.wrappedKey)).toEqual([1, 2]);

        await connections.replace(makeConnection('wa', { keyId: 'k2', wrappedKey: bytes(7, 7) }), await hold('wa'));

        const replaced = (await connections.findConfig('wa'))!;

        expect(replaced.keyId).toBe('k2');
        expect(Array.from(replaced.wrappedKey)).toEqual([7, 7]);
    });

    it('copies secrets in and out', async ({ skip }) => {
        const { connections } = await prepare(skip);
        const key = bytes(1, 2, 3);

        await connections.insert(makeConnection('wa', { wrappedKey: bytes(1, 2, 3) }));

        const secret = bytes(1, 2);
        const settings = { nested: { a: 1 } };

        await connections.writeConfig('wa', { settings, setSecrets: { s: secret, empty: new Uint8Array(0) } }, key);
        secret[0] = 99;
        settings.nested.a = 99;

        const read = (await connections.findConfig('wa'))!;

        expect(Object.getPrototypeOf(read.secrets.get('s'))).toBe(Uint8Array.prototype);
        expect(Array.from(read.secrets.get('s')!)).toEqual([1, 2]);
        expect(read.secrets.get('empty')!.length).toBe(0);
        expect(read.settings).toEqual({ nested: { a: 1 } });
        read.secrets.get('s')![0] = 99;
        (read.settings.nested as { a: number }).a = 99;

        const again = (await connections.findConfig('wa'))!;

        expect(Array.from(again.secrets.get('s')!)).toEqual([1, 2]);
        expect(again.settings).toEqual({ nested: { a: 1 } });
    });
}
