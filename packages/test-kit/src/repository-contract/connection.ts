/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import {
    LeaseLostError,
    RepositoryNotFoundError,
    ValidationError,
} from '@chamvi/core';
import type { ConnectionEntryWrite, IStore } from '@chamvi/core';
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

    it('a write that fails validation anywhere in the batch writes nothing', async ({ skip }) => {
        const { connections, hold } = await prepare(skip);

        await connections.insert(makeConnection('wa'));

        const fence = await hold('wa');

        await connections.writeEntries('wa', { set: { a: bytes(1) } }, fence);

        const writes: ConnectionEntryWrite[] = [
            { clear: true, set: { b: bytes(2), ['x'.repeat(256)]: bytes(3) } },
            { clear: true, set: { b: bytes(2), 'a\0b': bytes(3) } },
            { clear: true, set: { b: bytes(2), '': bytes(3) } },
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
}
