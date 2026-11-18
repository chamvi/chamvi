/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    and,
    defineQuery,
    eq,
    inArray,
} from '@rapiq/core';
import type { DataSource, EntityManager } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import {
    type IRunService,
    InvalidRunStateError,
    RunNotFoundError, 
    RunService,
    StepService,
} from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { Run } from '@chamvi/store';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { DatabaseRunRepository } from '../../../../src/repositories/run/index.ts';
import { DatabaseStepRepository } from '../../../../src/repositories/step/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';
import { makeRun } from '../../../utils/run.ts';

function child(id: string, parentRunId: string, at: number): Run {
    const run = makeRun(id, { createdAt: new Date(at) });

    run.trigger = {
        ...run.trigger,
        channel: 'agent',
        parent: {
            kind: 'dispatch',
            runId: parentRunId,
            agent: 'a',
            role: 'default',
            depth: 1,
        },
    };

    return run;
}

/** Calls `onRead` when a transaction of it reads a run by id, before the read goes out. */
class SignallingRunRepository extends DatabaseRunRepository {
    protected onRead: () => void;

    constructor(source: DataSource | EntityManager, onRead: () => void) {
        super(source);
        this.onRead = onRead;
    }

    override withManager(manager: EntityManager): this {
        return new SignallingRunRepository(manager, this.onRead) as this;
    }

    override async findOneById(id: string) {
        this.onRead();

        return super.findOneById(id);
    }
}

