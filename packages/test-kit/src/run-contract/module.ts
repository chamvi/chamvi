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
    ne,
} from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    EntityConflictError,
    EntityRelationError,
    RunStatus,
} from '@chamvi/store';
import type { ApprovalWaitPoint, IRunRepository, Run } from '@chamvi/store';
import { makeChild, makeRun, testUuid } from '../fixture/helpers.ts';
import {
    APPROVAL,
    DISPATCH,
    PEER,
    REMOTE,
} from './constants.ts';
import { registerRunDateCases } from './dates.ts';
import { idsOf, insert } from './helpers.ts';
import type { RunRepositoryContractInput } from './types.ts';

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** A run with every optional field set (no conversation: its scope references another aggregate). */
function fullRun(id: string): Run {
    const run = makeRun(id, {
        status: RunStatus.WAITING,
        concurrencyKey: 'k1',
        address: 'owner/repo#7',
        output: { answer: [1, 'two', null] },
        error: { code: 'failed', message: 'it failed' },
        usage: { inputTokens: 3, outputTokens: 4 },
        subtreeUsage: { inputTokens: 10, outputTokens: 5 },
        waiting: APPROVAL,
        claim: { owner: 'w1', expiresAt: new Date(7_000) },
        taint: { at: new Date('2026-10-30T12:34:56.789Z'), source: 'tool:web_fetch' },
        cancelRequested: true,
        agentRevision: 'a'.repeat(64),
        startedAt: new Date(1_500),
        finishedAt: new Date(2_500),
    });

    run.trigger = {
        ...run.trigger,
        channel: 'github',
        address: 'owner/repo#7',
        attachments: [{
            id: testUuid('att'),
            runId: id,
            agent: 'a',
            mediaType: 'text/plain',
            filename: 'a.txt',
            size: 3,
            createdAt: new Date(1_000),
        }],
    };

    return run;
}

/**
 * The storage behaviour of an `IRunRepository`: rows stored and read as
 * given (no rule, no normalization), the parent reference, the rapiq
 * queries the run service builds, `findByWaitKind`, and row locks that
 * serialize writers without blocking the rows that reference a run.
 */
