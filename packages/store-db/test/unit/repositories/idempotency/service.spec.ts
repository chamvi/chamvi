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
import { type IIdempotencyService, IdempotencyService } from '@chamvi/core';
import type { IdempotencyKey } from '@chamvi/core-kit';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { DatabaseIdempotencyRepository } from '../../../../src/repositories/idempotency/index.ts';
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
class ProbedIdempotencyRepository extends DatabaseIdempotencyRepository {
    protected probe: Probe;

    constructor(source: DataSource | EntityManager, probe: Probe) {
        super(source);
        this.probe = probe;
    }

    override withManager(manager: EntityManager): this {
        return new ProbedIdempotencyRepository(manager, this.probe) as this;
    }

    override async save(entity: IdempotencyKey): Promise<IdempotencyKey> {
        if (this.tx && this.marks.created.has(entity)) {
            const hook = this.probe.beforeInsert;

            this.probe.beforeInsert = undefined;
            await hook?.();
            await this.probe.insert?.arrive();
        }

        return super.save(entity);
    }

    override async findOneBy(where: Partial<IdempotencyKey>): Promise<IdempotencyKey | null> {
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

// the idempotency service's rules on PostgreSQL: the concurrent cases
describePostgres('idempotency service on postgres', () => {
    let dataSource: DataSource;
    let log: ReturnType<typeof recordStatements>;
    let clock: ControllableClock;
    let repository: DatabaseIdempotencyRepository;
    let keys: IIdempotencyService;

    const probed = (probe: Probe) => new IdempotencyService({ repository: new ProbedIdempotencyRepository(dataSource, probe), clock });

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
        repository = new DatabaseIdempotencyRepository(dataSource);
        keys = new IdempotencyService({ repository, clock });
    });

    it('claim returns the first run\'s id to the second caller', async () => {
        expect(await keys.claim('s', 'k', testUuid('r1'), 1_000)).toEqual({ created: true, runId: testUuid('r1') });
        expect(await keys.claim('s', 'k', testUuid('r2'), 1_000)).toEqual({ created: false, runId: testUuid('r1') });
    });

    it('a held key is refused with one statement and no unique violation', async () => {
        await keys.claim('s', 'k', testUuid('r1'), 1_000);
        clock.advance(999);
        log.statements = [];
        log.failed = [];
        log.recording = true;

        try {
            expect(await keys.claim('s', 'k', testUuid('r2'), 1_000)).toEqual({ created: false, runId: testUuid('r1') });
        } finally {
            log.recording = false;
        }

        expect(log.statements).toHaveLength(1);
        expect(log.statements[0]).toMatch(/^SELECT/);
        expect(log.failed).toEqual([]);
    });

    it('an expired key is taken over in five statements and no unique violation', async () => {
        await keys.claim('s', 'k', testUuid('r1'), 1_000);
        clock.advance(1_000);
        log.statements = [];
        log.failed = [];
        log.recording = true;

        try {
            expect(await keys.claim('s', 'k', testUuid('r2'), 1_000)).toEqual({ created: true, runId: testUuid('r2') });
        } finally {
            log.recording = false;
        }

        // the plain read, then BEGIN, the locked read, the update, COMMIT: no insert is tried
        expect(log.statements).toHaveLength(5);
        expect(log.statements.filter((statement) => statement.startsWith('INSERT'))).toEqual([]);
        expect(log.failed).toEqual([]);
        expect(await keys.claim('s', 'k', testUuid('r3'), 1_000)).toEqual({ created: false, runId: testUuid('r2') });
    });

    it('claim inserts again when another claim was inserted after its plain read and purged before its locked read', async () => {
        // the plain read finds the key free; another claim inserts it (expiring at once) before this insert, and is purged before the takeover reads
        const racing = probed({
            beforeInsert: async () => {
                expect(await keys.claim('s', 'k', testUuid('rx'), 0)).toEqual({ created: true, runId: testUuid('rx') });
            },
            beforeRead: async () => {
                expect(await keys.purgeExpired()).toBe(1);
            },
        });

        log.failed = [];
        log.recording = true;

        try {
            expect(await racing.claim('s', 'k', testUuid('r2'), 1_000)).toEqual({ created: true, runId: testUuid('r2') });
        } finally {
            log.recording = false;
        }

        // the first insert met the other claim's row: one unique violation, then the second insert
        expect(log.failed).toHaveLength(1);
        expect(log.failed[0]).toMatch(/^INSERT/);
        expect(await keys.claim('s', 'k', testUuid('r3'), 1_000)).toEqual({ created: false, runId: testUuid('r2') });
    });

    it('findOne returns an unexpired claim and undefined for an expired or missing one', async () => {
        await keys.claim('s', 'k', testUuid('r1'), 1_000);

        expect(await keys.findOne('s', 'k')).toEqual({ created: false, runId: testUuid('r1') });
        expect(await keys.findOne('s', 'other')).toBeUndefined();
        clock.advance(1_000);
        expect(await keys.findOne('s', 'k')).toBeUndefined();
    });

    it('release expires only the given run\'s claim; the next claim takes it over', async () => {
        await keys.claim('s', 'k', testUuid('r1'), 1_000);

        await keys.release('s', 'k', testUuid('r2'));
        await keys.release('s', 'missing', testUuid('r1'));
        expect(await keys.findOne('s', 'k')).toEqual({ created: false, runId: testUuid('r1') });
        expect(await repository.findOneBy({ scope: 's', key: 'missing' })).toBeNull();

        clock.advance(10);
        await keys.release('s', 'k', testUuid('r1'));

        expect(await keys.findOne('s', 'k')).toBeUndefined();
        expect(await repository.findOneBy({ scope: 's', key: 'k' })).toMatchObject({ runId: testUuid('r1'), expiresAt: new Date(10_010) });
        expect(await keys.claim('s', 'k', testUuid('r3'), 1_000)).toEqual({ created: true, runId: testUuid('r3') });
        expect(await keys.findOne('s', 'k')).toEqual({ created: false, runId: testUuid('r3') });
    });

    it('takes a scope that carries an encoded invoker (up to 1024 characters)', async () => {
        // <agent>:<source>:<kind>:<id> with a 255-character subject, every character encoded
        const scope = `${'a'.repeat(64)}:webhook:user:${encodeURIComponent('é'.repeat(150))}`;

        expect(scope.length).toBeLessThanOrEqual(1024);
        expect(scope.length).toBeGreaterThan(255);

        await expect(keys.claim(scope, 'k', testUuid('r1'), 1_000)).resolves.toEqual({ created: true, runId: testUuid('r1') });
        await expect(keys.claim(scope, 'k', testUuid('r2'), 1_000)).resolves.toEqual({ created: false, runId: testUuid('r1') });
    });

    it('two first claims of one key: exactly one creates it, the other gets its run', async () => {
        const racing = probed({ insert: createBarrier(2) });
        const results = await Promise.all([
            racing.claim('s', 'k', testUuid('ra'), 1_000),
            racing.claim('s', 'k', testUuid('rb'), 1_000),
        ]);
        const winner = results.find((result) => result.created)!;

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results.map((result) => result.runId)).toEqual([winner.runId, winner.runId]);
    });