// the run service's rules on PostgreSQL: the concurrent cases and the queries it builds
describePostgres('run service on postgres', () => {
    let dataSource: DataSource;
    let clock: ControllableClock;
    let repository: DatabaseRunRepository;
    let service: IRunService;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        clock = new ControllableClock(new Date(10_000));
        repository = new DatabaseRunRepository(dataSource);
        service = new RunService({ repository, clock });
    });

    it('concurrent creates of one id: exactly one returns true, the stored run stays', async () => {
        const results = await Promise.all(Array.from({ length: 5 }, (_, i) => service.create(makeRun(testUuid('r1'), { address: `t${i}` }))));

        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await service.findOneOrFail(testUuid('r1'))).address).toBe(`t${results.indexOf(true)}`);
        expect(await service.create(makeRun(testUuid('r1'), { address: 'late' }))).toBe(false);
        expect((await service.findOneOrFail(testUuid('r1'))).address).toBe(`t${results.indexOf(true)}`);
    });

    it('a child of a missing or malformed parent is RunNotFoundError naming the parent', async () => {
        await expect(service.create(child(testUuid('c1'), testUuid('missing'), 1_000))).rejects.toThrow(new RunNotFoundError(testUuid('missing')));
        await expect(service.create(child(testUuid('c1'), 'not-a-uuid', 1_000))).rejects.toThrow('Run "not-a-uuid" was not found.');
        expect(await service.findOne(testUuid('c1'))).toBeUndefined();
    });

    it('two updates that each expect status queued: one wins', async () => {
        const ids = Array.from({ length: 20 }, (_, i) => testUuid(`r${i}`));

        for (const id of ids) {
            await service.create(makeRun(id));
        }

        const results = await Promise.allSettled(ids.flatMap((id) => [
            service.update(id, { status: RunStatus.RUNNING, address: 'first' }, { expectStatus: [RunStatus.QUEUED] }),
            service.update(id, { status: RunStatus.RUNNING, address: 'second' }, { expectStatus: [RunStatus.QUEUED] }),
        ]));

        for (const [index, id] of ids.entries()) {
            const pair = results.slice(index * 2, (index * 2) + 2);
            const winner = pair.findIndex((result) => result.status === 'fulfilled');
            const loser = pair[1 - winner] as PromiseRejectedResult;

            expect(pair.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(loser.reason).toBeInstanceOf(InvalidRunStateError);
            expect(loser.reason.message).toBe(`Run "${id}" is "running", expected one of: queued.`);
            expect((await service.findOneOrFail(id)).address).toBe(winner === 0 ? 'first' : 'second');
        }
    });

    it('two owners taking over one expired claim: exactly one succeeds and the previous owner\'s renew then fails', async () => {
        const ids = Array.from({ length: 10 }, (_, i) => testUuid(`r${i}`));

        for (const id of ids) {
            await service.create(makeRun(id));
            await service.claim(id, 'old', 1_000);
        }

        clock.advance(1_000);

        const results = await Promise.all(ids.flatMap((id) => [service.claim(id, 'a', 1_000), service.claim(id, 'b', 1_000)]));

        for (const [index, id] of ids.entries()) {
            const pair = results.slice(index * 2, (index * 2) + 2);

            expect(pair.filter(Boolean)).toHaveLength(1);
            expect((await service.findOneOrFail(id)).claim?.owner).toBe(pair[0] ? 'a' : 'b');
            expect(await service.renewClaim(id, 'old', 1_000)).toBe(false);
        }
    });

    it('one of twenty claims of a run wins', async () => {
        await service.create(makeRun(testUuid('r1')));

        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => service.claim(testUuid('r1'), `w${i}`, 1_000)));

        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('reads the clock after the row lock: a claim waiting for the lock compares a fresh time', async () => {
        await service.create(makeRun(testUuid('r1')));
        await service.claim(testUuid('r1'), 'w1', 1_000);

        const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
        const { promise: release, resolve: done } = Promise.withResolvers<void>();
        const holder = repository.transaction(async (bound) => {
            await bound.findOneById(testUuid('r1'));
            lock();
            await release;
        });

        await locked;

        // the claim's service signals its locked read of the row (which then waits for the holder)
        const { promise: reading, resolve: read } = Promise.withResolvers<void>();
        const claims = new RunService({ repository: new SignallingRunRepository(dataSource, read), clock });
        const claim = claims.claim(testUuid('r1'), 'w2', 1_000);

        await reading;
        clock.advance(1_000);
        done();
        await holder;
        expect(await claim).toBe(true);
    });

    it('update writes only its changes and clears a property set to undefined', async () => {
        await service.create(makeRun(testUuid('r1'), {
            concurrencyKey: 'k',
            address: 't',
            output: { a: 1 },
            error: { code: 'x', message: 'y' },
            subtreeUsage: { inputTokens: 1, outputTokens: 2 },
        }));
        await service.claim(testUuid('r1'), 'w1', 1_000);

        const updated = await service.update(testUuid('r1'), {
            output: undefined,
            error: undefined,
            status: RunStatus.RUNNING,
        });
        const stored = await service.findOneOrFail(testUuid('r1'));

        expect(stored).toEqual(updated);
        expect(stored).not.toHaveProperty('output');
        expect(stored).not.toHaveProperty('error');
        expect(stored.claim?.owner).toBe('w1');
        expect(stored.concurrencyKey).toBe('k');
        expect(stored.subtreeUsage).toEqual({ inputTokens: 1, outputTokens: 2 });
        expect(stored.updatedAt).toEqual(clock.now());
    });

    it('returns from update the value the next read returns', async () => {
        await service.create(makeRun(testUuid('r1'), { claim: { owner: 'w1', expiresAt: new Date(20_000) } }));

        const updated = await service.update(testUuid('r1'), {
            status: RunStatus.COMPLETED,
            claim: undefined,
            output: {
                at: new Date(5_000),
                skipped: undefined,
                n: 1,
            },
            waiting: {
                kind: 'approval',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: new Date(5_000),
            } as unknown as Run['waiting'],
        });

        expect(updated).toStrictEqual(await service.findOne(testUuid('r1')));
    });

    it('find builds queries PostgreSQL runs as memory does: parents, wait kinds, malformed ids, orders and pages', async () => {
        await service.create(makeRun(testUuid('p1'), { createdAt: new Date(100) }));
        await service.create(child(testUuid('c1'), testUuid('p1'), 1_000));
        await service.create(child(testUuid('c2'), testUuid('p1'), 2_000));
        await service.create(makeRun(testUuid('w1'), {
            status: RunStatus.WAITING,
            waiting: {
                kind: 'dispatch',
                id: '1:c:w0',
                toolName: 't',
                toolCallId: 'c',
                runIds: [],
                expiresAt: new Date(5_000),
            },
            createdAt: new Date(3_000),
        }));

        expect((await service.find({ parentRunId: testUuid('p1') })).data.map((run) => run.id)).toEqual([testUuid('c1'), testUuid('c2')]);
        expect((await service.find({ parentRunIds: [testUuid('p1'), 'not-a-uuid'], order: 'desc' })).data.map((run) => run.id)).toEqual([testUuid('c2'), testUuid('c1')]);
        expect((await service.find({ hasParent: false })).data.map((run) => run.id)).toEqual([testUuid('p1'), testUuid('w1')]);
        expect((await service.find({ ids: [testUuid('w1'), 'not-a-uuid'] })).data.map((run) => run.id)).toEqual([testUuid('w1')]);
        expect(await service.find({ status: [] })).toEqual({ data: [], total: 0 });
        expect((await service.find({ waitKind: 'dispatch', status: [RunStatus.WAITING] })).data.map((run) => run.id)).toEqual([testUuid('w1')]);
        expect(await service.find({ waitKind: 'approval' })).toEqual({ data: [], total: 0 });
        expect(await service.find({
            hasParent: true,
            limit: 1,
            offset: 1,
        })).toEqual({ data: [await service.findOneOrFail(testUuid('c2'))], total: 2 });
        expect(await service.find({ limit: 0 })).toEqual({ data: [], total: 4 });
    });

    it('list builds queries PostgreSQL runs as memory does: wait kinds, the id tie-break, malformed parent ids and pages', async () => {
        await service.create(makeRun(testUuid('p2'), { createdAt: new Date(100) }));
        await service.create(makeRun(testUuid('p1'), { createdAt: new Date(100) }));
        await service.create(child(testUuid('c1'), testUuid('p1'), 1_000));
        await service.create(makeRun(testUuid('w1'), {
            status: RunStatus.WAITING,
            waiting: {
                kind: 'dispatch',
                id: '1:c:w0',
                toolName: 't',
                toolCallId: 'c',
                runIds: [],
                expiresAt: new Date(5_000),
            },
            createdAt: new Date(3_000),
        }));

        const ids = async (query: Parameters<typeof defineQuery>[0]) => (await service.list(defineQuery(query))).data.map((run) => run.id);

        await expect(ids({})).resolves.toEqual([testUuid('p1'), testUuid('p2'), testUuid('c1'), testUuid('w1')]);
        await expect(ids({ sorts: { createdAt: 'DESC' } })).resolves.toEqual([testUuid('w1'), testUuid('c1'), testUuid('p2'), testUuid('p1')]);
        await expect(ids({ filters: eq('waiting', 'dispatch') })).resolves.toEqual([testUuid('w1')]);
        await expect(ids({ filters: and(eq('waiting', 'approval'), eq('status', RunStatus.WAITING)) })).resolves.toEqual([]);
        await expect(ids({ filters: eq('parentRunId', testUuid('p1')) })).resolves.toEqual([testUuid('c1')]);
        await expect(ids({ filters: eq('parentRunId', 'not-a-uuid') })).resolves.toEqual([]);
        await expect(ids({ filters: inArray('agent', []) })).resolves.toEqual([]);

        const page = await service.list(defineQuery({ pagination: { limit: 1, offset: 1 } }));

        expect(page.data.map((run) => run.id)).toEqual([testUuid('p2')]);
        expect(page.meta.total).toBe(4);
    });

    it('steps of a missing or malformed run are RunNotFoundError; steps list by index, then insertion', async () => {
        const steps = new StepService({ repository: new DatabaseStepRepository(dataSource) });
        const at = new Date(1_000);

        await service.create(makeRun(testUuid('r1')));
        await expect(steps.create({
            runId: testUuid('missing'),
            index: 0,
            kind: 'llm',
            startedAt: at,
            finishedAt: at,
        })).rejects.toThrow(new RunNotFoundError(testUuid('missing')));
        await expect(steps.create({
            runId: 'not-a-uuid',
            index: 0,
            kind: 'llm',
            startedAt: at,
            finishedAt: at,
        })).rejects.toBeInstanceOf(RunNotFoundError);

        for (const [index, name] of [[1, 'b1'], [0, 'a'], [1, 'b2']] as const) {
            await steps.create({
                runId: testUuid('r1'),
                index,
                kind: 'tool',
                name,
                startedAt: at,
                finishedAt: at,
            });
        }

        expect((await steps.find(testUuid('r1'))).map((step) => step.name)).toEqual(['a', 'b1', 'b2']);
        expect(await steps.find('not-a-uuid')).toEqual([]);
    });
});
