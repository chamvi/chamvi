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
import type { IdempotencyKey } from '@chamvi/core-kit';
import { MemoryIdempotencyRepository, MemoryRegistry } from '@chamvi/store-memory';
import { type IIdempotencyService, IdempotencyService } from '../../../src/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

/**
 * Counts the transactions it runs; `beforeRead` runs once before the next
 * locked read, `beforeInsert` once before the next insert. The probe is one object its transaction copies share.
 */
class ProbedIdempotencyRepository extends MemoryIdempotencyRepository {
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

    override async save(entity: IdempotencyKey): Promise<IdempotencyKey> {
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

    override async findOneBy(where: Partial<IdempotencyKey>): Promise<IdempotencyKey | null> {
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

describe('IdempotencyService', () => {
    let clock: ControllableClock;
    let repository: ProbedIdempotencyRepository;
    let keys: IIdempotencyService;

    beforeEach(() => {
        clock = new ControllableClock(new Date(10_000));
        repository = new ProbedIdempotencyRepository({ registry: new MemoryRegistry() });
        keys = new IdempotencyService({ repository, clock });
    });

    it('claim returns the first run\'s id to the second caller', async () => {
        expect(await keys.claim('a:http', 'k', 'run-1', 60_000)).toEqual({ created: true, runId: 'run-1' });
        expect(await keys.claim('a:http', 'k', 'run-2', 60_000)).toEqual({ created: false, runId: 'run-1' });
        expect(await repository.findOneBy({ scope: 'a:http', key: 'k' })).toMatchObject({
            runId: 'run-1',
            expiresAt: new Date(70_000),
        });
    });

    it('claims one key in two scopes and two keys in one scope independently', async () => {
        await keys.claim('a:http', 'k', 'run-1', 60_000);

        expect(await keys.claim('b:http', 'k', 'run-2', 60_000)).toEqual({ created: true, runId: 'run-2' });
        expect(await keys.claim('a:http', 'other', 'run-3', 60_000)).toEqual({ created: true, runId: 'run-3' });
    });

    it('a claim made at T expires at exactly T + ttlMs; the takeover keeps the stored row', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);

        const { id } = (await repository.findOneBy({ scope: 's', key: 'k' }))!;

        clock.advance(999);
        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: false, runId: 'run-1' });
        clock.advance(1);
        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: true, runId: 'run-2' });
        expect(await repository.findOneBy({ scope: 's', key: 'k' })).toEqual({
            id,
            scope: 's',
            key: 'k',
            runId: 'run-2',
            expiresAt: new Date(12_000),
        });
        expect(await keys.claim('s', 'k', 'run-3', 1_000)).toEqual({ created: false, runId: 'run-2' });
    });

    it('of twenty concurrent claims of one key exactly one creates it and every caller gets its run', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => keys.claim('github', 'd1', `run-${i}`, 60_000)));
        const winner = results.find((result) => result.created)!;

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results.every((result) => result.runId === winner.runId)).toBe(true);
    });

    it('two callers taking over one expired claim together: exactly one creates it, the other gets its run', async () => {
        await keys.claim('s', 'k', 'run-old', 1_000);
        clock.advance(1_000);

        const results = await Promise.all([keys.claim('s', 'k', 'run-a', 1_000), keys.claim('s', 'k', 'run-b', 1_000)]);
        const winner = results.find((result) => result.created)!;

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results.map((result) => result.runId)).toEqual([winner.runId, winner.runId]);
        expect((await repository.findOneBy({ scope: 's', key: 'k' }))!.runId).toBe(winner.runId);
    });

    it('a claimed key is refused on one plain read: no transaction, no insert', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);
        clock.advance(999);
        Object.assign(repository.probe, {
            transactions: 0,
            reads: 0,
            inserts: 0,
        });

        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: false, runId: 'run-1' });
        expect(repository.probe).toMatchObject({
            transactions: 0,
            reads: 1,
            inserts: 0,
        });
    });

    it('an expired key is taken over in one transaction: no insert is tried', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);
        clock.advance(1_000);
        repository.probe.transactions = 0;

        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: true, runId: 'run-2' });
        expect(repository.probe.transactions).toBe(1);
    });

    it('claim inserts again when another claim was inserted after its plain read and purged before its locked read', async () => {
        // the plain read finds the key free; another claim inserts it (expiring at once) before this insert, and is purged before the takeover reads
        repository.probe.beforeInsert = async () => {
            expect(await keys.claim('s', 'k', 'run-x', 0)).toEqual({ created: true, runId: 'run-x' });
            repository.probe.beforeRead = async () => {
                expect(await keys.purgeExpired()).toBe(1);
            };
        };
        repository.probe.transactions = 0;
        repository.probe.inserts = 0;

        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: true, runId: 'run-2' });
        // the insert, the other claim's insert, the takeover, the purge, the second insert
        expect(repository.probe.transactions).toBe(5);
        expect(repository.probe.inserts).toBe(3);
        expect(await keys.claim('s', 'k', 'run-3', 1_000)).toEqual({ created: false, runId: 'run-2' });
    });

    it('claim inserts when the claim was purged between its plain read and its locked read', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);
        clock.advance(1_000);
        repository.probe.beforeRead = async () => {
            await keys.purgeExpired();
        };
        repository.probe.transactions = 0;

        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: true, runId: 'run-2' });
        // the takeover, the purge above and the insert
        expect(repository.probe.transactions).toBe(3);
    });

    it('reads the clock after the row lock: a takeover waiting for another claim compares a fresh time', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);
        clock.advance(1_000);

        // another claimer extends the key to 12_000 while the takeover waits for its row lock
        const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        const holder = repository.transaction(async (bound) => {
            const stored = (await bound.findOneBy({ scope: 's', key: 'k' }))!;

            lock();
            await release;
            bound.merge(stored, { expiresAt: new Date(12_000) });
            await bound.save(stored);
        });

        await locked;

        const { promise: reading, resolve: read } = Promise.withResolvers<void>();

        repository.probe.beforeRead = async () => {
            read();
        };

        const claim = keys.claim('s', 'k', 'run-2', 1_000);

        await reading;
        // past 12_000 by the time the row is free: a time read before the lock (11_000) would refuse
        clock.advance(1_500);
        done();
        await holder;
        expect(await claim).toEqual({ created: true, runId: 'run-2' });
    });

    it('findOne returns an unexpired claim and undefined for an expired or missing one', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);

        expect(await keys.findOne('s', 'k')).toEqual({ created: false, runId: 'run-1' });
        expect(await keys.findOne('s', 'other')).toBeUndefined();
        expect(await keys.findOne('other', 'k')).toBeUndefined();

        clock.advance(999);
        expect(await keys.findOne('s', 'k')).toEqual({ created: false, runId: 'run-1' });
        clock.advance(1);
        expect(await keys.findOne('s', 'k')).toBeUndefined();
    });

    it('release expires the claim of the given run, so the next claim takes it over', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);
        clock.advance(10);

        await keys.release('s', 'k', 'run-1');

        expect(await keys.findOne('s', 'k')).toBeUndefined();
        expect(await repository.findOneBy({ scope: 's', key: 'k' })).toMatchObject({ runId: 'run-1', expiresAt: new Date(10_010) });
        expect(await keys.claim('s', 'k', 'run-2', 1_000)).toEqual({ created: true, runId: 'run-2' });
    });

    it('release leaves a claim of another run and a missing key alone', async () => {
        await keys.claim('s', 'k', 'run-1', 1_000);

        await keys.release('s', 'k', 'run-2');
        await keys.release('s', 'missing', 'run-1');

        expect(await keys.findOne('s', 'k')).toEqual({ created: false, runId: 'run-1' });
        expect(await repository.findOneBy({ scope: 's', key: 'missing' })).toBeNull();
    });

    it('purgeExpired deletes exactly the claims expired at the given time (default now) and resolves how many', async () => {
        await keys.claim('s', 'before', 'run-1', 999);
        await keys.claim('s', 'at', 'run-2', 1_000);
        await keys.claim('s', 'after', 'run-3', 1_001);

        expect(await keys.purgeExpired(new Date(11_000))).toBe(2);
        expect(await repository.findOneBy({ scope: 's', key: 'before' })).toBeNull();
        expect(await repository.findOneBy({ scope: 's', key: 'at' })).toBeNull();
        expect(await keys.claim('s', 'after', 'run-4', 1_000)).toEqual({ created: false, runId: 'run-3' });

        clock.advance(1_001);
        expect(await keys.purgeExpired()).toBe(1);
        expect(await repository.findOneBy({ scope: 's', key: 'after' })).toBeNull();
    });
});
