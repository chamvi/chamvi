/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError, EntityRelationError } from '@chamvi/store';
import type { IConnectionRepository, ILockRepository } from '@chamvi/store';
import type {
    ConnectionEntryRecord,
    ConnectionRecord,
    ConnectionSecretRecord,
    Lock,
} from '@chamvi/core-kit';
import { testUuid } from '../fixture/helpers.ts';
import type { ConnectionRepositoryContractInput } from './types.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

function connectionOf(label: string, name: string, overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
    return {
        id: testUuid(label),
        name,
        type: 'whatsapp',
        keyId: 'k1',
        wrappedKey: bytes(1, 2, 3),
        settings: {},
        configRevision: 0,
        createdAt: new Date(1_000),
        updatedAt: new Date(1_000),
        ...overrides,
    };
}

function entryOf(label: string, connectionId: string, key: string, value: Uint8Array): ConnectionEntryRecord {
    return {
        id: testUuid(label),
        connectionId,
        key,
        value,
    };
}

function secretOf(label: string, connectionId: string, name: string, value: Uint8Array): ConnectionSecretRecord {
    return {
        id: testUuid(label),
        connectionId,
        name,
        value,
    };
}

function lockOf(label: string, key: string, owner: string, expiresAt: number): Lock {
    return {
        id: testUuid(label),
        key,
        owner,
        expiresAt: new Date(expiresAt),
        token: 1,
    };
}

/**
 * The storage behaviour of an `IConnectionRepository`: connections stored
 * as given with their entries and secrets as child repositories (unique
 * keys, `upsert` by natural key keeping the stored id, references to the
 * connection), the children bound to the root's transaction and rolled
 * back with it, `findFence` returning the lock row and, inside a
 * transaction, waiting for a lock transaction in flight and holding off
 * the next one, copies, and concurrent first saves and upserts.
 */
