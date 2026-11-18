/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { LockService } from '@chamvi/core';
import type { Lock } from '@chamvi/store';
import { ControllableClock } from '@chamvi/test-kit';
import { DatabaseLockRepository } from '../../../../src/repositories/lock/index.ts';
import { createBarrier } from '../../../utils/barrier.ts';
import type { Barrier } from '../../../utils/barrier.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

type Probe = {
    /** The first arrivals of an insert wait for each other here (no row is locked yet). */
    insert?: Barrier;
    /** The first arrivals of a transaction's single-row read wait for each other here, before the read locks. */
    read?: Barrier;
    /** Runs once before the next single-row read of a transaction. */
    beforeRead?: () => Promise<void>;
    /** Runs once before the next insert of a transaction. */
    beforeInsert?: () => Promise<void>;
};

/** Holds inserts and reads at barriers so racing transactions meet, and signals reads. */
class ProbedLockRepository extends DatabaseLockRepository {
    protected probe: Probe;

    constructor(source: DataSource | EntityManager, probe: Probe) {
        super(source);
        this.probe = probe;
    }

    override withManager(manager: EntityManager): this {
        return new ProbedLockRepository(manager, this.probe) as this;
    }

    override async save(entity: Lock): Promise<Lock> {
        if (this.tx && this.marks.created.has(entity)) {
            const hook = this.probe.beforeInsert;

            this.probe.beforeInsert = undefined;
            await hook?.();
            await this.probe.insert?.arrive();
        }

        return super.save(entity);
    }

    override async findOneBy(where: Partial<Lock>): Promise<Lock | null> {
        if (this.tx) {
            const hook = this.probe.beforeRead;

            this.probe.beforeRead = undefined;
            await hook?.();
            await this.probe.read?.arrive();
        }

        return super.findOneBy(where);
    }
}

/** The statements a data source sends and the ones that failed, while `recording`. */
function recordStatements(dataSource: DataSource) {
    const log = {
        recording: false,
        statements: [] as string[],
        failed: [] as string[],
    };
    const keep = (target: string[], query: string) => {
        if (log.recording) {
            target.push(query);
        }
    };

    // TypeORM hands every statement to its logger, whatever the logging option
    Object.assign(dataSource, {
        logger: {
            logQuery: (query: string) => keep(log.statements, query),
            logQueryError: (_error: unknown, query: string) => keep(log.failed, query),
            logQuerySlow: () => {},
            logSchemaBuild: () => {},
            logMigration: () => {},
            log: () => {},
        },
    });

    return log;
}

