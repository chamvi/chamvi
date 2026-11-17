/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import type { IIdempotencyRepository, IdempotencyKey } from '@chamvi/store';
import { testUuid } from '../fixture/helpers.ts';
import type { IdempotencyRepositoryContractInput } from './types.ts';

function keyOf(label: string, scope: string, key: string, run: string, expiresAt: number): IdempotencyKey {
    return {
        id: testUuid(label),
        scope,
        key,
        runId: testUuid(run),
        expiresAt: new Date(expiresAt),
    };
}

async function insert(keys: IIdempotencyRepository, value: IdempotencyKey): Promise<IdempotencyKey> {
    return keys.save(keys.create(value));
}

/**
 * The storage behaviour of an `IIdempotencyRepository`: keys stored as
 * given, the unique `(scope, key)`, changed columns saved in place,
 * `removeExpiredBy` and its boundary, copies, and concurrent first saves
 * and locked reads of one key.
 */
export function describeIdempotencyRepositoryContract(input: IdempotencyRepositoryContractInput): void {
    describe(`idempotency key repository contract: ${input.name}`, () => {
        let keys: IIdempotencyRepository;

        beforeEach(async () => {
            keys = await input.create();
        });

        it('stores a key as given and reads it back by scope and key and by id; save resolves the next read', async () => {
            const saved = await insert(keys, keyOf('i1', 'a:http', 'k', 'r1', 61_000));

            expect(saved).toStrictEqual(keyOf('i1', 'a:http', 'k', 'r1', 61_000));
            expect(await keys.findOneBy({ scope: 'a:http', key: 'k' })).toStrictEqual(saved);
            expect(await keys.findOneById(testUuid('i1'))).toStrictEqual(saved);
        });

        it('reads an unknown key or a malformed id as null; the scope is part of the key', async () => {
            await insert(keys, keyOf('i1', 'a:http', 'k', 'r1', 1_000));

            expect(await keys.findOneBy({ scope: 'b:http', key: 'k' })).toBeNull();
            expect(await keys.findOneBy({ scope: 'a:http', key: 'other' })).toBeNull();
            expect(await keys.findOneById(testUuid('missing'))).toBeNull();
            expect(await keys.findOneById('not-a-uuid')).toBeNull();
        });

        it('stores one key in two scopes and two keys in one scope', async () => {
            await insert(keys, keyOf('i1', 'a:http', 'k', 'r1', 1_000));
            await insert(keys, keyOf('i2', 'b:http', 'k', 'r2', 1_000));
            await insert(keys, keyOf('i3', 'a:http', 'other', 'r3', 1_000));

            expect((await keys.findOneBy({ scope: 'b:http', key: 'k' }))!.runId).toBe(testUuid('r2'));
            expect((await keys.findOneBy({ scope: 'a:http', key: 'other' }))!.runId).toBe(testUuid('r3'));
        });

        it('save of a created key whose scope and key are stored is EntityConflictError and leaves the stored row', async () => {
            await insert(keys, keyOf('i1', 's', 'k', 'r1', 1_000));

            await expect(insert(keys, keyOf('i2', 's', 'k', 'r2', 2_000))).rejects.toBeInstanceOf(EntityConflictError);
            expect(await keys.findOneBy({ scope: 's', key: 'k' })).toStrictEqual(keyOf('i1', 's', 'k', 'r1', 1_000));
        });

        it('save of a read key writes its run and expiry in place, keeps the id and resolves the next read', async () => {
            await insert(keys, keyOf('i1', 's', 'k', 'r1', 1_000));

            const read = (await keys.findOneBy({ scope: 's', key: 'k' }))!;

            keys.merge(read, { runId: testUuid('r2'), expiresAt: new Date(5_000) });

            const saved = await keys.save(read);

            expect(saved).toStrictEqual(keyOf('i1', 's', 'k', 'r2', 5_000));
            expect(await keys.findOneBy({ scope: 's', key: 'k' })).toStrictEqual(saved);
        });

        it('removeExpiredBy removes exactly the keys expired at the time and resolves how many', async () => {
            await insert(keys, keyOf('i1', 's', 'before', 'r1', 4_999));
            await insert(keys, keyOf('i2', 's', 'at', 'r2', 5_000));
            await insert(keys, keyOf('i3', 's', 'after', 'r3', 5_001));

            expect(await keys.removeExpiredBy(new Date(5_000))).toBe(2);
            expect(await keys.findOneBy({ scope: 's', key: 'before' })).toBeNull();
            expect(await keys.findOneBy({ scope: 's', key: 'at' })).toBeNull();
            expect(await keys.findOneBy({ scope: 's', key: 'after' })).toStrictEqual(keyOf('i3', 's', 'after', 'r3', 5_001));
            expect(await keys.removeExpiredBy(new Date(5_000))).toBe(0);
        });

        it('removeExpiredBy keeps a key a transaction in flight takes over past the time', async () => {
            await insert(keys, keyOf('i1', 's', 'k', 'r1', 1_000));

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const takingOver = keys.transaction(async (repository) => {
                const read = (await repository.findOneBy({ scope: 's', key: 'k' }))!;

                lock();
                await release;
                repository.merge(read, { runId: testUuid('r2'), expiresAt: new Date(9_000) });
                await repository.save(read);
            });

            await locked;

            const purge = keys.removeExpiredBy(new Date(5_000));

            // the purge waits for the row the takeover holds before the takeover commits
            await input.untilBlocked();
            done();
            await takingOver;
            expect(await purge).toBe(0);
            expect(await keys.findOneBy({ scope: 's', key: 'k' })).toStrictEqual(keyOf('i1', 's', 'k', 'r2', 9_000));
        });

        it('copies values in and out', async () => {
            const value = keyOf('i1', 's', 'k', 'r1', 1_000);

            await insert(keys, value);
            value.expiresAt.setTime(9_000);

            const read = (await keys.findOneBy({ scope: 's', key: 'k' }))!;

            expect(read.expiresAt).toEqual(new Date(1_000));
            read.expiresAt.setTime(9_000);
            expect((await keys.findOneBy({ scope: 's', key: 'k' }))!.expiresAt).toEqual(new Date(1_000));
        });

        it('concurrent first saves of one key: exactly one is stored, the others are EntityConflictError', async () => {
            const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => insert(keys, keyOf(`i${i}`, 's', 'k', `r${i}`, 1_000))));
            const stored = results.findIndex((result) => result.status === 'fulfilled');

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')
                .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);
            expect((await keys.findOneBy({ scope: 's', key: 'k' }))!.runId).toBe(testUuid(`r${stored}`));
        });

        it('transactions that read and save one key apply one after the other: no change is lost', async () => {
            await insert(keys, keyOf('i1', 's', 'k', 'r1', 0));

            const extend = () => keys.transaction(async (repository) => {
                const value = (await repository.findOneBy({ scope: 's', key: 'k' }))!;

                // other transactions get their turn between the read and the write
                await Promise.resolve();
                await Promise.resolve();
                repository.merge(value, { expiresAt: new Date(value.expiresAt.getTime() + 1) });
                await repository.save(value);
            });

            await Promise.all(Array.from({ length: 10 }, () => extend()));
            expect((await keys.findOneBy({ scope: 's', key: 'k' }))!.expiresAt).toEqual(new Date(10));
        });
    });
}