export function describeConnectionRepositoryContract(input: ConnectionRepositoryContractInput): void {
    describe(`connection repository contract: ${input.name}`, () => {
        let connections: IConnectionRepository;
        let locks: ILockRepository;

        beforeEach(async () => {
            ({ repository: connections, locks } = await input.create());
        });

        const insert = (value: ConnectionRecord) => connections.save(connections.create(value));

        it('stores a connection as given, reads it back by name and by id, and resolves from save what the next read returns', async () => {
            const saved = await insert(connectionOf('c1', 'wa', { settings: { host: 'h', nested: { list: ['a'] } }, configRevision: 3 }));

            expect(saved).toStrictEqual(connectionOf('c1', 'wa', { settings: { host: 'h', nested: { list: ['a'] } }, configRevision: 3 }));
            expect(await connections.findOneBy({ name: 'wa' })).toStrictEqual(saved);
            expect(await connections.findOneById(testUuid('c1'))).toStrictEqual(saved);
            expect(Object.getPrototypeOf(saved.wrappedKey)).toBe(Uint8Array.prototype);
            expect(Object.getPrototypeOf((await connections.findOneBy({ name: 'wa' }))!.wrappedKey)).toBe(Uint8Array.prototype);
            expect((await connections.findOneBy({ name: 'wa' }))!.createdAt).toBeInstanceOf(Date);
        });

        it('reads an unknown name or a malformed id as null', async () => {
            expect(await connections.findOneBy({ name: 'missing' })).toBeNull();
            expect(await connections.findOneById(testUuid('missing'))).toBeNull();
            expect(await connections.findOneById('not-a-uuid')).toBeNull();
        });

        it('save of a created connection whose name is stored is EntityConflictError and leaves the stored row', async () => {
            await insert(connectionOf('c1', 'wa'));

            await expect(insert(connectionOf('c2', 'wa', { type: 'other' }))).rejects.toBeInstanceOf(EntityConflictError);
            expect(await connections.findOneBy({ name: 'wa' })).toStrictEqual(connectionOf('c1', 'wa'));
            expect(await connections.findOneById(testUuid('c2'))).toBeNull();
        });

        it('save of a read connection writes its changes in place, keeps the id and resolves the next read', async () => {
            await insert(connectionOf('c1', 'wa'));

            const read = (await connections.findOneBy({ name: 'wa' }))!;

            connections.merge(read, {
                keyId: 'k2',
                wrappedKey: bytes(9),
                settings: { a: 1 },
                configRevision: 1,
                updatedAt: new Date(2_000),
            });

            const saved = await connections.save(read);
            const expected = connectionOf('c1', 'wa', {
                keyId: 'k2',
                wrappedKey: bytes(9),
                settings: { a: 1 },
                configRevision: 1,
                updatedAt: new Date(2_000),
            });

            expect(saved).toStrictEqual(expected);
            expect(await connections.findOneBy({ name: 'wa' })).toStrictEqual(expected);
        });

        it('sorts by name in code-point order', async () => {
            for (const [index, name] of ['b', 'a-b', 'a', 'a0'].entries()) {
                await insert(connectionOf(`c${index}`, name));
            }

            const { data, meta } = await connections.findMany(defineQuery({ sorts: { name: 'ASC' } }));

            expect(data.map((connection) => connection.name)).toEqual(['a', 'a-b', 'a0', 'b']);
            expect(meta.total).toBe(4);
        });

        it('stores entries and secrets of a connection; upsert replaces by natural key, keeps the stored id and resolves the next read', async () => {
            const { id } = await insert(connectionOf('c1', 'wa'));
            const first = await connections.entries.upsert(connections.entries.create(entryOf('e1', id, 'creds', bytes(1))));

            expect(first).toStrictEqual(entryOf('e1', id, 'creds', bytes(1)));

            const replaced = await connections.entries.upsert(connections.entries.create(entryOf('e2', id, 'creds', bytes(2))));

            expect(replaced).toStrictEqual(entryOf('e1', id, 'creds', bytes(2)));
            expect(await connections.entries.findOneBy({ connectionId: id, key: 'creds' })).toStrictEqual(replaced);
            expect(await connections.entries.findOneById(testUuid('e2'))).toBeNull();

            const secret = await connections.secrets.upsert(connections.secrets.create(secretOf('s1', id, 'password', bytes(7))));

            expect(secret).toStrictEqual(secretOf('s1', id, 'password', bytes(7)));
            expect(await connections.secrets.upsert(connections.secrets.create(secretOf('s2', id, 'password', new Uint8Array(0)))))
                .toStrictEqual(secretOf('s1', id, 'password', new Uint8Array(0)));
            expect(await connections.secrets.findOneBy({ connectionId: id, name: 'password' }))
                .toStrictEqual(secretOf('s1', id, 'password', new Uint8Array(0)));
            // entries and secrets are apart: a secret of the entry's name is no entry
            expect(await connections.entries.findOneBy({ connectionId: id, key: 'password' })).toBeNull();
        });

        it('finds the entries of a connection by a list of keys; the keys of another connection stay apart', async () => {
            const { id: wa } = await insert(connectionOf('c1', 'wa'));
            const { id: other } = await insert(connectionOf('c2', 'other'));

            for (const [index, key] of ['a', 'b', 'c'].entries()) {
                await connections.entries.save(connections.entries.create(entryOf(`e${index}`, wa, key, bytes(index))));
            }

            await connections.entries.save(connections.entries.create(entryOf('x', other, 'a', bytes(9))));

            const found = await connections.entries.findManyBy({ connectionId: wa, key: ['a', 'c', 'absent'] });

            expect(found.map((entry) => entry.key).sort()).toEqual(['a', 'c']);
            expect((await connections.entries.findManyBy({ connectionId: other })).map((entry) => [entry.key, Array.from(entry.value)]))
                .toEqual([['a', [9]]]);
        });

        it('a created entry or secret whose natural key is stored is EntityConflictError; another connection may hold it', async () => {
            const { id: wa } = await insert(connectionOf('c1', 'wa'));
            const { id: other } = await insert(connectionOf('c2', 'other'));

            await connections.entries.save(connections.entries.create(entryOf('e1', wa, 'k', bytes(1))));
            await connections.secrets.save(connections.secrets.create(secretOf('s1', wa, 's', bytes(1))));

            await expect(connections.entries.save(connections.entries.create(entryOf('e2', wa, 'k', bytes(2)))))
                .rejects.toBeInstanceOf(EntityConflictError);
            await expect(connections.secrets.save(connections.secrets.create(secretOf('s2', wa, 's', bytes(2)))))
                .rejects.toBeInstanceOf(EntityConflictError);
            await connections.entries.save(connections.entries.create(entryOf('e3', other, 'k', bytes(3))));
            await connections.secrets.save(connections.secrets.create(secretOf('s3', other, 's', bytes(3))));
            expect(Array.from((await connections.entries.findOneBy({ connectionId: wa, key: 'k' }))!.value)).toEqual([1]);
            expect(Array.from((await connections.secrets.findOneBy({ connectionId: wa, name: 's' }))!.value)).toEqual([1]);
        });

        it('an entry or a secret of a missing connection is EntityRelationError naming the connection, and nothing is stored', async () => {
            const missing = testUuid('missing');

            await expect(connections.entries.save(connections.entries.create(entryOf('e1', missing, 'k', bytes(1)))))
                .rejects.toMatchObject({
                    constructor: EntityRelationError,
                    entity: 'connection_entry',
                    relation: 'connection',
                });
            await expect(connections.entries.upsert(connections.entries.create(entryOf('e2', missing, 'k', bytes(1)))))
                .rejects.toMatchObject({
                    constructor: EntityRelationError,
                    entity: 'connection_entry',
                    relation: 'connection',
                });
            await expect(connections.secrets.save(connections.secrets.create(secretOf('s1', missing, 's', bytes(1)))))
                .rejects.toMatchObject({
                    constructor: EntityRelationError,
                    entity: 'connection_secret',
                    relation: 'connection',
                });
            await expect(connections.entries.validateRelations({ connectionId: missing }))
                .rejects.toMatchObject({ entity: 'connection_entry', relation: 'connection' });
            expect(await connections.entries.findManyBy({ connectionId: missing })).toEqual([]);
            expect(await connections.secrets.findManyBy({ connectionId: missing })).toEqual([]);
        });

        it('removing the children and then the connection removes them all; the name can be stored again', async () => {
            const { id } = await insert(connectionOf('c1', 'wa'));

            await connections.entries.save(connections.entries.create(entryOf('e1', id, 'k', bytes(1))));
            await connections.secrets.save(connections.secrets.create(secretOf('s1', id, 's', bytes(1))));
            await connections.transaction(async (repository) => {
                await repository.entries.removeMany(await repository.entries.findManyBy({ connectionId: id }));
                await repository.secrets.removeMany(await repository.secrets.findManyBy({ connectionId: id }));
                await repository.remove((await repository.findOneBy({ name: 'wa' }))!);
            });

            expect(await connections.findOneBy({ name: 'wa' })).toBeNull();
            expect(await connections.entries.findOneById(testUuid('e1'))).toBeNull();
            expect(await connections.secrets.findOneById(testUuid('s1'))).toBeNull();
            expect(await insert(connectionOf('c2', 'wa'))).toStrictEqual(connectionOf('c2', 'wa'));
        });

        it('binds the children to the transaction: their writes see the root\'s, stay unseen outside until the commit and commit with it', async () => {
            const { promise: written, resolve: write } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const committing = connections.transaction(async (repository) => {
                // a child row referencing a connection the same transaction stores
                const { id } = await repository.save(repository.create(connectionOf('c1', 'wa')));

                await repository.entries.save(repository.entries.create(entryOf('e1', id, 'k', bytes(1))));
                await repository.secrets.upsert(repository.secrets.create(secretOf('s1', id, 's', bytes(2))));
                expect((await repository.entries.findManyBy({ connectionId: id })).map((entry) => entry.key)).toEqual(['k']);
                write();
                await release;
            });

            await written;
            expect(await connections.findOneBy({ name: 'wa' })).toBeNull();
            expect(await connections.entries.findOneById(testUuid('e1'))).toBeNull();
            expect(await connections.secrets.findOneById(testUuid('s1'))).toBeNull();
            done();
            await committing;
            expect(await connections.entries.findOneById(testUuid('e1'))).toStrictEqual(entryOf('e1', testUuid('c1'), 'k', bytes(1)));
            expect(await connections.secrets.findOneById(testUuid('s1'))).toStrictEqual(secretOf('s1', testUuid('c1'), 's', bytes(2)));
        });

        it('a rejected transaction restores the connection and its children', async () => {
            const { id } = await insert(connectionOf('c1', 'wa', { settings: { a: 1 } }));

            await connections.entries.save(connections.entries.create(entryOf('e1', id, 'k', bytes(1))));
            await connections.secrets.save(connections.secrets.create(secretOf('s1', id, 's', bytes(1))));

            const failure = new Error('rolled back');

            await expect(connections.transaction(async (repository) => {
                const read = (await repository.findOneBy({ name: 'wa' }))!;

                repository.merge(read, { settings: { a: 2 }, configRevision: 1 });
                await repository.save(read);
                await repository.entries.upsert(repository.entries.create(entryOf('e2', id, 'k', bytes(2))));
                await repository.entries.save(repository.entries.create(entryOf('e3', id, 'new', bytes(3))));
                await repository.secrets.removeMany(await repository.secrets.findManyBy({ connectionId: id }));

                throw failure;
            })).rejects.toBe(failure);

            expect(await connections.findOneBy({ name: 'wa' })).toStrictEqual(connectionOf('c1', 'wa', { settings: { a: 1 } }));
            expect(await connections.entries.findManyBy({ connectionId: id })).toStrictEqual([entryOf('e1', id, 'k', bytes(1))]);
            expect(await connections.secrets.findManyBy({ connectionId: id })).toStrictEqual([secretOf('s1', id, 's', bytes(1))]);
        });

        it('a child repository used after its transaction ended is refused with a storage error and writes nothing', async () => {
            const { id } = await insert(connectionOf('c1', 'wa'));
            let leaked: IConnectionRepository['entries'] | undefined;

            await connections.transaction(async (repository) => {
                leaked = repository.entries;
            });

            for (const call of [
                () => leaked!.findManyBy({ connectionId: id }),
                () => leaked!.upsertMany([entryOf('e1', id, 'k', bytes(1))]),
                () => leaked!.removeManyBy({ connectionId: id }),
            ]) {
                const error = await call().then(() => undefined, (reason: unknown) => reason);

                expect((error as { code?: unknown } | undefined)?.code).toMatch(/^(entity_deadlock|database_unavailable)$/);
            }

            expect(await connections.entries.findManyBy({ connectionId: id })).toEqual([]);
        });

        it('copies values in and out', async () => {
            const value = connectionOf('c1', 'wa', { settings: { nested: { a: 1 } } });

            await insert(value);
            value.wrappedKey[0] = 99;
            (value.settings.nested as { a: number }).a = 99;

            const read = (await connections.findOneBy({ name: 'wa' }))!;

            expect(read).toStrictEqual(connectionOf('c1', 'wa', { settings: { nested: { a: 1 } } }));
            read.wrappedKey[0] = 99;
            expect(Array.from((await connections.findOneBy({ name: 'wa' }))!.wrappedKey)).toEqual([1, 2, 3]);

            const entry = entryOf('e1', read.id, 'k', bytes(1, 2));

            await connections.entries.save(connections.entries.create(entry));
            entry.value[0] = 99;

            const stored = (await connections.entries.findOneBy({ connectionId: read.id, key: 'k' }))!;

            expect(Object.getPrototypeOf(stored.value)).toBe(Uint8Array.prototype);
            expect(Array.from(stored.value)).toEqual([1, 2]);
            stored.value[0] = 99;
            expect(Array.from((await connections.entries.findOneBy({ connectionId: read.id, key: 'k' }))!.value)).toEqual([1, 2]);
        });

        it('findFence returns the lock row of the key, whoever holds it, and null for an unknown key', async () => {
            await locks.save(locks.create(lockOf('l1', 'connection:wa', 'o1', 5_000)));
            await locks.save(locks.create(lockOf('l2', 'connection:other', 'o2', 1_000)));

            expect(await connections.findFence('connection:wa')).toStrictEqual(lockOf('l1', 'connection:wa', 'o1', 5_000));
            expect(await connections.findFence('connection:other')).toStrictEqual(lockOf('l2', 'connection:other', 'o2', 1_000));
            expect(await connections.findFence('connection:missing')).toBeNull();
            expect(await connections.transaction((repository) => repository.findFence('connection:wa')))
                .toStrictEqual(lockOf('l1', 'connection:wa', 'o1', 5_000));
        });

        it('findFence inside a transaction waits for a lock transaction in flight and reads what it committed', async () => {
            await insert(connectionOf('c1', 'wa'));
            await locks.save(locks.create(lockOf('l1', 'connection:wa', 'o1', 5_000)));

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const takeover = locks.transaction(async (repository) => {
                const read = (await repository.findOneBy({ key: 'connection:wa' }))!;

                lock();
                await release;
                repository.merge(read, { owner: 'o2', expiresAt: new Date(9_000) });
                await repository.save(read);
            });

            await locked;

            const fence = connections.transaction(async (repository) => {
                await repository.findOneBy({ name: 'wa' });

                return repository.findFence('connection:wa');
            });

            await input.untilBlocked();
            done();
            await takeover;
            expect(await fence).toStrictEqual(lockOf('l1', 'connection:wa', 'o2', 9_000));
        });

        it('findFence inside a transaction reads a lock a transaction in flight releases as null once it committed', async () => {
            await insert(connectionOf('c1', 'wa'));
            await locks.save(locks.create(lockOf('l1', 'connection:wa', 'o1', 5_000)));

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const releasing = locks.transaction(async (repository) => {
                const read = (await repository.findOneBy({ key: 'connection:wa' }))!;

                lock();
                await release;
                await repository.remove(read);
            });

            await locked;

            const fence = connections.transaction(async (repository) => {
                await repository.findOneBy({ name: 'wa' });

                return repository.findFence('connection:wa');
            });

            await input.untilBlocked();
            done();
            await releasing;
            expect(await fence).toBeNull();
        });

        it('a fence read inside a transaction holds off a change of the lease until the transaction ends', async () => {
            await insert(connectionOf('c1', 'wa'));
            await locks.save(locks.create(lockOf('l1', 'connection:wa', 'o1', 5_000)));

            const events: string[] = [];
            const { promise: read, resolve: readDone } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const writing = connections.transaction(async (repository) => {
                const connection = (await repository.findOneBy({ name: 'wa' }))!;
                const fence = await repository.findFence('connection:wa');

                events.push(`fence ${fence?.owner}`);
                readDone();
                await release;
                repository.merge(connection, { updatedAt: new Date(2_000) });
                await repository.save(connection);
                events.push('written');
            });

            await read;

            const takeover = locks.transaction(async (repository) => {
                const lock = (await repository.findOneBy({ key: 'connection:wa' }))!;

                events.push('lock read');
                repository.merge(lock, { owner: 'o2', expiresAt: new Date(9_000) });
                await repository.save(lock);
            });

            await input.untilBlocked();
            expect(events).toEqual(['fence o1']);
            done();
            await Promise.all([writing, takeover]);
            expect(events).toEqual(['fence o1', 'written', 'lock read']);
            expect(await connections.findFence('connection:wa')).toStrictEqual(lockOf('l1', 'connection:wa', 'o2', 9_000));
        });

        it('concurrent first saves of one name: exactly one is stored, the others are EntityConflictError', async () => {
            const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => connections.transaction(
                (repository) => repository.save(repository.create(connectionOf(`c${i}`, 'race', { keyId: `k${i}` }))),
            )));
            const stored = results.filter((result) => result.status === 'fulfilled');

            expect(stored).toHaveLength(1);

            for (const result of results) {
                if (result.status === 'rejected') {
                    expect(result.reason).toBeInstanceOf(EntityConflictError);
                }
            }

            const { data } = await connections.findMany(defineQuery({ filters: { name: 'race' } }));

            expect(data).toHaveLength(1);
        });

        it('concurrent upserts of one entry key all resolve and leave one row holding one of their values', async () => {
            const { id } = await insert(connectionOf('c1', 'wa'));
            const results = await Promise.all(Array.from({ length: 10 }, (_, i) => connections.transaction(
                (repository) => repository.entries.upsert(repository.entries.create(entryOf(`e${i}`, id, 'k', bytes(i)))),
            )));
            const rows = await connections.entries.findManyBy({ connectionId: id });

            expect(rows).toHaveLength(1);
            expect(results.map((result) => result.id)).toContain(rows[0]!.id);
            expect(results.map((result) => Array.from(result.value)[0])).toContain(Array.from(rows[0]!.value)[0]);
        });
    });
}