    it('of twenty concurrent claims of one key exactly one creates it and every caller gets its run', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => keys.claim('github', 'd1', testUuid(`r${i}`), 60_000)));
        const winner = results.find((result) => result.created)!;

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results.every((result) => result.runId === winner.runId)).toBe(true);
    });

    it('two callers taking over one expired claim together: exactly one creates it, the other gets its run', async () => {
        await keys.claim('s', 'k', testUuid('old'), 1_000);
        clock.advance(1_000);

        const racing = probed({ read: createBarrier(2) });
        const results = await Promise.all([
            racing.claim('s', 'k', testUuid('ra'), 1_000),
            racing.claim('s', 'k', testUuid('rb'), 1_000),
        ]);
        const winner = results.find((result) => result.created)!;

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results.map((result) => result.runId)).toEqual([winner.runId, winner.runId]);
        expect((await repository.findOneBy({ scope: 's', key: 'k' }))!.runId).toBe(winner.runId);
    });

    it('reads the clock after the row lock: a takeover waiting for another claim compares a fresh time', async () => {
        await keys.claim('s', 'k', testUuid('r1'), 1_000);
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
        const claim = probed({
            beforeRead: async () => {
                read();
            },
        }).claim('s', 'k', testUuid('r2'), 1_000);

        await reading;
        // past 12_000 by the time the row is free: a time read before the lock (11_000) would refuse
        clock.advance(1_500);
        done();
        await holder;
        expect(await claim).toEqual({ created: true, runId: testUuid('r2') });
    });
});
