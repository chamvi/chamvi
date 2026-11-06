/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { InvalidRunStateError, RunNotFoundError } from '@chamvi/core';
import type { Run } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { DatabaseCheckpointRepository, DatabaseRunRepository, DatabaseStepRepository } from '@chamvi/store-db';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

const CHILD_1 = '019a3f2a-1000-7000-8000-000000000001';
const CHILD_2 = '019a3f2a-1000-7000-8000-000000000002';
const MISSING_RUN = '019a3f2a-1000-7000-8000-000000000003';
const PARENT_1 = '019a3f2a-1000-7000-8000-000000000004';
const PARENT_2 = '019a3f2a-1000-7000-8000-000000000005';
const RUN_1 = '019a3f2a-1000-7000-8000-000000000006';
const RUN_2 = '019a3f2a-1000-7000-8000-000000000007';

function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const createdAt = new Date(1_000);

    return {
        id,
        agent: 'a',
        status: 'queued',
        trigger: {
            id: `t-${id}`,
            agent: 'a',
            trigger: 'http',
            channel: 'http',
            payload: { n: 1 },
            receivedAt: new Date(1_234_567),
        },
        usage: { inputTokens: 1, outputTokens: 2 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

describePostgres('DatabaseRunRepository runs', () => {
    let dataSource: DataSource;
    let clock: ControllableClock;
    let store: DatabaseRunRepository;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        clock = new ControllableClock(new Date(10_000));
        store = new DatabaseRunRepository({ dataSource, clock });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('treats malformed run identifiers as absent, including mixed list filters', async () => {
        await store.insert(makeRun(PARENT_1));

        const child = makeRun(CHILD_1);

        child.trigger.parent = {
            kind: 'dispatch',
            runId: PARENT_1,
            agent: 'a',
            role: 'default',
            depth: 1,
        };
        await store.insert(child);

        const steps = new DatabaseStepRepository({ dataSource });
        const checkpoints = new DatabaseCheckpointRepository({ dataSource });

        for (const id of ['', 'missing', 'not-a-uuid']) {
            expect(await steps.find(id)).toEqual([]);
            expect(await checkpoints.findOne(id)).toBeUndefined();
            expect(await store.findOne(id)).toBeUndefined();
            await expect(store.findOneOrFail(id)).rejects.toBeInstanceOf(RunNotFoundError);
            await expect(store.update(id, { status: 'running' })).rejects.toBeInstanceOf(RunNotFoundError);
            expect(await store.claim(id, 'owner', 1_000)).toBe(false);
            expect(await store.renewClaim(id, 'owner', 1_000)).toBe(false);
            expect(await store.find({ ids: [id] })).toEqual({ data: [], total: 0 });
            expect(await store.find({ parentRunId: id })).toEqual({ data: [], total: 0 });
            expect((await store.find({ ids: [id, CHILD_1] })).data.map((run) => run.id)).toEqual([CHILD_1]);
            expect((await store.find({ parentRunIds: [id, PARENT_1] })).data.map((run) => run.id)).toEqual([CHILD_1]);
            expect(await store.find({ parentRunId: id, parentRunIds: [PARENT_1] })).toEqual({ data: [], total: 0 });
        }
    });

    it('roundtrips every Run field with Date instances', async () => {
        const run = makeRun(RUN_1, {
            concurrencyKey: 'ck',
            address: 'th',
            taint: { at: new Date('2026-10-30T12:34:56.789Z'), source: 'tool:web_fetch' },
            output: { ok: true },
            error: { code: 'X', message: 'm' },
            waiting: {
                kind: 'approval',
                id: 'ap1',
                approvalId: 'ap1',
                toolName: 'tool',
                toolCallId: 'call-1',
                title: 'Approve tool',
                body: 'details',
                options: [{
                    id: 'a',
                    label: 'A',
                    detail: '--- a\n+++ b',
                }],
                multiple: true,
                channel: 'github',
                address: 'o/r#1',
                slot: ' maintainer-状态-🚀 ',
                expiresAt: new Date('2026-03-08T07:15:00.456Z'),
                notifiedAt: new Date(2_000_001),
            },
            cancelRequested: true,
            startedAt: new Date('2026-03-08T07:30:00.123Z'),
            finishedAt: new Date('2026-11-01T05:30:00.123Z'),
        });

        await expect(store.insert(run)).resolves.toBe(true);

        const got = await store.findOne(RUN_1);

        expect(got).toEqual(run);
        expect(got!.trigger.receivedAt).toBeInstanceOf(Date);
        expect(got!.taint!.at).toBeInstanceOf(Date);
        expect(got!.waiting!.expiresAt).toBeInstanceOf(Date);
        expect(got!.waiting!.kind === 'approval' && got!.waiting!.notifiedAt).toBeInstanceOf(Date);
        expect(got!.createdAt).toBeInstanceOf(Date);
        expect(got!.trigger.receivedAt.getTime()).toBe(run.trigger.receivedAt.getTime());
        expect(got!.waiting!.expiresAt.getTime()).toBe(run.waiting!.expiresAt.getTime());
        expect(got!.waiting).toMatchObject({ notifiedAt: new Date(2_000_001) });
        expect(got!.createdAt.getTime()).toBe(run.createdAt.getTime());
        expect(got!.updatedAt.getTime()).toBe(run.updatedAt.getTime());
        expect(got!.startedAt!.getTime()).toBe(run.startedAt!.getTime());
        expect(got!.finishedAt!.getTime()).toBe(run.finishedAt!.getTime());

        await expect(store.claim(RUN_1, 'o1', 3_000)).resolves.toBe(true);

        const claimed = await store.findOne(RUN_1);

        expect(claimed!.claim).toEqual({ owner: 'o1', expiresAt: new Date(13_000) });
        expect(claimed!.claim!.expiresAt).toBeInstanceOf(Date);

        const minimal = makeRun(RUN_2);

        await store.insert(minimal);

        const gotMinimal = await store.findOne(RUN_2);

        expect(gotMinimal).toEqual(minimal);

        const keys = Object.keys(gotMinimal!);

        for (const key of ['output', 'error', 'waiting', 'taint', 'claim', 'cancelRequested', 'concurrencyKey', 'address', 'startedAt', 'finishedAt']) {
            expect(keys).not.toContain(key);
        }
    });

    it('revives a dispatch wait point', async () => {
        const waiting = {
            kind: 'dispatch' as const,
            id: '0:call-1:w1',
            toolName: 'wait_for_dispatch',
            toolCallId: 'call-1',
            runIds: [CHILD_2, CHILD_1, CHILD_2],
            expiresAt: new Date('2026-03-08T07:15:00.456Z'),
        };

        await store.insert(makeRun(RUN_1, { status: 'waiting', waiting }));

        const got = await store.findOneOrFail(RUN_1);

        expect(got.waiting).toEqual(waiting);
        expect(got.waiting!.expiresAt).toBeInstanceOf(Date);

        const updated = await store.update(RUN_1, { cancelRequested: true }, { expectWaitId: '0:call-1:w1' });

        expect(updated.waiting).toEqual(waiting);
        await expect(store.update(RUN_1, { cancelRequested: false }, { expectWaitId: '0:call-1:w2' }))
            .rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('stores lineage and subtree usage as columns', async () => {
        await store.insert(makeRun(PARENT_1));
        await store.insert(makeRun(CHILD_1, {
            parentRunId: 'forged',
            subtreeUsage: { inputTokens: 3, outputTokens: 4 },
            trigger: {
                ...makeRun(CHILD_1).trigger,
                parent: {
                    kind: 'dispatch',
                    runId: PARENT_1,
                    agent: 'a',
                    role: 'default',
                    depth: 1,
                },
            },
        }));

        const rows: { parent_run_id: string | null; subtree_usage: unknown }[] = await dataSource.query(
            'SELECT parent_run_id, subtree_usage FROM chamvi_runs WHERE id = $1',
            [CHILD_1],
        );

        expect(rows).toEqual([{ parent_run_id: PARENT_1, subtree_usage: { inputTokens: 3, outputTokens: 4 } }]);

        // a patch never moves a run to another parent
        await store.insert(makeRun(PARENT_2));
        await expect(store.update(CHILD_1, { parentRunId: PARENT_2 })).resolves.toMatchObject({ parentRunId: PARENT_1 });
        await expect(store.find({ parentRunId: PARENT_1 })).resolves.toMatchObject({ total: 1 });
        // the self reference refuses a parent row removal while a child names it
        await expect(dataSource.query('DELETE FROM chamvi_runs WHERE id = $1', [PARENT_1]))
            .rejects.toMatchObject({ driverError: { code: '23503' } });
    });

    it('revives taint dates in update results and preserves taint through unrelated updates', async () => {
        const taint = { at: new Date('2026-10-30T12:34:56.789Z'), source: 'tool:web_fetch' };

        await store.insert(makeRun(RUN_1));
        expect((await store.findOneOrFail(RUN_1)).taint).toBeUndefined();

        const tainted = await store.update(RUN_1, { taint });

        expect(tainted.taint).toEqual(taint);
        expect(tainted.taint!.at).toBeInstanceOf(Date);

        const updated = await store.update(RUN_1, { status: 'running' });

        expect(updated.taint).toEqual(taint);
        expect(updated.taint!.at).toBeInstanceOf(Date);

        const stored = await store.findOneOrFail(RUN_1);

        expect(stored.taint).toEqual(taint);
        expect(stored.taint!.at).toBeInstanceOf(Date);
    });

    it('revives trigger.attachments[].createdAt as Date', async () => {
        const createdAt = new Date('2026-03-08T07:15:00.456Z');
        const base = makeRun(RUN_1);
        const run = makeRun(RUN_1, {
            trigger: {
                ...base.trigger,
                attachments: [{
                    id: 'art-1',
                    runId: RUN_1,
                    agent: 'a',
                    mediaType: 'image/png',
                    filename: 'a.png',
                    size: 3,
                    createdAt,
                }],
            },
        });

        await store.insert(run);

        const got = await store.findOne(RUN_1);

        expect(got).toEqual(run);
        expect(got!.trigger.attachments![0]!.createdAt).toBeInstanceOf(Date);
        expect(got!.trigger.attachments![0]!.createdAt.getTime()).toBe(createdAt.getTime());
    });

    it('runs.insert keeps the stored run on a duplicate id', async () => {
        await expect(store.insert(makeRun(RUN_1, { address: 'first' }))).resolves.toBe(true);
        await expect(store.insert(makeRun(RUN_1, { address: 'second' }))).resolves.toBe(false);
        expect((await store.findOne(RUN_1))!.address).toBe('first');
        await expect(store.findOne(MISSING_RUN)).resolves.toBeUndefined();
    });

    it('runs.update clears columns for keys set to undefined and keeps absent ones', async () => {
        await store.insert(makeRun(RUN_1, {
            status: 'waiting',
            address: 'th',
            error: { code: 'X', message: 'm' },
            waiting: {
                kind: 'approval',
                id: 'ap1',
                approvalId: 'ap1',
                toolName: 'tool',
                toolCallId: 'call-1',
                title: 'Approve tool',
                expiresAt: new Date(50_000),
            },
        }));
        await store.claim(RUN_1, 'o1', 1_000);

        const updated = await store.update(RUN_1, {
            waiting: undefined,
            error: undefined,
            claim: undefined,
            status: 'queued',
        });
        const got = await store.findOne(RUN_1);

        for (const run of [updated, got!]) {
            expect(Object.keys(run)).not.toContain('waiting');
            expect(Object.keys(run)).not.toContain('error');
            expect(Object.keys(run)).not.toContain('claim');
            expect(run.status).toBe('queued');
            expect(run.address).toBe('th');
            expect(run.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
        }
    });

    it('runs.update guard has one winner under concurrency', async () => {
        await store.insert(makeRun(RUN_1));

        const results = await Promise.allSettled(Array.from(
            { length: 10 },
            () => store.update(RUN_1, { status: 'running' }, { expectStatus: ['queued'] }),
        ));
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(9);

        for (const r of rejected) {
            expect((r as PromiseRejectedResult).reason).toBeInstanceOf(InvalidRunStateError);
        }
    });

    it('runs.update reports a missing run and a foreign owner', async () => {
        await expect(store.update(MISSING_RUN, { address: 'x' })).rejects.toBeInstanceOf(RunNotFoundError);
        await store.insert(makeRun(RUN_1));
        await store.claim(RUN_1, 'o1', 1_000);
        await expect(store.update(RUN_1, { address: 'x' }, { expectOwner: 'o2' })).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(store.update(RUN_1, { address: 'x' }, { expectOwner: 'o1', expectStatus: ['queued'] }))
            .resolves.toMatchObject({ address: 'x' });
    });

    it('runs.update sets updatedAt from the clock unless the patch has one', async () => {
        await store.insert(makeRun(RUN_1));
        clock.advance(500);

        const a = await store.update(RUN_1, { address: 'x' });

        expect(a.updatedAt.getTime()).toBe(10_500);

        const b = await store.update(RUN_1, { updatedAt: new Date(42) });

        expect(b.updatedAt.getTime()).toBe(42);
        expect((await store.findOne(RUN_1))!.updatedAt.getTime()).toBe(42);
    });

    it('runs.find with an empty status list matches nothing', async () => {
        await store.insert(makeRun(RUN_1));
        await expect(store.find({ status: [] })).resolves.toEqual({ data: [], total: 0 });
    });

    it('runs.find total ignores an offset past the end', async () => {
        await store.insert(makeRun(RUN_1));
        await store.insert(makeRun(RUN_2));
        await expect(store.find({ offset: 5 })).resolves.toEqual({ data: [], total: 2 });
    });

    it('runs.update ignores patch keys that are Object.prototype members', async () => {
        await store.insert(makeRun(RUN_1));

        const patch = {
            constructor: 1,
            toString: 2,
            status: 'running',
        } as unknown as Partial<Run>;

        await expect(store.update(RUN_1, patch)).resolves.toMatchObject({ id: RUN_1, status: 'running' });
    });
});
