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
import { EntityDeadlockError } from '@chamvi/store';
import type { Lock } from '@chamvi/store';
import { MemoryLockRepository, MemoryRegistry } from '@chamvi/store-memory';
import { type ILockService, LockService } from '../../../src/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

/**
 * Counts the transactions it runs; `beforeRead` runs once before the next
 * locked read, `beforeInsert` once before the next insert. The probe is one object its transaction copies share.
 */
class ProbedLockRepository extends MemoryLockRepository {
    readonly probe: {
        transactions: number;
        reads: number;
        inserts: number;
        beforeRead?: () => Promise<void>;
        beforeInsert?: () => Promise<void>;
    } = {
        transactions: 0,
        reads: 0,
        inserts: 0,
    };

    override async transaction<R>(fn: (repository: this) => Promise<R>): Promise<R> {
        if (!this.tx) {
            this.probe.transactions += 1;
        }

        return super.transaction(fn);
    }

    override async save(entity: Lock): Promise<Lock> {
        if (this.created.has(entity)) {
            this.probe.inserts += 1;

            const hook = this.probe.beforeInsert;

            if (hook) {
                this.probe.beforeInsert = undefined;
                await hook();
            }
        }

        return super.save(entity);
    }

    override async findOneBy(where: Partial<Lock>): Promise<Lock | null> {
        if (!this.tx) {
            this.probe.reads += 1;
        }

        const hook = this.tx ? this.probe.beforeRead : undefined;

        if (hook) {
            this.probe.beforeRead = undefined;
            await hook();
        }

        return super.findOneBy(where);
    }
}