export function describeRunRepositoryContract(input: RunRepositoryContractInput): void {
    describe(`run repository contract: ${input.name}`, () => {
        let runs: IRunRepository;

        beforeEach(async () => {
            runs = await input.create();
        });

        registerRunDateCases(() => runs);

        it('stores every field and reads it back with Date instances', async () => {
            const run = fullRun(testUuid('r1'));

            await insert(runs, run);

            const stored = (await runs.findOneById(testUuid('r1')))!;

            expect(stored).toEqual(run);
            expect(stored.trigger.receivedAt).toBeInstanceOf(Date);
            expect(stored.trigger.attachments?.[0]?.createdAt).toBeInstanceOf(Date);
            expect(stored.waiting?.expiresAt).toBeInstanceOf(Date);
            expect(stored.waiting?.kind === 'approval' ? stored.waiting.notifiedAt : undefined).toBeInstanceOf(Date);
            expect(stored.taint?.at).toBeInstanceOf(Date);
            expect(stored.claim?.expiresAt).toBeInstanceOf(Date);
            expect(stored.createdAt).toBeInstanceOf(Date);
            expect(stored.startedAt).toBeInstanceOf(Date);

            await insert(runs, makeRun(testUuid('r2'), { waiting: DISPATCH }));
            expect((await runs.findOneById(testUuid('r2')))!.waiting).toEqual(DISPATCH);
        });

        it('reads an absent optional field as absent', async () => {
            await insert(runs, makeRun(testUuid('r1')));

            const stored = (await runs.findOneById(testUuid('r1')))!;

            for (const field of ['concurrencyKey', 'address', 'output', 'error', 'subtreeUsage', 'parentRunId', 'waiting', 'taint', 'claim', 'cancelRequested', 'agentRevision', 'conversation', 'startedAt', 'finishedAt']) {
                expect(stored).not.toHaveProperty(field);
            }
        });

        it('stores the trigger and the wait point as given, a legacy shape too', async () => {
            const run = makeRun(testUuid('r1'));
            const trigger = {
                id: run.trigger.id,
                agent: 'a',
                trigger: 'http',
                payload: {},
                receivedAt: run.trigger.receivedAt,
                source: 'github',
                thread: 'owner/repo#7',
            };
            const waiting = {
                kind: 'approval',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: new Date(5_000),
            };

            await insert(runs, {
                ...run,
                trigger: trigger as unknown as Run['trigger'],
                waiting: waiting as unknown as Run['waiting'],
            });

            const stored = (await runs.findOneById(testUuid('r1')))!;

            expect(stored.trigger).toEqual(trigger);
            expect(stored.waiting).toEqual(waiting);
        });

        it('stores parentRunId as given and refuses a missing or malformed parent with EntityRelationError', async () => {
            await insert(runs, makeRun(testUuid('p1')));
            await insert(runs, { ...makeChild(testUuid('c1'), testUuid('p1')), parentRunId: testUuid('p1') });
            // the row holds what it is given: lineage from the envelope is the service's rule
            await insert(runs, makeChild(testUuid('c2'), testUuid('p1')));

            expect((await runs.findOneById(testUuid('c1')))!.parentRunId).toBe(testUuid('p1'));
            expect(await runs.findOneById(testUuid('c2'))).not.toHaveProperty('parentRunId');

            for (const parentRunId of [testUuid('missing'), 'not-a-uuid']) {
                const error = await insert(runs, makeRun(testUuid('c3'), { parentRunId })).catch((caught: unknown) => caught);

                expect(error).toBeInstanceOf(EntityRelationError);
                expect(error).toMatchObject({ entity: 'run', relation: 'run' });
                expect(await runs.findOneById(testUuid('c3'))).toBeNull();
            }
        });

        it('stores trigger.parent with its source', async () => {
            const run = makeChild(testUuid('c1'), testUuid('p1'));
            const parent = { ...run.trigger.parent!, source: { channel: 'github', address: 'o/r#12' } };

            await insert(runs, makeRun(testUuid('p1')));
            await insert(runs, { ...run, trigger: { ...run.trigger, parent } });

            expect((await runs.findOneById(testUuid('c1')))!.trigger.parent).toEqual(parent);
            expect((await runs.findMany(defineQuery({ filters: eq('id', testUuid('c1')) }))).data[0]!.trigger.parent).toEqual(parent);
        });

        it('stores a remote wait point and reads it back with Date instances; findByWaitKind lists it', async () => {
            await insert(runs, makeRun(testUuid('r1'), { status: RunStatus.WAITING, waiting: REMOTE }));
            await insert(runs, makeRun(testUuid('r2'), { status: RunStatus.WAITING, waiting: DISPATCH }));

            const stored = (await runs.findOneById(testUuid('r1')))!;

            expect(stored.waiting).toEqual(REMOTE);
            expect(stored.waiting?.expiresAt).toBeInstanceOf(Date);
            expect(stored.waiting?.kind === 'remote' ? stored.waiting.remote?.approval?.notifiedAt : undefined).toBeInstanceOf(Date);

            const remote = await runs.findByWaitKind('remote', defineQuery({}));

            expect(idsOf(remote.data)).toEqual([testUuid('r1')]);
            expect(remote.meta.total).toBe(1);
            expect(remote.data[0]!.waiting).toEqual(REMOTE);
        });

        it('stores a peer parent as given, a foreign run id without parentRunId', async () => {
            const run = makeRun(testUuid('r1'));

            run.trigger = {
                ...run.trigger,
                channel: 'agent',
                parent: PEER,
            };

            await insert(runs, run);

            const stored = (await runs.findOneById(testUuid('r1')))!;

            expect(stored.trigger.parent).toEqual(PEER);
            expect(stored).not.toHaveProperty('parentRunId');
        });

        it('reads an unknown or malformed id as null', async () => {
            await insert(runs, makeRun(testUuid('r1')));

            expect(await runs.findOneById(testUuid('missing'))).toBeNull();
            expect(await runs.findOneById('not-a-uuid')).toBeNull();
        });

        it('save of a created run whose id is stored is EntityConflictError and leaves the stored row', async () => {
            await insert(runs, makeRun(testUuid('r1'), { address: 'first' }));

            await expect(insert(runs, makeRun(testUuid('r1'), { address: 'second' }))).rejects.toBeInstanceOf(EntityConflictError);
            expect((await runs.findOneById(testUuid('r1')))!.address).toBe('first');
        });

        it('concurrent saves of one created id: exactly one is stored', async () => {
            const results = await Promise.allSettled(
                Array.from({ length: 5 }, (_, i) => insert(runs, makeRun(testUuid('r1'), { address: `t${i}` }))),
            );
            const stored = results.findIndex((result) => result.status === 'fulfilled');

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')
                .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);
            expect((await runs.findOneById(testUuid('r1')))!.address).toBe(`t${stored}`);
        });

        it('save of a read run writes its changes: a property set to undefined is cleared, the others are kept', async () => {
            await insert(runs, fullRun(testUuid('r1')));

            const run = (await runs.findOneById(testUuid('r1')))!;

            runs.merge(run, {
                status: RunStatus.RUNNING,
                claim: undefined,
                waiting: undefined,
                updatedAt: new Date(3_000),
            });
            await runs.save(run);

            const stored = (await runs.findOneById(testUuid('r1')))!;

            expect(stored.status).toBe(RunStatus.RUNNING);
            expect(stored).not.toHaveProperty('claim');
            expect(stored).not.toHaveProperty('waiting');
            expect(stored.updatedAt).toEqual(new Date(3_000));
            expect(stored.taint).toEqual(fullRun(testUuid('r1')).taint);
            expect(stored.subtreeUsage).toEqual({ inputTokens: 10, outputTokens: 5 });
            expect(stored.agentRevision).toBe('a'.repeat(64));
        });

        it('copies values in and out', async () => {
            const run = makeRun(testUuid('r1'), { claim: { owner: 'w', expiresAt: new Date(2_000) } });

            await insert(runs, run);
            run.usage.inputTokens = 99;
            run.trigger.payload = { changed: true };

            const read = (await runs.findOneById(testUuid('r1')))!;

            expect(read.usage.inputTokens).toBe(0);
            expect(read.trigger.payload).toEqual({});
            read.claim!.owner = 'evil';
            expect((await runs.findOneById(testUuid('r1')))!.claim!.owner).toBe('w');
        });

        it('findMany runs the run service queries: filters, both orders, pages and totals', async () => {
            await insert(runs, makeRun(testUuid('r3'), {
                status: RunStatus.RUNNING,
                concurrencyKey: 'k1',
                createdAt: new Date(3_000),
            }));
            await insert(runs, makeRun(testUuid('r1'), { concurrencyKey: 'K1', createdAt: new Date(1_000) }));
            await insert(runs, makeRun(testUuid('r2'), { agent: 'b', createdAt: new Date(2_000) }));
            await insert(runs, makeRun(testUuid('r4'), { status: RunStatus.COMPLETED, createdAt: new Date(3_000) }));

            const asc = { createdAt: 'ASC', id: 'ASC' } as const;
            const desc = { createdAt: 'DESC', id: 'DESC' } as const;

            expect(idsOf((await runs.findMany(defineQuery({ sorts: asc }))).data))
                .toEqual([testUuid('r1'), testUuid('r2'), testUuid('r3'), testUuid('r4')]);
            expect(idsOf((await runs.findMany(defineQuery({ sorts: desc }))).data))
                .toEqual([testUuid('r4'), testUuid('r3'), testUuid('r2'), testUuid('r1')]);
            expect(idsOf((await runs.findMany(defineQuery({ filters: and(eq('agent', 'a'), inArray('status', ['queued', 'running'])), sorts: asc }))).data))
                .toEqual([testUuid('r1'), testUuid('r3')]);
            // case sensitive
            expect(idsOf((await runs.findMany(defineQuery({ filters: eq('concurrencyKey', 'k1'), sorts: asc }))).data))
                .toEqual([testUuid('r3')]);
            expect(idsOf((await runs.findMany(defineQuery({ filters: inArray('id', [testUuid('r4'), 'not-a-uuid', testUuid('r2')]), sorts: asc }))).data))
                .toEqual([testUuid('r2'), testUuid('r4')]);
            expect((await runs.findMany(defineQuery({ filters: inArray('id', []) }))).meta.total).toBe(0);

            const page = await runs.findMany(defineQuery({
                filters: eq('agent', 'a'),
                sorts: asc,
                pagination: { limit: 1, offset: 1 },
            }));

            expect(idsOf(page.data)).toEqual([testUuid('r3')]);
            expect(page.meta.total).toBe(3);

            const none = await runs.findMany(defineQuery({ sorts: asc, pagination: { limit: 0 } }));

            expect(none.data).toEqual([]);
            expect(none.meta.total).toBe(4);
            expect((await runs.findMany(defineQuery({ sorts: asc, pagination: { offset: 10 } }))).meta.total).toBe(4);
        });

        it('findMany filters by the parent: one, several, any and none', async () => {
            await insert(runs, makeRun(testUuid('p1'), { createdAt: new Date(100) }));
            await insert(runs, makeRun(testUuid('p2'), { createdAt: new Date(200) }));
            await insert(runs, { ...makeChild(testUuid('c1'), testUuid('p1'), 1_000), parentRunId: testUuid('p1') });
            await insert(runs, { ...makeChild(testUuid('c2'), testUuid('p2'), 2_000), parentRunId: testUuid('p2') });

            const sorts = { createdAt: 'ASC', id: 'ASC' } as const;

            expect(idsOf((await runs.findMany(defineQuery({ filters: eq('parentRunId', testUuid('p1')), sorts }))).data))
                .toEqual([testUuid('c1')]);
            expect(idsOf((await runs.findMany(defineQuery({ filters: inArray('parentRunId', [testUuid('p1'), testUuid('p2'), 'not-a-uuid']), sorts }))).data))
                .toEqual([testUuid('c1'), testUuid('c2')]);
            expect(idsOf((await runs.findMany(defineQuery({ filters: ne('parentRunId', null), sorts }))).data))
                .toEqual([testUuid('c1'), testUuid('c2')]);
            expect(idsOf((await runs.findMany(defineQuery({ filters: eq('parentRunId', null), sorts }))).data))
                .toEqual([testUuid('p1'), testUuid('p2')]);
        });

        it('findMany reads a nested public field (the claim owner)', async () => {
            await insert(runs, makeRun(testUuid('r1'), { claim: { owner: 'w1', expiresAt: new Date(2_000) } }));
            await insert(runs, makeRun(testUuid('r2'), { claim: { owner: 'w2', expiresAt: new Date(2_000) } }));
            await insert(runs, makeRun(testUuid('r3')));

            expect(idsOf((await runs.findMany(defineQuery({ filters: eq('claim.owner', 'w2') }))).data)).toEqual([testUuid('r2')]);
        });

        it('findByWaitKind restricts the query to one wait point kind, with its filters, order, pages and total', async () => {
            const approval = (id: string): ApprovalWaitPoint => ({
                ...APPROVAL,
                id,
                approvalId: id,
            });

            await insert(runs, makeRun(testUuid('r1'), {
                status: RunStatus.WAITING,
                waiting: approval('0:c1:0'),
                createdAt: new Date(1_000),
            }));
            await insert(runs, makeRun(testUuid('r2'), {
                status: RunStatus.WAITING,
                waiting: DISPATCH,
                createdAt: new Date(2_000),
            }));
            await insert(runs, makeRun(testUuid('r3'), {
                status: RunStatus.WAITING,
                waiting: approval('0:c1:1'),
                createdAt: new Date(3_000),
            }));
            await insert(runs, makeRun(testUuid('r4'), {
                agent: 'b',
                waiting: approval('0:c1:2'),
                createdAt: new Date(4_000),
            }));
            await insert(runs, makeRun(testUuid('r5'), { createdAt: new Date(5_000) }));

            const sorts = { createdAt: 'ASC', id: 'ASC' } as const;
            const approvals = await runs.findByWaitKind('approval', defineQuery({ sorts }));

            expect(idsOf(approvals.data)).toEqual([testUuid('r1'), testUuid('r3'), testUuid('r4')]);
            expect(approvals.meta.total).toBe(3);
            expect(approvals.data[0]!.waiting).toEqual(approval('0:c1:0'));
            expect(idsOf((await runs.findByWaitKind('dispatch', defineQuery({ sorts }))).data)).toEqual([testUuid('r2')]);

            const page = await runs.findByWaitKind('approval', defineQuery({
                filters: and(eq('agent', 'a'), inArray('status', ['waiting'])),
                sorts: { createdAt: 'DESC', id: 'DESC' },
                pagination: { limit: 1, offset: 1 },
            }));

            expect(idsOf(page.data)).toEqual([testUuid('r1')]);
            expect(page.meta.total).toBe(2);
            expect((await runs.findByWaitKind('approval', defineQuery({ pagination: { limit: 0 } }))).meta.total).toBe(3);
        });

        it('transactions that read and save one run apply one after the other: no change is lost', async () => {
            await insert(runs, makeRun(testUuid('r1')));

            const increment = () => runs.transaction(async (repository) => {
                const run = (await repository.findOneById(testUuid('r1')))!;

                await pause(5);
                repository.merge(run, { usage: { inputTokens: run.usage.inputTokens + 1, outputTokens: 0 } });
                await repository.save(run);
            });

            await Promise.all(Array.from({ length: 20 }, () => increment()));
            expect((await runs.findOneById(testUuid('r1')))!.usage.inputTokens).toBe(20);
        });

        it('a run locked by a transaction does not block inserting a child run', async () => {
            await insert(runs, makeRun(testUuid('p1')));

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            let inserted = false;
            const holder = runs.transaction(async (repository) => {
                await repository.findOneById(testUuid('p1'));
                lock();

                // the child insert must land while the parent row is held
                for (let i = 0; i < 100 && !inserted; i++) {
                    await pause(10);
                }

                return inserted;
            });

            await locked;
            await insert(runs, { ...makeChild(testUuid('c1'), testUuid('p1')), parentRunId: testUuid('p1') });
            inserted = true;
            expect(await holder).toBe(true);
        });
    });
}
