/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { LockService } from '@chamvi/core';
import type { ILockRepository } from '@chamvi/store';
import type { Lock } from '@chamvi/core-kit';
import { ControllableClock } from '../clock/index.ts';
import { UUID_V7, testUuid } from '../fixture/helpers.ts';
import type { LockRepositoryContractInput } from './types.ts';

/** Tolerance for a database whose clock lags the process clock a little (microseconds). */
const CLOCK_TOLERANCE_US = 5_000_000;

function lockOf(label: string, key: string, owner: string, expiresAt: number, token = 1): Lock {
    return {
        id: testUuid(label),
        key,
        owner,
        expiresAt: new Date(expiresAt),
        token,
    };
}

async function insert(locks: ILockRepository, lock: Lock): Promise<Lock> {
    return locks.save(locks.create(lock));
}

/**
 * The storage behaviour of an `ILockRepository`: locks stored as given,
 * the unique key, changed columns saved in place, `removeExpiredBy` and
 * its boundary, copies, concurrent first saves and locked reads of one
 * key, and the fencing tokens `nextToken` issues (also through a
 * `LockService` over the repository).
 */
export function describeLockRepositoryContract(input: LockRepositoryContractInput): void {
    describe(`lock repository contract: ${input.name}`, () => {
        let locks: ILockRepository;

        beforeEach(async () => {
            locks = await input.create();
        });

        it('stores a lock as given and reads it back by key and by id; save resolves the next read', async () => {
            const saved = await insert(locks, lockOf('l1', 'agents:a', 'o1', 61_000));

            expect(saved).toStrictEqual(lockOf('l1', 'agents:a', 'o1', 61_000));
            expect(await locks.findOneBy({ key: 'agents:a' })).toStrictEqual(saved);
            expect(await locks.findOneById(testUuid('l1'))).toStrictEqual(saved);
            expect((await locks.findOneBy({ key: 'agents:a' }))!.expiresAt).toBeInstanceOf(Date);
        });

        it('reads an unknown key or a malformed id as null', async () => {
            expect(await locks.findOneBy({ key: 'missing' })).toBeNull();
            expect(await locks.findOneById(testUuid('missing'))).toBeNull();
            expect(await locks.findOneById('not-a-uuid')).toBeNull();
        });

        it('save of a created lock whose key is stored is EntityConflictError and leaves the stored row', async () => {
            await insert(locks, lockOf('l1', 'k', 'o1', 1_000));

            await expect(insert(locks, lockOf('l2', 'k', 'o2', 2_000))).rejects.toBeInstanceOf(EntityConflictError);
            expect(await locks.findOneBy({ key: 'k' })).toStrictEqual(lockOf('l1', 'k', 'o1', 1_000));
            expect(await locks.findOneById(testUuid('l2'))).toBeNull();
        });

        it('save of a read lock writes its owner and expiry in place, keeps the id and resolves the next read', async () => {
            await insert(locks, lockOf('l1', 'k', 'o1', 1_000));

            const read = (await locks.findOneBy({ key: 'k' }))!;

            locks.merge(read, { owner: 'o2', expiresAt: new Date(5_000) });

            const saved = await locks.save(read);

            expect(saved).toStrictEqual(lockOf('l1', 'k', 'o2', 5_000));
            expect(await locks.findOneBy({ key: 'k' })).toStrictEqual(saved);
        });

        it('remove deletes the lock; the key can be stored again', async () => {
            await insert(locks, lockOf('l1', 'k', 'o1', 1_000));
            await locks.remove((await locks.findOneBy({ key: 'k' }))!);

            expect(await locks.findOneBy({ key: 'k' })).toBeNull();
            expect(await insert(locks, lockOf('l2', 'k', 'o2', 1_000))).toStrictEqual(lockOf('l2', 'k', 'o2', 1_000));
        });

        it('removeExpiredBy removes exactly the locks expired at the time and resolves how many', async () => {
            await insert(locks, lockOf('l1', 'before', 'o', 4_999));
            await insert(locks, lockOf('l2', 'at', 'o', 5_000));
            await insert(locks, lockOf('l3', 'after', 'o', 5_001));

            expect(await locks.removeExpiredBy(new Date(5_000))).toBe(2);
            expect(await locks.findOneBy({ key: 'before' })).toBeNull();
            expect(await locks.findOneBy({ key: 'at' })).toBeNull();
            expect(await locks.findOneBy({ key: 'after' })).toStrictEqual(lockOf('l3', 'after', 'o', 5_001));
            expect(await locks.removeExpiredBy(new Date(5_000))).toBe(0);
        });

        it('removeExpiredBy keeps a lock a transaction in flight renews past the time', async () => {
            await insert(locks, lockOf('l1', 'k', 'o1', 1_000));

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const renewing = locks.transaction(async (repository) => {
                const read = (await repository.findOneBy({ key: 'k' }))!;

                lock();
                await release;
                repository.merge(read, { expiresAt: new Date(9_000) });
                await repository.save(read);
            });

            await locked;

            const purge = locks.removeExpiredBy(new Date(5_000));

            // the purge waits for the row the renewal holds before the renewal commits
            await input.untilBlocked();
            done();
            await renewing;
            expect(await purge).toBe(0);
            expect(await locks.findOneBy({ key: 'k' })).toStrictEqual(lockOf('l1', 'k', 'o1', 9_000));
        });

        it('copies values in and out', async () => {
            const lock = lockOf('l1', 'k', 'o1', 1_000);

            await insert(locks, lock);
            lock.expiresAt.setTime(9_000);

            const read = (await locks.findOneBy({ key: 'k' }))!;

            expect(read.expiresAt).toEqual(new Date(1_000));
            read.expiresAt.setTime(9_000);
            expect((await locks.findOneBy({ key: 'k' }))!.expiresAt).toEqual(new Date(1_000));
        });

        it('concurrent first saves of one key: exactly one is stored, the others are EntityConflictError', async () => {
            const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => insert(locks, lockOf(`l${i}`, 'k', `o${i}`, 1_000))));
            const stored = results.findIndex((result) => result.status === 'fulfilled');

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')
                .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);
            expect((await locks.findOneBy({ key: 'k' }))!.owner).toBe(`o${stored}`);
        });

        it('transactions that read and save one lock apply one after the other: no change is lost', async () => {
            await insert(locks, lockOf('l1', 'k', 'o', 0));

            const extend = () => locks.transaction(async (repository) => {
                const lock = (await repository.findOneBy({ key: 'k' }))!;

                // other transactions get their turn between the read and the write
                await Promise.resolve();
                await Promise.resolve();
                repository.merge(lock, { expiresAt: new Date(lock.expiresAt.getTime() + 1) });
                await repository.save(lock);
            });

            await Promise.all(Array.from({ length: 10 }, () => extend()));
            expect((await locks.findOneBy({ key: 'k' }))!.expiresAt).toEqual(new Date(10));
        });

        it('nextToken issues distinct, increasing tokens at or above the wall clock in microseconds, also concurrently', async () => {
            const floor = Date.now() * 1000 - CLOCK_TOLERANCE_US;
            const first = await locks.nextToken();

            expect(Number.isSafeInteger(first)).toBe(true);
            expect(first).toBeGreaterThanOrEqual(floor);

            const tokens = await Promise.all(Array.from({ length: 20 }, () => locks.nextToken()));

            expect(new Set(tokens).size).toBe(20);
            expect(Math.min(...tokens)).toBeGreaterThan(first);
            expect(await locks.nextToken()).toBeGreaterThan(Math.max(...tokens));
        });

        it('stores the token of a lock and keeps it when the owner and expiry change', async () => {
            await insert(locks, lockOf('l1', 'k', 'o1', 1_000, 1_700_000_000_000_001));

            const read = (await locks.findOneBy({ key: 'k' }))!;

            expect(read.token).toBe(1_700_000_000_000_001);
            locks.merge(read, { expiresAt: new Date(2_000) });
            await locks.save(read);
            expect((await locks.findOneBy({ key: 'k' }))!.token).toBe(1_700_000_000_000_001);
        });

        describe('through a LockService', () => {
            let clock: ControllableClock;
            let service: LockService;

            const tokenOf = async (key: string) => (await locks.findOneBy({ key }))!.token;

            beforeEach(() => {
                clock = new ControllableClock(new Date(10_000));
                service = new LockService({ repository: locks, clock });
            });

            it('acquire stores a uuid v7 id and resolves the stored token, at or above the wall clock in microseconds; a refusal resolves undefined', async () => {
                const floor = Date.now() * 1000 - CLOCK_TOLERANCE_US;
                const token = await service.acquire('k', 'a', 1_000);

                expect(token).toBeTypeOf('number');
                expect((await locks.findOneBy({ key: 'k' }))!.id).toMatch(UUID_V7);
                expect(token).toBeGreaterThanOrEqual(floor);
                expect(await tokenOf('k')).toBe(token);
                expect(await service.acquire('k', 'b', 1_000)).toBeUndefined();
            });

            it('a takeover after expiry resolves a higher token and keeps the row id', async () => {
                const first = (await service.acquire('k', 'a', 1_000))!;
                const { id } = (await locks.findOneBy({ key: 'k' }))!;

                clock.advance(1_000);

                const second = (await service.acquire('k', 'b', 1_000))!;

                expect(second).toBeGreaterThan(first);
                expect(await locks.findOneBy({ key: 'k' })).toMatchObject({
                    id,
                    owner: 'b',
                    token: second,
                });
            });

            it('acquire after a release resolves a higher token', async () => {
                const first = (await service.acquire('k', 'a', 1_000))!;

                await service.release('k', 'a');

                expect(await service.acquire('k', 'a', 1_000)).toBeGreaterThan(first);
            });

            it('renew keeps the stored token', async () => {
                const token = await service.acquire('k', 'a', 1_000);

                clock.advance(500);
                expect(await service.renew('k', 'a', 1_000)).toBe(true);
                expect(await tokenOf('k')).toBe(token);
            });

            it('a second key gets a token above the first key\'s', async () => {
                const first = (await service.acquire('a', 'o', 1_000))!;

                expect(await service.acquire('b', 'o', 1_000)).toBeGreaterThan(first);
            });
        });
    });
}