// the lock service's rules on PostgreSQL: the concurrent cases
describePostgres('lock service on postgres', () => {
    let dataSource: DataSource;
    let log: ReturnType<typeof recordStatements>;
    let clock: ControllableClock;
    let repository: DatabaseLockRepository;
    let locks: LockService;

    const probed = (probe: Probe) => new LockService({ repository: new ProbedLockRepository(dataSource, probe), clock });

    beforeAll(async () => {
        dataSource = await createTestDataSource();
        log = recordStatements(dataSource);
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        clock = new ControllableClock(new Date(10_000));
        repository = new DatabaseLockRepository(dataSource);
        locks = new LockService({ repository, clock });
    });

    it('a held key is refused with one statement and no unique violation', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(999);
        log.statements = [];
        log.failed = [];
        log.recording = true;

        try {
            expect(await locks.acquire('k', 'b', 1_000)).toEqual(false);
        } finally {
            log.recording = false;
        }

        expect(log.statements).toHaveLength(1);
        expect(log.statements[0]).toMatch(/^SELECT/);
        expect(log.failed).toEqual([]);
    });

    it('an expired lease is taken over in five statements and no unique violation', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);
        log.statements = [];
        log.failed = [];
        log.recording = true;

        try {
            expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
        } finally {
            log.recording = false;
        }

        // the plain read, then BEGIN, the locked read, the update, COMMIT: no insert is tried
        expect(log.statements).toHaveLength(5);
        expect(log.statements.filter((statement) => statement.startsWith('INSERT'))).toEqual([]);
        expect(log.failed).toEqual([]);
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('two first acquirers of one lock: exactly one acquires', async () => {
        const racing = probed({ insert: createBarrier(2) });
        const results = await Promise.all([racing.acquire('k', 'a', 1_000), racing.acquire('k', 'b', 1_000)]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await repository.findOneBy({ key: 'k' }))!.owner).toBe(results[0] ? 'a' : 'b');
    });

    it('of twenty concurrent acquirers of one key exactly one acquires', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => locks.acquire('k', `o${i}`, 1_000)));

        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('two owners taking over one expired lock together: exactly one succeeds, and a renew by the previous owner then fails', async () => {
        await locks.acquire('k', 'old', 1_000);
        clock.advance(1_000);

        const racing = probed({ read: createBarrier(2) });
        const results = await Promise.all([racing.acquire('k', 'a', 1_000), racing.acquire('k', 'b', 1_000)]);
        const winner = results[0] ? 'a' : 'b';

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await repository.findOneBy({ key: 'k' }))!.owner).toBe(winner);
        expect(await locks.renew('k', 'old', 1_000)).toBe(false);
        expect(await locks.holds('k', winner)).toBe(true);
    });

    it('a lease created at T expires at exactly T + ttlMs', async () => {
        expect(await locks.acquire('k', 'a', 1_000)).toBe(true);
        clock.advance(999);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        clock.advance(1);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(true);
    });

    it('renew of an expired lease fails even if nobody took it; a release by another owner does nothing', async () => {
        await locks.acquire('k', 'a', 1_000);
        await locks.release('k', 'b');
        expect(await locks.holds('k', 'a')).toBe(true);

        clock.advance(1_000);
        expect(await locks.renew('k', 'a', 1_000)).toBe(false);
        expect(await repository.findOneBy({ key: 'k' })).toMatchObject({ owner: 'a', expiresAt: new Date(11_000) });
    });

    it('an acquirer of a key whose holder keeps renewing returns not acquired, it does not spin', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(900);
        expect(await locks.renew('k', 'a', 1_000)).toBe(true);
        expect(await locks.acquire('k', 'b', 1_000)).toBe(false);
        expect((await repository.findOneBy({ key: 'k' }))!.owner).toBe('a');
    });

    it('acquire inserts again when another lease was inserted after its plain read and released before its locked read', async () => {
        // the plain read finds the key free; another owner inserts it before this insert, and releases it before the takeover reads
        const racing = probed({
            beforeInsert: async () => {
                expect(await locks.acquire('k', 'x', 1_000)).toBe(true);
            },
            beforeRead: () => locks.release('k', 'x'),
        });

        log.failed = [];
        log.recording = true;

        try {
            expect(await racing.acquire('k', 'b', 1_000)).toBe(true);
        } finally {
            log.recording = false;
        }

        // the first insert met the other owner's row: one unique violation, then the second insert
        expect(log.failed).toHaveLength(1);
        expect(log.failed[0]).toMatch(/^INSERT/);
        expect(await locks.holds('k', 'b')).toBe(true);
    });

    it('acquire inserts when the lease was released between its plain read and its locked read', async () => {
        await locks.acquire('k', 'a', 1_000);
        clock.advance(1_000);

        const racing = probed({ beforeRead: () => locks.release('k', 'a') });

        expect(await racing.acquire('k', 'b', 1_000)).toBe(true);
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

        // the takeover signals its locked read of the row (which then waits for the holder)
        const { promise: reading, resolve: read } = Promise.withResolvers<void>();
        const acquire = probed({
            beforeRead: async () => {
                read();
            },
        }).acquire('k', 'b', 1_000);

        await reading;
        // past the renewed expiry by the time the row is free: a time read before the lock (11_000) would refuse
        clock.advance(1_500);
        done();
        await holder;
        expect(await acquire).toBe(true);
    });
});