describe('LockService', () => {
    let clock: ControllableClock;
    let repository: ProbedLockRepository;
    let locks: ILockService;

    beforeEach(() => {
        clock = new ControllableClock(new Date(10_000));
        repository = new ProbedLockRepository({ registry: new MemoryRegistry() });
        locks = new LockService({ repository, clock });
    });

    it('acquire takes a free key once: another owner and the same owner are refused while it is held', async () => {
        expect(await locks.acquire('k', 'a', 1_000)).toBe(true);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        expect(await locks.acquire('k', 'a', 1_000)).toBe(false);
        expect(await locks.acquire('other', 'b', 1_000)).toBe(true);
        expect(await repository.findOneBy({ key: 'k' })).toMatchObject({
            key: 'k',
            owner: 'a',
            expiresAt: new Date(11_000),
        });
    });

    it('a lease created at T expires at exactly T + ttlMs', async () => {
        expect(await locks.acquire('k', 'a', 1_000)).toBe(true);

        clock.advance(999);
        expect(await locks.holds('k', 'a')).toBe(true);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);

        clock.advance(1);
        expect(await locks.holds('k', 'a')).toBe(false);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('a takeover of an expired lease keeps the stored row', async () => {
        await locks.acquire('k', 'a', 1_000);

        const { id } = (await repository.findOneBy({ key: 'k' }))!;

        clock.advance(1_000);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        expect(await repository.findOneBy({ key: 'k' })).toEqual({
            id,
            key: 'k',
            owner: 'b',
            expiresAt: new Date(12_000),
        });
    });

    it('release by the owner frees the key; a release by another owner or of an unknown key does nothing', async () => {
        await locks.acquire('k', 'a', 1_000);

        await locks.release('k', 'b');
        await locks.release('missing', 'a');
        expect(await locks.holds('k', 'a')).toBe(true);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);

        await locks.release('k', 'a');
        expect(await repository.findOneBy({ key: 'k' })).toBeNull();
        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
    });

    it('release by the owner of an expired lease removes it; after a takeover the former owner releases nothing', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);
        await locks.release('k', 'a');
        expect(await repository.findOneBy({ key: 'k' })).toBeNull();

        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);
        await locks.acquire('k', 'b', 1_000);
        await locks.release('k', 'a');
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('renew extends a held lease to exactly now + ttlMs', async () => {
        expect(await locks.acquire('k', 'a', 1_000)).toBe(true);
        clock.advance(999);
        expect(await locks.renew('k', 'a', 1_000)).toBe(true);
        clock.advance(1);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        clock.advance(998);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        clock.advance(1);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
    });

    it('renew is refused for an unknown key, another owner, after expiry, after a takeover and after release', async () => {
        expect(await locks.renew('missing', 'a', 1_000)).toBe(false);
        expect(await repository.findOneBy({ key: 'missing' })).toBeNull();
        expect(await locks.acquire('k', 'a', 1_000)).toBe(true);
        expect(await locks.renew('k', 'b', 1_000)).toBe(false);
        clock.advance(1_000);
        expect(await locks.renew('k', 'a', 1_000)).toBe(false);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        expect(await locks.renew('k', 'a', 1_000)).toBe(false);
        expect(await locks.renew('k', 'b', 1_000)).toBe(true);
        await locks.release('k', 'b');
        expect(await locks.renew('k', 'b', 1_000)).toBe(false);
        expect(await locks.acquire('k', 'c', 1_000)).toBe(true);
    });

    it('renew of an expired lease fails even if nobody took it, and leaves it as it was', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(5_000);

        expect(await locks.renew('k', 'a', 1_000)).toBe(false);
        expect(await repository.findOneBy({ key: 'k' })).toMatchObject({ owner: 'a', expiresAt: new Date(11_000) });
        expect(await locks.holds('k', 'a')).toBe(false);
    });

    it('holds answers for the owner of an unexpired lease only', async () => {
        expect(await locks.holds('k', 'a')).toBe(false);
        await locks.acquire('k', 'a', 1_000);
        expect(await locks.holds('k', 'a')).toBe(true);
        expect(await locks.holds('k', 'b')).toBe(false);
        await locks.release('k', 'a');
        expect(await locks.holds('k', 'a')).toBe(false);
    });

    it('of twenty concurrent acquirers of one key exactly one acquires', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => locks.acquire('k', `o${i}`, 1_000)));

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await repository.findOneBy({ key: 'k' }))!.owner).toBe(`o${results.indexOf(true)}`);
    });

    it('two first acquirers of one lock: exactly one acquires', async () => {
        const results = await Promise.all([locks.acquire('k', 'a', 1_000), locks.acquire('k', 'b', 1_000)]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await repository.findOneBy({ key: 'k' }))!.owner).toBe(results[0] ? 'a' : 'b');
    });

    it('two owners taking over one expired lock together: exactly one succeeds, and a renew by the previous owner then fails', async () => {
        await locks.acquire('k', 'old', 1_000);
        clock.advance(1_000);

        const results = await Promise.all([locks.acquire('k', 'a', 1_000), locks.acquire('k', 'b', 1_000)]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await repository.findOneBy({ key: 'k' }))!.owner).toBe(results[0] ? 'a' : 'b');
        expect(await locks.renew('k', 'old', 1_000)).toBe(false);
        expect(await locks.holds('k', results[0] ? 'a' : 'b')).toBe(true);
    });

    it('a held key is refused on one plain read: no transaction, no insert', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(999);
        Object.assign(repository.probe, {
            transactions: 0,
            reads: 0,
            inserts: 0,
        });

        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        expect(repository.probe).toMatchObject({
            transactions: 0,
            reads: 1,
            inserts: 0,
        });
    });

    it('an acquirer of a key whose holder keeps renewing returns not acquired, it does not spin', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(900);
        await locks.renew('k', 'a', 1_000);
        repository.probe.transactions = 0;

        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        expect(repository.probe.transactions).toBe(0);
    });

    it('an acquirer that found an expired lease and lost the takeover to a renewal returns not acquired after one takeover read', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);
        // the holder's renewal lands between the plain read and the takeover's locked read
        repository.probe.beforeRead = async () => {
            await repository.transaction(async (bound) => {
                const lock = (await bound.findOneBy({ key: 'k' }))!;

                bound.merge(lock, { expiresAt: new Date(clock.now().getTime() + 1_000) });
                await bound.save(lock);
            });
        };
        repository.probe.transactions = 0;

        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        // the renewal above and the takeover read: no insert is tried
        expect(repository.probe.transactions).toBe(2);
    });

    it('an expired lease is taken over in one transaction: no insert is tried', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);
        repository.probe.transactions = 0;

        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        expect(repository.probe.transactions).toBe(1);
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('acquire inserts again when another lease was inserted after its plain read and released before its locked read', async () => {
        // the plain read finds the key free; another owner inserts it before this insert, and releases it before the takeover reads
        repository.probe.beforeInsert = async () => {
            expect(await locks.acquire('k', 'x', 1_000)).toBe(true);
            repository.probe.beforeRead = () => locks.release('k', 'x');
        };
        repository.probe.transactions = 0;
        repository.probe.inserts = 0;

        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        // the insert, the other owner's insert, the takeover, the release, the second insert
        expect(repository.probe.transactions).toBe(5);
        expect(repository.probe.inserts).toBe(3);
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('acquire inserts when the lease was released between its plain read and its locked read', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);
        repository.probe.beforeRead = () => locks.release('k', 'a');
        repository.probe.transactions = 0;

        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        // the takeover, the release above and the insert
        expect(repository.probe.transactions).toBe(3);
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('reads the clock after the row lock: a takeover waiting for a renewal compares a fresh time', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);

        // the holder renews to 12_000 while the takeover waits for its row lock
        const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        const holder = repository.transaction(async (bound) => {
            const lease = (await bound.findOneBy({ key: 'k' }))!;

            lock();
            await release;
            bound.merge(lease, { expiresAt: new Date(12_000) });
            await bound.save(lease);
        });

        await locked;

        const { promise: reading, resolve: read } = Promise.withResolvers<void>();

        repository.probe.beforeRead = async () => {
            read();
        };

        const acquire = locks.acquire('k', 'b', 1_000);

        await reading;
        // past the renewed expiry by the time the row is free: a time read before the lock (11_000) would refuse
        clock.advance(1_500);
        done();
        await holder;
        expect(await acquire).toBe(true);
    });

    it('passes a storage error other than a conflict through', async () => {
        const failing = new ProbedLockRepository({ registry: new MemoryRegistry() });

        failing.save = async () => {
            throw new EntityDeadlockError('lock');
        };

        await expect(new LockService({ repository: failing, clock }).acquire('k', 'a', 1_000)).rejects.toBeInstanceOf(EntityDeadlockError);
    });

    it('purgeExpired deletes exactly the leases expired at the given time (default now) and resolves how many', async () => {
        await locks.acquire('before', 'a', 999);
        await locks.acquire('at', 'a', 1_000);
        await locks.acquire('after', 'a', 1_001);

        expect(await locks.purgeExpired(new Date(11_000))).toBe(2);
        expect(await repository.findOneBy({ key: 'before' })).toBeNull();
        expect(await repository.findOneBy({ key: 'at' })).toBeNull();
        expect(await locks.holds('after', 'a')).toBe(true);

        clock.advance(1_001);
        expect(await locks.purgeExpired()).toBe(1);
        expect(await repository.findOneBy({ key: 'after' })).toBeNull();
    });
});
