/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ConnectionInput } from '@chamvi/store';
import { MemoryConnectionRepository, MemoryLockRepository, MemoryRegistry } from '@chamvi/store-memory';
import {
    ConnectionChangedError,
    ConnectionService,
    LeaseLostError,
    LockService,
    RepositoryNotFoundError,
    ValidationError,
} from '../../../src/index.ts';
import type { ConnectionConfigWrite, ConnectionEntryWrite } from '../../../src/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

/** Plain Uint8Array copies of a findEntries result, for equality checks. */
const plain = (entries: Map<string, Uint8Array>) => Object.fromEntries(
    [...entries].map(([key, value]) => [key, Array.from(value)]),
);

function makeConnection(name: string, overrides: Partial<ConnectionInput> = {}): ConnectionInput {
    return {
        name,
        type: 'whatsapp',
        keyId: 'k1',
        wrappedKey: new Uint8Array([1, 2, 3, 4]),
        createdAt: new Date(1_000),
        updatedAt: new Date(1_000),
        ...overrides,
    };
}

/** A connection as the service returns it: the input with the id the service assigned. */
const stored = (connection: ConnectionInput) => ({ id: expect.any(String), ...connection });

/** The service and a lock service on memory repositories of one registry, on one clock. */
function setup() {
    const clock = new ControllableClock();
    const registry = new MemoryRegistry();
    const repository = new MemoryConnectionRepository({ registry });
    const lockService = new LockService({ repository: new MemoryLockRepository({ registry }), clock });
    const connections = new ConnectionService({ repository, clock });
    const hold = async (name: string, owner = 'o1', ttlMs = 1_000) => {
        const lock = `connection:${name}`;

        expect(await lockService.acquire(lock, owner, ttlMs)).toBe(true);

        return { lock, owner };
    };

    /** Holds the connection row of `name` in a transaction of its own until the returned release is called. */
    const holdRow = async (name: string) => {
        const { promise: held, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        const holding = repository.transaction(async (bound) => {
            await bound.findOneBy({ name });
            lock();
            await release;
        });

        await held;

        return async () => {
            done();
            await holding;
        };
    };

    return {
        clock,
        registry,
        repository,
        lockService,
        connections,
        hold,
        holdRow,
    };
}

/** Two microtask turns: a call in flight reaches the row lock it waits for. */
const untilBlocked = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('ConnectionService', () => {
    it('create inserts only when the name is absent, also under concurrency', async () => {
        const { connections } = setup();

        expect(await connections.findOne('wa')).toBeUndefined();
        await expect(connections.findOneOrFail('wa')).rejects.toThrow(new RepositoryNotFoundError('connections'));
        expect(await connections.find()).toEqual([]);
        expect(await connections.create(makeConnection('wa'))).toBe(true);
        expect(await connections.create(makeConnection('wa', { type: 'other', keyId: 'k2' }))).toBe(false);
        expect(await connections.findOneOrFail('wa')).toStrictEqual(stored(makeConnection('wa')));

        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) => connections.create(makeConnection('race', { keyId: `k${i}` }))),
        );

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await connections.find()).map((c) => c.name)).toEqual(['race', 'wa']);
    });

    it('two rows created in the same millisecond have different uuid v7 ids', async () => {
        const { connections } = setup();

        await connections.create(makeConnection('a'));
        await connections.create(makeConnection('b'));

        const [a, b] = await connections.find();

        expect(a!.createdAt).toEqual(b!.createdAt);
        expect(a!.id).not.toBe(b!.id);
        expect(a!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('find orders by name code point and returns the public connection only', async () => {
        const { connections } = setup();

        for (const name of ['b', 'a-b', 'a', 'a0']) {
            await connections.create(makeConnection(name));
        }

        const found = await connections.find();

        expect(found.map((c) => c.name)).toEqual(['a', 'a-b', 'a0', 'b']);
        expect(Object.keys(found[0]!).sort()).toEqual(['createdAt', 'id', 'keyId', 'name', 'type', 'updatedAt', 'wrappedKey']);
    });

    it('create refuses an invalid name, type or key id with ValidationError', async () => {
        const { connections } = setup();

        for (const connection of [
            makeConnection('Bad'),
            makeConnection('a'.repeat(65)),
            makeConnection('ok', { type: '' }),
            makeConnection('ok', { type: 'x'.repeat(65) }),
            makeConnection('ok', { keyId: '' }),
            makeConnection('ok', { wrappedKey: 'nope' as unknown as Uint8Array }),
        ]) {
            await expect(connections.create(connection)).rejects.toBeInstanceOf(ValidationError);
        }

        expect(await connections.find()).toEqual([]);
        await expect(connections.findOne('Bad')).rejects.toBeInstanceOf(ValidationError);
    });

    it('writeEntries applies clear, then set, then delete in one batch', async () => {
        const {
            clock,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

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

    it('writeEntries bumps updatedAt and keeps createdAt', async () => {
        const {
            clock,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 60_000);

        clock.advance(5_000);
        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        const stored = await connections.findOneOrFail('wa');

        expect(stored.createdAt).toEqual(new Date(1_000));
        expect(stored.updatedAt).toEqual(new Date(clock.now()));
    });

    it('writeEntries with an expired fence throws LeaseLostError and writes nothing', async () => {
        const {
            clock,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        clock.advance(500);
        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        clock.advance(500);
        await expect(connections.writeEntries('wa', { clear: true, set: { b: bytes(2) } }, fence))
            .rejects.toThrow(new LeaseLostError({ lock: 'connection:wa' }));
        expect(plain(await connections.findEntries('wa', ['a', 'b']))).toEqual({ a: [1] });
        expect((await connections.findOneOrFail('wa')).updatedAt).toEqual(new Date(500));
    });

    it('writeEntries with another owner\'s, a released or a taken-over fence writes nothing', async () => {
        const {
            clock,
            lockService,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

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
        await lockService.release(taken.lock, taken.owner);
        await expect(connections.writeEntries('wa', { set: { c: bytes(3) } }, taken))
            .rejects.toBeInstanceOf(LeaseLostError);
        expect(plain(await connections.findEntries('wa', ['a', 'b', 'c']))).toEqual({ b: [2] });
    });

    it('writeEntries refuses a lease of another lock the owner holds, writing nothing', async () => {
        const { lockService, connections } = setup();

        await connections.create(makeConnection('wa'));
        expect(await lockService.acquire('agents:wa', 'o1', 1_000)).toBe(true);
        expect(await lockService.acquire('connection:other', 'o1', 1_000)).toBe(true);

        for (const lock of ['agents:wa', 'connection:other']) {
            await expect(connections.writeEntries('wa', { set: { a: bytes(1) } }, { lock, owner: 'o1' }))
                .rejects.toBeInstanceOf(LeaseLostError);
        }

        expect(await connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('a write that fails validation anywhere in the batch writes nothing', async () => {
        const { connections, hold } = setup();

        await connections.create(makeConnection('wa'));

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

    it('delete removes the connection with its entries and ignores a missing one', async () => {
        const { connections, hold } = setup();

        await connections.create(makeConnection('wa'));
        await connections.create(makeConnection('other'));

        const fence = await hold('wa');

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        await connections.delete('wa');
        await expect(connections.delete('missing')).resolves.toBeUndefined();
        expect((await connections.find()).map((c) => c.name)).toEqual(['other']);
        await expect(connections.findEntry('wa', 'a')).rejects.toThrow(new RepositoryNotFoundError('connections'));
        await connections.create(makeConnection('wa'));
        expect((await connections.findEntries('wa', ['a'])).size).toBe(0);
    });

    it('delete with a fence deletes only under the held lease of that connection', async () => {
        const {
            clock,
            lockService,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        expect(await lockService.acquire('connection:other', 'o1', 1_000)).toBe(true);

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
        await expect(connections.delete('gone', { lock: 'connection:gone', owner: 'nobody' })).rejects.toBeInstanceOf(LeaseLostError);
    });

    it('replace swaps the connection, drops its entries and inserts an absent one, under the fence', async () => {
        const {
            clock,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));
        await connections.create(makeConnection('other'));

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
        // the same row: its createdAt stays
        expect(await connections.findOneOrFail('wa')).toStrictEqual(stored({ ...replacement, createdAt: new Date(1_000) }));
        expect((await connections.findEntries('wa', ['a'])).size).toBe(0);
        expect(plain(await connections.findEntries('other', ['a']))).toEqual({ a: [2] });

        const absent = await hold('fresh');

        await connections.replace(makeConnection('fresh'), absent);
        expect(await connections.findOneOrFail('fresh')).toStrictEqual(stored(makeConnection('fresh')));
    });

    it('replace with an expired, another owner\'s or another lock\'s fence throws LeaseLostError and changes nothing', async () => {
        const {
            clock,
            lockService,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);
        expect(await lockService.acquire('connection:other', 'o1', 1_000)).toBe(true);

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
        expect(await connections.findOneOrFail('wa')).toStrictEqual(stored({ ...makeConnection('wa'), updatedAt: new Date(clock.now()) }));
        expect(plain(await connections.findEntries('wa', ['a', 'b']))).toEqual({ a: [1], b: [2] });
        expect(await connections.findOne('fresh')).toBeUndefined();
    });

    it('replace refuses an invalid replacement with ValidationError and changes nothing', async () => {
        const { connections, hold } = setup();

        await connections.create(makeConnection('wa'));

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
        expect(await connections.findOneOrFail('wa')).toStrictEqual(before);
        expect(plain(await connections.findEntries('wa', ['a']))).toEqual({ a: [1] });
    });

    it('entry calls on an unknown connection throw RepositoryNotFoundError', async () => {
        const { connections, hold } = setup();
        const fence = await hold('missing');

        await expect(connections.findEntry('missing', 'a')).rejects.toThrow(new RepositoryNotFoundError('connections'));
        await expect(connections.findEntries('missing', ['a'])).rejects.toBeInstanceOf(RepositoryNotFoundError);
        await expect(connections.writeEntries('missing', { set: { a: bytes(1) } }, fence))
            .rejects.toBeInstanceOf(RepositoryNotFoundError);
        // the absent connection is reported before the fence, also one naming another lock
        await expect(connections.writeEntries('missing', { set: { a: bytes(1) } }, { lock: 'connection:other', owner: 'o1' }))
            .rejects.toBeInstanceOf(RepositoryNotFoundError);
    });

    it('connections and entries are copied in and out as plain Uint8Arrays', async () => {
        const { connections, hold } = setup();
        const connection = makeConnection('wa');

        await connections.create(connection);
        connection.wrappedKey[0] = 99;
        connection.createdAt.setTime(0);
        connection.type = 'evil';

        const found = await connections.findOneOrFail('wa');

        expect(found).toStrictEqual(stored(makeConnection('wa')));
        expect(Object.getPrototypeOf(found.wrappedKey)).toBe(Uint8Array.prototype);
        found.wrappedKey[0] = 99;
        found.updatedAt.setTime(0);

        const [listed] = await connections.find();

        expect(listed).toStrictEqual(stored(makeConnection('wa')));
        listed!.wrappedKey[0] = 99;
        expect(await connections.findOne('wa')).toStrictEqual(stored(makeConnection('wa')));

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

    it('stores an empty value and large batches (more keys than one list read takes)', async () => {
        const { connections, hold } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 60_000);
        const set = Object.fromEntries(Array.from({ length: 1_200 }, (_, i) => [`key:${i}`, bytes(i % 256)]));

        await connections.writeEntries('wa', { set: { ...set, empty: new Uint8Array(0) } }, fence);

        const keys = Object.keys(set);
        const found = await connections.findEntries('wa', [...keys, 'empty', 'key:0']);

        expect(found.size).toBe(1_201);
        expect(found.get('empty')!.length).toBe(0);
        expect(Array.from(found.get('key:1199')!)).toEqual([1_199 % 256]);

        await connections.writeEntries('wa', { delete: keys.slice(0, 1_100) }, fence);
        expect((await connections.findEntries('wa', [...keys, 'empty'])).size).toBe(101);
    });

    it('round-trips settings and secrets and bumps the revision', async () => {
        const { clock, connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        expect(await connections.findConfig('wa')).toBeUndefined();
        await connections.create(makeConnection('wa'));
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
            generation: expect.any(String),
        });

        clock.advance(10);
        expect(await connections.writeConfig('wa', {
            settings: {
                host: 'imap.example',
                port: 993,
                tls: true,
                list: ['a'],
            },
            setSecrets: { password: bytes(1, 2), token: bytes(3) },
        }, { wrappedKey: key })).toBe(1);

        const first = (await connections.findConfig('wa'))!;

        expect(first.settings).toEqual({
            host: 'imap.example',
            port: 993,
            tls: true,
            list: ['a'],
        });
        expect(plain(first.secrets)).toEqual({ password: [1, 2], token: [3] });
        expect(first.revision).toBe(1);
        expect((await connections.findOneOrFail('wa')).updatedAt).toEqual(new Date(clock.now()));

        // settings replace the stored ones as a whole, absent settings keep them; a clear beats a set of one field
        expect(await connections.writeConfig('wa', {
            setSecrets: { password: bytes(9), both: bytes(8) },
            clearSecrets: ['token', 'both', 'absent'],
        }, { wrappedKey: key })).toBe(2);

        const second = (await connections.findConfig('wa'))!;

        expect(second.settings).toEqual(first.settings);
        expect(plain(second.secrets)).toEqual({ password: [9] });
        expect(await connections.writeConfig('wa', { settings: { host: 'other' } }, { wrappedKey: key })).toBe(3);
        expect(await connections.findConfig('wa')).toMatchObject({ settings: { host: 'other' }, revision: 3 });
        expect(await connections.writeConfig('wa', {}, { wrappedKey: key })).toBe(4);
    });

    it('refuses a config write whose expected revision is stale, writing nothing', async () => {
        const { connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        expect(await connections.writeConfig('wa', { settings: { host: 'a' } }, { wrappedKey: key, revision: 0 })).toBe(1);

        // another save landed after this one read revision 0
        await expect(connections.writeConfig('wa', {
            settings: { host: 'b' },
            setSecrets: { password: bytes(7) },
        }, { wrappedKey: key, revision: 0 })).rejects.toMatchObject({ code: 'connection_changed' });
        expect(await connections.findConfig('wa')).toMatchObject({
            settings: { host: 'a' },
            secrets: new Map(),
            revision: 1,
            generation: expect.any(String),
        });
        expect(await connections.writeConfig('wa', { settings: { host: 'b' } }, { wrappedKey: key, revision: 1 })).toBe(2);
    });

    it('a delete and create under one name with equal revisions refuses a save expecting the old generation', async () => {
        const { connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { host: 'a' } }, { wrappedKey: key });

        const first = (await connections.findConfig('wa'))!;

        await connections.delete('wa');
        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { host: 'b' } }, { wrappedKey: key });

        const second = (await connections.findConfig('wa'))!;

        expect(second.revision).toBe(first.revision);
        expect(second.generation).not.toBe(first.generation);
        expect(second.generation).toBe((await connections.findOneOrFail('wa')).id);
        await expect(connections.writeConfig('wa', { settings: { host: 'c' } }, {
            wrappedKey: key,
            revision: first.revision,
            generation: first.generation,
        })).rejects.toThrow(new ConnectionChangedError('wa'));
        expect(await connections.findConfig('wa')).toMatchObject({ settings: { host: 'b' }, revision: 1 });
        expect(await connections.writeConfig('wa', { settings: { host: 'c' } }, {
            wrappedKey: key,
            revision: second.revision,
            generation: second.generation,
        })).toBe(2);
    });

    it('replace bumps the config revision and keeps the id and createdAt', async () => {
        const {
            clock, 
            connections, 
            hold, 
        } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { a: 1 } }, { wrappedKey: key });

        const before = (await connections.findConfig('wa'))!;
        const row = await connections.findOneOrFail('wa');

        clock.advance(10);

        const replacement = makeConnection('wa', {
            wrappedKey: bytes(7, 7),
            createdAt: new Date(clock.now()),
            updatedAt: new Date(clock.now()),
        });

        await connections.replace(replacement, await hold('wa'));

        const after = (await connections.findConfig('wa'))!;

        expect(after.revision).toBe(before.revision + 1);
        expect(after.generation).toBe(before.generation);
        expect(await connections.findOneOrFail('wa')).toMatchObject({ id: row.id, createdAt: row.createdAt });
        // a save that read before the replace is stale, also with the replacement's key
        await expect(connections.writeConfig('wa', { settings: { a: 2 } }, {
            wrappedKey: replacement.wrappedKey,
            revision: before.revision,
            generation: before.generation,
        })).rejects.toThrow(new ConnectionChangedError('wa'));
        expect((await connections.findConfig('wa'))!.settings).toEqual({ a: 1 });
    });

    it('a stale wrappedKey or revision is ConnectionChangedError and writes nothing', async () => {
        const { clock, connections } = setup();
        const key = bytes(1, 2, 3, 4);

        await connections.create(makeConnection('wa', { wrappedKey: key }));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, { wrappedKey: key });

        const before = await connections.findOneOrFail('wa');

        clock.advance(10);

        for (const [stale, revision] of [[bytes(1, 2, 3, 5), undefined], [key, 0], [key, 2]] as const) {
            await expect(connections.writeConfig('wa', {
                settings: { a: 2 },
                setSecrets: { s: bytes(8), t: bytes(9) },
                clearSecrets: ['s'],
            }, { wrappedKey: stale, revision })).rejects.toThrow(new ConnectionChangedError('wa'));
        }

        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: { a: 1 },
            secrets: new Map([['s', bytes(7)]]),
            revision: 1,
            generation: expect.any(String),
        });
        expect(await connections.findOneOrFail('wa')).toStrictEqual(before);
    });

    it('writes config with no lease held', async () => {
        const { connections, hold } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        expect(await connections.writeConfig('wa', { settings: { a: 1 } }, { wrappedKey: key })).toBe(1);

        // and while another process's session holds the lease
        await hold('wa', 'session', 60_000);
        expect(await connections.writeConfig('wa', { setSecrets: { s: bytes(1) } }, { wrappedKey: key })).toBe(2);
        expect(plain((await connections.findConfig('wa'))!.secrets)).toEqual({ s: [1] });
    });

    it('a config write leaves entries untouched', async () => {
        const { connections, hold } = setup();
        const stored = makeConnection('wa');

        await connections.create(stored);

        const fence = await hold('wa', 'session', 60_000);

        await connections.writeEntries('wa', { set: { creds: bytes(1), same: bytes(2) } }, fence);
        await connections.writeConfig('wa', {
            settings: { creds: 'not-an-entry' },
            setSecrets: { same: bytes(9) },
            clearSecrets: ['creds'],
        }, { wrappedKey: stored.wrappedKey });

        expect(plain(await connections.findEntries('wa', ['creds', 'same']))).toEqual({ creds: [1], same: [2] });
        expect(await connections.findOneOrFail('wa')).toMatchObject({
            keyId: stored.keyId,
            wrappedKey: stored.wrappedKey,
        });

        // an entry clear leaves the secrets too
        await connections.writeEntries('wa', { clear: true }, fence);
        expect(plain((await connections.findConfig('wa'))!.secrets)).toEqual({ same: [9] });
    });

    it('refuses a stale wrapped key with ConnectionChangedError and writes nothing', async () => {
        const { connections } = setup();
        const key = bytes(1, 2, 3, 4);

        await connections.create(makeConnection('wa', { wrappedKey: key }));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, { wrappedKey: key });

        const before = await connections.findOneOrFail('wa');

        for (const stale of [bytes(1, 2, 3, 5), bytes(1, 2, 3), bytes(1, 2, 3, 4, 0), new Uint8Array(0)]) {
            await expect(connections.writeConfig('wa', {
                settings: { a: 2 },
                setSecrets: { s: bytes(8) },
                clearSecrets: ['s'],
            }, { wrappedKey: stale })).rejects.toBeInstanceOf(ConnectionChangedError);
        }

        const config = (await connections.findConfig('wa'))!;

        expect(config.settings).toEqual({ a: 1 });
        expect(plain(config.secrets)).toEqual({ s: [7] });
        expect(config.revision).toBe(1);
        expect(await connections.findOneOrFail('wa')).toStrictEqual(before);
    });

    it('refuses an unstorable settings value with ValidationError, naming no value, and writes nothing', async () => {
        const { connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));

        const refused: Record<string, unknown>[] = [
            { a: 'x\0secret-nul' },
            { a: 'secret\ud800' },
            { a: undefined },
            { a: new Date(0) },
            { a: () => 1 },
            { a: { b: 1 } },
            { a: null },
            { a: NaN },
            { a: Infinity },
            { a: ['ok', 1] },
            { a: ['secret\0'] },
            { 'k\0': 'v' },
            Object.assign(Object.create({ inherited: 1 }), { a: 'x' }),
        ];

        for (const settings of refused) {
            const refusal = connections.writeConfig('wa', { settings }, { wrappedKey: key });

            await expect(refusal).rejects.toBeInstanceOf(ValidationError);
            await expect(refusal).rejects.not.toThrow(/secret/);
        }

        expect(await connections.findConfig('wa')).toMatchObject({ settings: {}, revision: 0 });

        const accepted = {
            s: 'x',
            n: 1.5,
            b: false,
            l: ['a', 'b'],
            empty: [],
        };

        expect(await connections.writeConfig('wa', { settings: accepted }, { wrappedKey: key })).toBe(1);
        expect((await connections.findConfig('wa'))!.settings).toEqual(accepted);
    });

    it('a config write of an absent connection is RepositoryNotFoundError', async () => {
        const { connections } = setup();

        await expect(connections.writeConfig('missing', { settings: {} }, { wrappedKey: bytes(1) }))
            .rejects.toThrow(new RepositoryNotFoundError('connections'));
        expect(await connections.findConfig('missing')).toBeUndefined();
    });

    it('refuses a malformed config write with ValidationError and writes nothing', async () => {
        const { connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));

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
            await expect(connections.writeConfig('wa', write, { wrappedKey: key })).rejects.toBeInstanceOf(ValidationError);
        }

        await expect(connections.writeConfig('wa', {}, { wrappedKey: 'nope' as unknown as Uint8Array }))
            .rejects.toBeInstanceOf(ValidationError);
        await expect(connections.writeConfig('Bad', {}, { wrappedKey: key })).rejects.toBeInstanceOf(ValidationError);
        await expect(connections.findConfig('Bad')).rejects.toBeInstanceOf(ValidationError);
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
            generation: expect.any(String),
        });
    });

    it('replace keeps settings, bumps the revision and drops secrets', async () => {
        const { connections, hold } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, { wrappedKey: key });

        const replacement = makeConnection('wa', { wrappedKey: bytes(7, 7) });

        await connections.replace(replacement, await hold('wa'));

        expect(await connections.findConfig('wa')).toEqual({
            keyId: replacement.keyId,
            wrappedKey: replacement.wrappedKey,
            settings: { a: 1 },
            secrets: new Map(),
            revision: 2,
            generation: expect.any(String),
        });
        expect(await connections.findOneOrFail('wa')).toStrictEqual(stored(replacement));
        // the replaced key is stale now, the replacement's is current
        await expect(connections.writeConfig('wa', { settings: {} }, { wrappedKey: key })).rejects.toBeInstanceOf(ConnectionChangedError);
        expect(await connections.writeConfig('wa', { setSecrets: { s: bytes(1) } }, { wrappedKey: replacement.wrappedKey })).toBe(3);

        const absent = await hold('fresh');

        await connections.replace(makeConnection('fresh'), absent);
        expect(await connections.findConfig('fresh')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
            generation: expect.any(String),
        });
    });

    it('a delete removes the config with the connection', async () => {
        const { connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { a: 1 }, setSecrets: { s: bytes(7) } }, { wrappedKey: key });
        await connections.delete('wa');
        expect(await connections.findConfig('wa')).toBeUndefined();
        await connections.create(makeConnection('wa'));
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: {},
            secrets: new Map(),
            revision: 0,
            generation: expect.any(String),
        });
    });

    it('findConfig reads the key with the config, the replacement\'s after a replace', async () => {
        const { connections, hold } = setup();
        const stored = makeConnection('wa', { keyId: 'k1', wrappedKey: bytes(1, 2) });

        await connections.create(stored);
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

    it('copies secrets and settings in and out', async () => {
        const { connections } = setup();
        const key = bytes(1, 2, 3);

        await connections.create(makeConnection('wa', { wrappedKey: bytes(1, 2, 3) }));

        const secret = bytes(1, 2);
        const settings = { list: ['a'] };

        await connections.writeConfig('wa', { settings, setSecrets: { s: secret, empty: new Uint8Array(0) } }, { wrappedKey: key });
        secret[0] = 99;
        settings.list[0] = 'z';

        const read = (await connections.findConfig('wa'))!;

        expect(Object.getPrototypeOf(read.secrets.get('s'))).toBe(Uint8Array.prototype);
        expect(Array.from(read.secrets.get('s')!)).toEqual([1, 2]);
        expect(read.secrets.get('empty')!.length).toBe(0);
        expect(read.settings).toEqual({ list: ['a'] });
        read.secrets.get('s')![0] = 99;
        (read.settings.list as string[])[0] = 'z';

        const again = (await connections.findConfig('wa'))!;

        expect(Array.from(again.secrets.get('s')!)).toEqual([1, 2]);
        expect(again.settings).toEqual({ list: ['a'] });
    });

    it('findConfig sees one consistent revision', async () => {
        const { connections, repository } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { v: 1 }, setSecrets: { s: bytes(1) } }, { wrappedKey: key });

        // a config write lands between the read of the row and the read of its secrets, three times over
        const { findManyBy } = repository.secrets;
        let raced = 0;

        repository.secrets.findManyBy = async function racing(this: unknown, where) {
            if (raced < 3) {
                raced += 1;
                await connections.writeConfig('wa', { settings: { v: raced + 1 }, setSecrets: { s: bytes(raced + 1) } }, { wrappedKey: key });
            }

            return Reflect.apply(findManyBy, this, [where]);
        };

        // two unlocked reads see a revision change and read again; the third falls back to the locked read
        expect(await connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: key,
            settings: { v: 4 },
            secrets: new Map([['s', bytes(4)]]),
            revision: 4,
            generation: expect.any(String),
        });
        expect(raced).toBe(3);
    });

    it('findConfig does not wait for a fenced entry batch in flight', async () => {
        const {
            connections,
            hold,
            holdRow,
        } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { v: 1 } }, { wrappedKey: key });
        await hold('wa');

        // a batch holds the connection row (as a fenced write does until it commits)
        const release = await holdRow('wa');

        expect(await connections.findConfig('wa')).toMatchObject({ settings: { v: 1 }, revision: 1 });
        await release();
    });

    it.each([
        ['released', async (ctx: ReturnType<typeof setup>) => {
            await ctx.lockService.release('connection:wa', 'o1');
        }],
        ['expired', async (ctx: ReturnType<typeof setup>) => {
            ctx.clock.advance(1_000);
        }],
        ['taken over by another owner', async (ctx: ReturnType<typeof setup>) => {
            ctx.clock.advance(1_000);
            expect(await ctx.lockService.acquire('connection:wa', 'o2', 60_000)).toBe(true);
        }],
    ])('a fence %s while the fenced write waits for the connection row refuses every fenced write and writes nothing', async (_, change) => {
        const ctx = setup();
        const {
            connections,
            hold,
            holdRow,
        } = ctx;

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        const before = await connections.findOneOrFail('wa');
        const release = await holdRow('wa');
        const writes = [
            connections.writeEntries('wa', { clear: true, set: { b: bytes(2) } }, fence),
            connections.replace(makeConnection('wa', { keyId: 'k2' }), fence),
            connections.delete('wa', fence),
        ];
        const settled = Promise.allSettled(writes);

        await untilBlocked();
        await change(ctx);
        await release();

        for (const result of await settled) {
            expect(result).toMatchObject({ status: 'rejected', reason: new LeaseLostError({ lock: 'connection:wa' }) });
        }

        expect(await connections.findOneOrFail('wa')).toStrictEqual(before);
        expect(plain(await connections.findEntries('wa', ['a', 'b']))).toEqual({ a: [1] });
    });

    it('a fenced write waits for a release of its lease in flight and is refused once it committed', async () => {
        const {
            registry,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 60_000);
        const locks = new MemoryLockRepository({ registry });
        const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        // the lock service's release: the lease read locked, then removed
        const releasing = locks.transaction(async (bound) => {
            const lease = (await bound.findOneBy({ key: fence.lock }))!;

            lock();
            await release;
            await bound.remove(lease);
        });

        await locked;

        const writing = connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        await untilBlocked();
        done();
        await releasing;
        await expect(writing).rejects.toBeInstanceOf(LeaseLostError);
        expect(await connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('the fence reads the clock after its row locks: a batch blocked on its lease row past the expiry is refused', async () => {
        const {
            clock,
            registry,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);
        const locks = new MemoryLockRepository({ registry });
        const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        // a lock transaction holds the lease row and changes nothing; only the time passes while the batch waits
        const holding = locks.transaction(async (bound) => {
            await bound.findOneBy({ key: fence.lock });
            lock();
            await release;
        });

        await locked;

        const writing = connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        await untilBlocked();
        clock.advance(1_000);
        done();
        await holding;
        await expect(writing).rejects.toBeInstanceOf(LeaseLostError);
        expect(await connections.findEntry('wa', 'a')).toBeUndefined();
    });

    it('the fence holds its lease row until the batch commits, so a renewal waits for it', async () => {
        const {
            clock,
            lockService,
            repository,
            connections,
            hold,
        } = setup();

        await connections.create(makeConnection('wa'));

        const fence = await hold('wa', 'o1', 1_000);
        const events: string[] = [];
        // a batch that read its fence and then waits inside its transaction
        const { promise: read, resolve: readDone } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        const batch = repository.transaction(async (bound) => {
            await bound.findOneBy({ name: 'wa' });
            await bound.findFence(fence.lock);
            readDone();
            await release;
            events.push('batch');
        });

        await read;

        const renewing = lockService.renew(fence.lock, fence.owner, 1_000).then((renewed) => {
            events.push('renew');

            return renewed;
        });

        await untilBlocked();
        clock.advance(10);
        done();
        await batch;
        expect(await renewing).toBe(true);
        expect(events).toEqual(['batch', 'renew']);
    });

    it('replace inserts in place when another create takes the name between its locked read and its insert', async () => {
        const {
            registry,
            connections,
            hold,
        } = setup();
        const fence = await hold('wa', 'o1', 60_000);
        const replacement = makeConnection('wa', { keyId: 'k2', wrappedKey: bytes(9) });
        const locks = new MemoryLockRepository({ registry });
        const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        // the replace finds no row, then waits for the lease row a lock transaction holds; a create lands meanwhile
        const holding = locks.transaction(async (bound) => {
            await bound.findOneBy({ key: fence.lock });
            lock();
            await release;
        });

        await locked;

        const replacing = connections.replace(replacement, fence);

        await untilBlocked();
        expect(await connections.create(makeConnection('wa'))).toBe(true);
        done();
        await holding;
        await replacing;
        expect(await connections.findOneOrFail('wa')).toStrictEqual(stored(replacement));
        expect((await connections.find()).map((c) => c.name)).toEqual(['wa']);
    });

    it('a config save queued behind a replace is refused as changed, never written under the dead key', async () => {
        const {
            connections,
            hold,
            holdRow,
        } = setup();
        const stored = makeConnection('wa');

        await connections.create(stored);

        const fence = await hold('wa', 'o1', 60_000);

        await connections.writeConfig('wa', { settings: { a: 1 } }, { wrappedKey: stored.wrappedKey });

        const release = await holdRow('wa');
        const replacement = { ...stored, wrappedKey: bytes(9) };
        const replacing = connections.replace(replacement, fence);

        await untilBlocked();

        const saving = connections.writeConfig('wa', { setSecrets: { s: bytes(7) } }, { wrappedKey: stored.wrappedKey });

        await untilBlocked();
        await release();
        await replacing;
        await expect(saving).rejects.toBeInstanceOf(ConnectionChangedError);
        expect(await connections.findConfig('wa')).toEqual({
            keyId: replacement.keyId,
            wrappedKey: replacement.wrappedKey,
            settings: { a: 1 },
            secrets: new Map(),
            revision: 2,
            generation: expect.any(String),
        });
    });

    it('of eight concurrent config writes expecting revision 0 exactly one lands, the others are ConnectionChangedError', async () => {
        const { connections } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));

        const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => connections.writeConfig(
            'wa',
            { setSecrets: { [`s${i}`]: bytes(i) } },
            { wrappedKey: key, revision: 0 },
        )));

        expect(results.filter((result) => result.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: 1 }]);

        for (const result of results.filter((item) => item.status === 'rejected')) {
            expect(result.reason).toBeInstanceOf(ConnectionChangedError);
        }

        const config = (await connections.findConfig('wa'))!;

        expect(config.revision).toBe(1);
        expect(config.secrets.size).toBe(1);
    });

    it('concurrent config writes each get their own revision', async () => {
        const { connections } = setup();
        const stored = makeConnection('wa');

        await connections.create(stored);

        const revisions = await Promise.all(Array.from({ length: 10 }, (_, i) => connections.writeConfig(
            'wa',
            { setSecrets: { [`s${i}`]: bytes(i) } },
            { wrappedKey: stored.wrappedKey },
        )));

        expect([...revisions].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));

        const config = (await connections.findConfig('wa'))!;

        expect(config.revision).toBe(10);
        expect(config.secrets.size).toBe(10);
    });

    it('no refusal names a stored value', async () => {
        const { connections, hold } = setup();
        const key = makeConnection('wa').wrappedKey;

        await connections.create(makeConnection('wa'));
        await connections.writeConfig('wa', { settings: { host: 'secret-host' }, setSecrets: { password: text('secret-password') } }, { wrappedKey: key });

        const errors = await Promise.all([
            connections.writeConfig('wa', { settings: { host: 'secret-other' } }, { wrappedKey: key, revision: 0 }).catch((error: Error) => error),
            connections.writeConfig('wa', { settings: { host: 'secret-other' } }, { wrappedKey: bytes(9) }).catch((error: Error) => error),
            connections.writeEntries('wa', { set: { 'secret-key': text('secret-value') } }, { lock: 'connection:wa', owner: 'o2' })
                .catch((error: Error) => error),
            connections.writeEntries('wa', { set: { 'secret-key': 'secret-value' as unknown as Uint8Array } }, await hold('wa'))
                .catch((error: Error) => error),
        ]);

        for (const error of errors) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).not.toMatch(/secret/);
        }
    });
});

function text(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}
