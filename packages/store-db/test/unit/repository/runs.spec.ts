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
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { DatabaseRunRepository, createDatabaseStore } from '@chamvi/store-db';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

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

    it('roundtrips every Run field with Date instances', async () => {
        const run = makeRun(testUuid('r1'), {
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

        const got = await store.findOne(testUuid('r1'));

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

        await expect(store.claim(testUuid('r1'), 'o1', 3_000)).resolves.toBe(true);

        const claimed = await store.findOne(testUuid('r1'));

        expect(claimed!.claim).toEqual({ owner: 'o1', expiresAt: new Date(13_000) });
        expect(claimed!.claim!.expiresAt).toBeInstanceOf(Date);

        const minimal = makeRun(testUuid('r2'));

        await store.insert(minimal);

        const gotMinimal = await store.findOne(testUuid('r2'));

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
            runIds: ['c2', 'c1', 'c2'],
            expiresAt: new Date('2026-03-08T07:15:00.456Z'),
        };

        await store.insert(makeRun(testUuid('r1'), { status: 'waiting', waiting }));

        const got = await store.findOneOrFail(testUuid('r1'));

        expect(got.waiting).toEqual(waiting);
        expect(got.waiting!.expiresAt).toBeInstanceOf(Date);

        const updated = await store.update(testUuid('r1'), { cancelRequested: true }, { expectWaitId: '0:call-1:w1' });

        expect(updated.waiting).toEqual(waiting);
        await expect(store.update(testUuid('r1'), { cancelRequested: false }, { expectWaitId: '0:call-1:w2' }))
            .rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('stores lineage and subtree usage as columns', async () => {
        await store.insert(makeRun(testUuid('p1')));
        await store.insert(makeRun(testUuid('c1'), {
            parentRunId: testUuid('forged'),
            subtreeUsage: { inputTokens: 3, outputTokens: 4 },
            trigger: {
                ...makeRun(testUuid('c1')).trigger,
                parent: {
                    kind: 'dispatch',
                    runId: testUuid('p1'),
                    agent: 'a',
                    role: 'default',
                    depth: 1,
                },
            },
        }));

        const rows: { parent_run_id: string | null; subtree_usage: unknown }[] = await dataSource.query(
            'SELECT parent_run_id, subtree_usage FROM chamvi_runs WHERE id = $1',
            [testUuid('c1')],
        );

        expect(rows).toEqual([{ parent_run_id: testUuid('p1'), subtree_usage: { inputTokens: 3, outputTokens: 4 } }]);

        // a patch never moves a run to another parent
        await store.insert(makeRun(testUuid('p2')));
        await expect(store.update(testUuid('c1'), { parentRunId: testUuid('p2') })).resolves.toMatchObject({ parentRunId: testUuid('p1') });
        await expect(store.find({ parentRunId: testUuid('p1') })).resolves.toMatchObject({ total: 1 });
        // the self reference refuses a parent row removal while a child names it
        await expect(dataSource.query('DELETE FROM chamvi_runs WHERE id = $1', [testUuid('p1')]))
            .rejects.toMatchObject({ driverError: { code: '23503' } });
    });

    it('revives taint dates in update results and preserves taint through unrelated updates', async () => {
        const taint = { at: new Date('2026-10-30T12:34:56.789Z'), source: 'tool:web_fetch' };

        await store.insert(makeRun(testUuid('r1')));
        expect((await store.findOneOrFail(testUuid('r1'))).taint).toBeUndefined();

        const tainted = await store.update(testUuid('r1'), { taint });

        expect(tainted.taint).toEqual(taint);
        expect(tainted.taint!.at).toBeInstanceOf(Date);

        const updated = await store.update(testUuid('r1'), { status: 'running' });

        expect(updated.taint).toEqual(taint);
        expect(updated.taint!.at).toBeInstanceOf(Date);

        const stored = await store.findOneOrFail(testUuid('r1'));

        expect(stored.taint).toEqual(taint);
        expect(stored.taint!.at).toBeInstanceOf(Date);
    });

    it('revives trigger.attachments[].createdAt as Date', async () => {
        const createdAt = new Date('2026-03-08T07:15:00.456Z');
        const base = makeRun(testUuid('r1'));
        const run = makeRun(testUuid('r1'), {
            trigger: {
                ...base.trigger,
                attachments: [{
                    id: 'art-1',
                    runId: testUuid('r1'),
                    agent: 'a',
                    mediaType: 'image/png',
                    filename: 'a.png',
                    size: 3,
                    createdAt,
                }],
            },
        });

        await store.insert(run);

        const got = await store.findOne(testUuid('r1'));

        expect(got).toEqual(run);
        expect(got!.trigger.attachments![0]!.createdAt).toBeInstanceOf(Date);
        expect(got!.trigger.attachments![0]!.createdAt.getTime()).toBe(createdAt.getTime());
    });

    it('runs.insert keeps the stored run on a duplicate id', async () => {
        await expect(store.insert(makeRun(testUuid('r1'), { address: 'first' }))).resolves.toBe(true);
        await expect(store.insert(makeRun(testUuid('r1'), { address: 'second' }))).resolves.toBe(false);
        expect((await store.findOne(testUuid('r1')))!.address).toBe('first');
        await expect(store.findOne(testUuid('missing'))).resolves.toBeUndefined();
    });

    it('runs.update clears columns for keys set to undefined and keeps absent ones', async () => {
        await store.insert(makeRun(testUuid('r1'), {
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
        await store.claim(testUuid('r1'), 'o1', 1_000);

        const updated = await store.update(testUuid('r1'), {
            waiting: undefined,
            error: undefined,
            claim: undefined,
            status: 'queued',
        });
        const got = await store.findOne(testUuid('r1'));

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
        await store.insert(makeRun(testUuid('r1')));

        const results = await Promise.allSettled(Array.from(
            { length: 10 },
            () => store.update(testUuid('r1'), { status: 'running' }, { expectStatus: ['queued'] }),
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
        await expect(store.update(testUuid('missing'), { address: 'x' })).rejects.toBeInstanceOf(RunNotFoundError);
        await store.insert(makeRun(testUuid('r1')));
        await store.claim(testUuid('r1'), 'o1', 1_000);
        await expect(store.update(testUuid('r1'), { address: 'x' }, { expectOwner: 'o2' })).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(store.update(testUuid('r1'), { address: 'x' }, { expectOwner: 'o1', expectStatus: ['queued'] }))
            .resolves.toMatchObject({ address: 'x' });
    });

    it('runs.update sets updatedAt from the clock unless the patch has one', async () => {
        await store.insert(makeRun(testUuid('r1')));
        clock.advance(500);

        const a = await store.update(testUuid('r1'), { address: 'x' });

        expect(a.updatedAt.getTime()).toBe(10_500);

        const b = await store.update(testUuid('r1'), { updatedAt: new Date(42) });

        expect(b.updatedAt.getTime()).toBe(42);
        expect((await store.findOne(testUuid('r1')))!.updatedAt.getTime()).toBe(42);
    });

    it('runs.find with an empty status list matches nothing', async () => {
        await store.insert(makeRun(testUuid('r1')));
        await expect(store.find({ status: [] })).resolves.toEqual({ data: [], total: 0 });
    });

    it('runs.find total ignores an offset past the end', async () => {
        await store.insert(makeRun(testUuid('r1')));
        await store.insert(makeRun(testUuid('r2')));
        await expect(store.find({ offset: 5 })).resolves.toEqual({ data: [], total: 2 });
    });

    it('runs.update ignores patch keys that are Object.prototype members', async () => {
        await store.insert(makeRun(testUuid('r1')));

        const patch = {
            constructor: 1,
            toString: 2,
            status: 'running',
        } as unknown as Partial<Run>;

        await expect(store.update(testUuid('r1'), patch)).resolves.toMatchObject({ id: testUuid('r1'), status: 'running' });
    });

    it('malformed ids are absent', async () => {
        await store.insert(makeRun(testUuid('r1')));

        const none = { data: [], total: 0 };

        await expect(store.findOne('not-a-uuid')).resolves.toBeUndefined();
        await expect(store.findOneOrFail('not-a-uuid')).rejects.toBeInstanceOf(RunNotFoundError);
        await expect(store.find({ ids: ['not-a-uuid'] })).resolves.toEqual(none);
        await expect(store.find({ ids: ['not-a-uuid', testUuid('r1')] })).resolves.toMatchObject({ total: 1 });
        await expect(store.find({ parentRunId: 'not-a-uuid' })).resolves.toEqual(none);
        await expect(store.find({ parentRunIds: ['not-a-uuid'] })).resolves.toEqual(none);
        await expect(store.claim('not-a-uuid', 'o1', 1_000)).resolves.toBe(false);
        await expect(store.renewClaim('not-a-uuid', 'o1', 1_000)).resolves.toBe(false);
        await expect(store.update('not-a-uuid', { address: 'x' })).rejects.toBeInstanceOf(RunNotFoundError);

        const { steps, checkpoints } = createDatabaseStore({ dataSource, clock });

        await expect(steps.find('not-a-uuid')).resolves.toEqual([]);
        await expect(checkpoints.findOne('not-a-uuid')).resolves.toBeUndefined();
    });

    it('steps.insert and checkpoints.save with a malformed run id throw RunNotFoundError', async () => {
        const { steps, checkpoints } = createDatabaseStore({ dataSource, clock });
        const at = new Date(1_000);

        await expect(steps.insert({
            runId: 'not-a-uuid',
            index: 0,
            kind: 'llm',
            startedAt: at,
            finishedAt: at,
        })).rejects.toBeInstanceOf(RunNotFoundError);
        await expect(checkpoints.save({
            runId: 'not-a-uuid',
            stepIndex: 0,
            messages: [],
            createdAt: at,
        })).rejects.toBeInstanceOf(RunNotFoundError);
        await expect(store.insert(makeRun(testUuid('c1'), {
            trigger: {
                ...makeRun(testUuid('c1')).trigger,
                parent: {
                    kind: 'dispatch',
                    runId: 'not-a-uuid',
                    agent: 'a',
                    role: 'default',
                    depth: 1,
                },
            },
        }))).rejects.toBeInstanceOf(RunNotFoundError);
    });
});
