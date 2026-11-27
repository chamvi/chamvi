/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import {
    and,
    defineQuery,
    eq,
    inArray,
    or,
} from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { RunStatus } from '@chamvi/core-kit';
import type {
    ApprovalWaitPoint,
    DispatchWaitPoint,
    Run,
    WaitPoint,
} from '@chamvi/core-kit';
import { MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import type { IRunService, RunUpdateOptions } from '../../../src/index.ts';
import {
    InvalidRunStateError,
    RepositoryNotFoundError,
    RunNotFoundError,
    RunService,
} from '../../../src/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

function uuid(label: string): string {
    const hex = Buffer.concat([Buffer.from(label), Buffer.alloc(16 - label.length)]).toString('hex');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeRun(id: string, overrides: Partial<Run> = {}): Run {
    const createdAt = new Date(1_000);

    return {
        id,
        agent: 'a',
        status: RunStatus.QUEUED,
        trigger: {
            id: `t-${id}`,
            agent: 'a',
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: createdAt,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

function makeChild(id: string, parentRunId: string, at = 1_000): Run {
    const run = makeRun(id, { createdAt: new Date(at), updatedAt: new Date(at) });

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

function idsOf(runs: Run[]): string[] {
    return runs.map((run) => run.id);
}

const DISPATCH: DispatchWaitPoint = {
    kind: 'dispatch',
    id: '1:c2:w0',
    toolName: 'review',
    toolCallId: 'c2',
    runIds: [uuid('c1')],
    expiresAt: new Date(9_000),
};

const LEGACY_APPROVAL = {
    kind: 'approval',
    approvalId: '0:c1:0',
    toolName: 'deploy',
    toolCallId: 'c1',
    title: 'Deploy?',
    expiresAt: new Date(5_000),
} as unknown as WaitPoint;

describe('RunService', () => {
    let clock: ControllableClock;
    let repository: MemoryRunRepository;
    let service: IRunService;

    beforeEach(() => {
        clock = new ControllableClock(new Date(10_000));
        repository = new MemoryRunRepository({ registry: new MemoryRegistry() });
        service = new RunService({ repository, clock });
    });

    describe('create and read', () => {
        it('creates a run and reads it back; findOneOrFail of a missing id is RunNotFoundError', async () => {
            const run = makeRun(uuid('r1'));

            expect(await service.create(run)).toBe(true);
            expect(await service.findOne(uuid('r1'))).toEqual(run);
            expect(await service.findOneOrFail(uuid('r1'))).toEqual(run);
            expect(await service.findOne(uuid('missing'))).toBeUndefined();
            await expect(service.findOneOrFail('missing')).rejects.toThrow(new RunNotFoundError('missing'));
            await expect(service.findOneOrFail('missing')).rejects.toThrow('Run "missing" was not found.');
        });

        it('create with a stored id returns false and the stored run is unchanged', async () => {
            await service.create(makeRun(uuid('r1'), { address: 'first' }));
            await service.update(uuid('r1'), { status: RunStatus.RUNNING });

            const before = await service.findOneOrFail(uuid('r1'));

            expect(await service.create(makeRun(uuid('r1'), { address: 'second', agent: 'b' }))).toBe(false);
            expect(await service.findOneOrFail(uuid('r1'))).toEqual(before);
            expect((await service.find()).total).toBe(1);
        });

        it('concurrent creates of one id: exactly one returns true and its run is stored', async () => {
            const results = await Promise.all(
                Array.from({ length: 5 }, (_, i) => service.create(makeRun(uuid('r1'), { address: `t${i}` }))),
            );

            expect(results.filter(Boolean)).toHaveLength(1);
            expect((await service.findOneOrFail(uuid('r1'))).address).toBe(`t${results.indexOf(true)}`);
        });

        it('takes parentRunId from trigger.parent, never from the caller', async () => {
            await service.create(makeRun(uuid('p1')));
            await service.create(makeRun(uuid('r1'), { parentRunId: uuid('p1') }));
            await service.create(makeChild(uuid('c1'), uuid('p1')));

            expect(await service.findOneOrFail(uuid('r1'))).not.toHaveProperty('parentRunId');
            expect((await service.findOneOrFail(uuid('c1'))).parentRunId).toBe(uuid('p1'));
            expect(idsOf((await service.find({ parentRunId: uuid('p1') })).data)).toEqual([uuid('c1')]);
        });

        it('takes no parentRunId from a peer parent: its run id names a run of another app', async () => {
            const run = makeRun(uuid('r1'));

            run.trigger = {
                ...run.trigger,
                channel: 'agent',
                parent: {
                    kind: 'peer',
                    peer: 'dev',
                    runId: uuid('foreign'),
                    standIn: uuid('stand-in'),
                    agent: 'assistant',
                    role: 'default',
                    depth: 1,
                },
            };

            expect(await service.create(run)).toBe(true);
            expect(await service.findOneOrFail(uuid('r1'))).not.toHaveProperty('parentRunId');
            expect(await service.find({ hasParent: true })).toEqual({ data: [], total: 0 });
        });

        it('create of a child whose parent is absent throws RunNotFoundError naming the parent and writes nothing', async () => {
            await expect(service.create(makeChild(uuid('r1'), uuid('missing')))).rejects.toThrow(new RunNotFoundError(uuid('missing')));
            expect(await service.findOne(uuid('r1'))).toBeUndefined();
        });

        it('reads a legacy envelope and wait point in the current shape, from every read, and leaves the stored row as it is', async () => {
            const run = makeRun(uuid('r1'));
            const legacy = {
                id: run.trigger.id,
                agent: 'a',
                trigger: 'http',
                payload: {},
                receivedAt: run.trigger.receivedAt,
                source: 'github',
                thread: 'owner/repo#7',
            };

            // stored as an older chamvi wrote it
            await repository.save(repository.create({
                ...run,
                trigger: legacy as unknown as Run['trigger'],
                waiting: LEGACY_APPROVAL,
            }));

            for (const read of [
                await service.findOne(uuid('r1')),
                (await service.find({})).data[0],
                (await service.find({ waitKind: 'approval' })).data[0],
                (await service.list(defineQuery({}))).data[0],
                await service.update(uuid('r1'), { status: RunStatus.RUNNING }),
            ]) {
                expect(read?.trigger.channel).toBe('github');
                expect(read?.trigger.address).toBe('owner/repo#7');
                expect(read?.trigger).not.toHaveProperty('source');
                expect(read?.trigger).not.toHaveProperty('thread');
                expect(read?.waiting).toEqual({ ...LEGACY_APPROVAL, id: '0:c1:0' });
            }

            const stored = (await repository.findOneById(uuid('r1')))!;

            expect(stored.trigger).toEqual(legacy);
            expect(stored.waiting).toEqual(LEGACY_APPROVAL);
        });

        it('returns copies: changing a read run changes nothing stored', async () => {
            await service.create(makeRun(uuid('r1'), { claim: { owner: 'w', expiresAt: new Date(20_000) } }));

            const read = await service.findOneOrFail(uuid('r1'));

            read.claim!.owner = 'evil';
            read.trigger.payload = { changed: true };

            const [listed] = (await service.find({})).data;

            listed!.usage.inputTokens = 77;
            expect(await service.findOneOrFail(uuid('r1'))).toEqual(makeRun(uuid('r1'), { claim: { owner: 'w', expiresAt: new Date(20_000) } }));
        });
    });

    describe('update', () => {
        it('stamps updatedAt from the clock, keeps it with keepUpdatedAt, and takes the patch\'s own', async () => {
            await service.create(makeRun(uuid('r1')));

            const kept = await service.update(uuid('r1'), { subtreeUsage: { inputTokens: 3, outputTokens: 4 } }, { keepUpdatedAt: true });

            expect(kept.updatedAt).toEqual(new Date(1_000));
            expect(kept.subtreeUsage).toEqual({ inputTokens: 3, outputTokens: 4 });
            expect((await service.findOneOrFail(uuid('r1'))).updatedAt).toEqual(new Date(1_000));

            clock.advance(5_000);
            expect((await service.update(uuid('r1'), { status: RunStatus.RUNNING })).updatedAt).toEqual(new Date(15_000));
            expect((await service.update(uuid('r1'), { updatedAt: new Date(2_000) })).updatedAt).toEqual(new Date(2_000));
            expect((await service.update(uuid('r1'), { updatedAt: new Date(3_000) }, { keepUpdatedAt: true })).updatedAt).toEqual(new Date(3_000));
        });

        it('updateWith derives the patch from the stored row after the checks, a throw writes nothing', async () => {
            await service.create(makeRun(uuid('r1'), { status: RunStatus.WAITING, waiting: DISPATCH }));
            await service.update(uuid('r1'), { usage: { inputTokens: 7, outputTokens: 0 } });

            const seen: Run[] = [];
            const updated = await service.updateWith(uuid('r1'), (run) => {
                seen.push(run);

                return { usage: { inputTokens: run.usage.inputTokens + 1, outputTokens: 0 } };
            }, { expectStatus: [RunStatus.WAITING], expectWaitId: DISPATCH.id });

            expect(updated.usage).toEqual({ inputTokens: 8, outputTokens: 0 });
            expect(seen[0]?.waiting).toEqual(DISPATCH);

            await expect(service.updateWith(uuid('r1'), () => {
                throw new InvalidRunStateError('moved on');
            })).rejects.toBeInstanceOf(InvalidRunStateError);
            await expect(service.updateWith(uuid('r1'), () => ({ usage: { inputTokens: 0, outputTokens: 0 } }), { expectWaitId: 'other' }))
                .rejects.toBeInstanceOf(InvalidRunStateError);
            expect((await service.findOneOrFail(uuid('r1'))).usage).toEqual({ inputTokens: 8, outputTokens: 0 });
        });

        it('clears a property set to undefined and keeps untouched ones, the claim too', async () => {
            const taint = { at: new Date('2026-10-30T12:34:56.789Z'), source: 'tool:web_fetch' };

            await service.create(makeRun(uuid('r1'), {
                concurrencyKey: 'k',
                address: 't',
                usage: { inputTokens: 3, outputTokens: 4 },
                subtreeUsage: { inputTokens: 10, outputTokens: 5 },
                agentRevision: 'a'.repeat(64),
                taint,
                waiting: DISPATCH,
            }));
            await service.claim(uuid('r1'), 'w1', 1_000);

            const before = await service.findOneOrFail(uuid('r1'));
            const updated = await service.update(uuid('r1'), { status: RunStatus.RUNNING, waiting: undefined });

            expect(updated).not.toHaveProperty('waiting');
            expect(updated).toEqual({
                ...before,
                status: RunStatus.RUNNING,
                waiting: undefined,
                updatedAt: new Date(clock.now()),
            });
            expect(await service.findOneOrFail(uuid('r1'))).toEqual(updated);
            expect(updated.taint?.at).toBeInstanceOf(Date);

            const released = await service.update(uuid('r1'), { claim: undefined });

            expect(released).not.toHaveProperty('claim');
            expect(await service.findOneOrFail(uuid('r1'))).not.toHaveProperty('claim');
        });

        it('returns from update the value the next read returns', async () => {
            await service.create(makeRun(uuid('r1'), { claim: { owner: 'w1', expiresAt: new Date(20_000) } }));

            const updated = await service.update(uuid('r1'), {
                status: RunStatus.COMPLETED,
                claim: undefined,
                output: {
                    at: new Date(5_000),
                    skipped: undefined,
                    n: 1,
                },
                waiting: LEGACY_APPROVAL,
            });

            expect(updated).toStrictEqual(await service.findOne(uuid('r1')));
        });

        it('never changes the id or the parent', async () => {
            await service.create(makeRun(uuid('p1')));
            await service.create(makeRun(uuid('r1')));
            await service.create(makeChild(uuid('c1'), uuid('p1')));
            await service.update(uuid('r1'), { parentRunId: uuid('p1'), id: uuid('other') });
            await service.update(uuid('c1'), { parentRunId: uuid('r1'), status: RunStatus.RUNNING });

            expect(await service.findOneOrFail(uuid('r1'))).not.toHaveProperty('parentRunId');
            expect(await service.findOne(uuid('other'))).toBeUndefined();
            expect((await service.findOneOrFail(uuid('c1'))).parentRunId).toBe(uuid('p1'));
            expect(idsOf((await service.find({ parentRunId: uuid('p1') })).data)).toEqual([uuid('c1')]);
        });

        it('of a missing or malformed id throws RunNotFoundError', async () => {
            await expect(service.update(uuid('nope'), { status: RunStatus.RUNNING })).rejects.toThrow(new RunNotFoundError(uuid('nope')));
            await expect(service.update('not-a-uuid', { status: RunStatus.RUNNING })).rejects.toThrow('Run "not-a-uuid" was not found.');
        });

        it.each([
            ['expectStatus', { expectStatus: [RunStatus.WAITING, RunStatus.RUNNING] }, 'is "queued", expected one of: waiting, running.'],
            ['expectOwner', { expectOwner: 'w2' }, 'is not claimed by "w2" (claim: w1).'],
            ['expectWaitId', { expectWaitId: '1:c2:w1' }, 'does not wait on "1:c2:w1" (wait: 1:c2:w0).'],
        ] as [string, RunUpdateOptions, string][])('update with a stale %s throws today\'s error with today\'s message and writes nothing', async (_, expect_, message) => {
            await service.create(makeRun(uuid('r1'), { waiting: DISPATCH }));
            await service.claim(uuid('r1'), 'w1', 60_000);

            const before = await service.findOneOrFail(uuid('r1'));
            const error = await service.update(uuid('r1'), { status: RunStatus.COMPLETED }, expect_).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(InvalidRunStateError);
            expect((error as Error).message).toBe(`Run "${uuid('r1')}" ${message}`);
            expect(await service.findOneOrFail(uuid('r1'))).toEqual(before);
        });

        it('names an absent claim and an absent wait point as none', async () => {
            await service.create(makeRun(uuid('r1')));

            await expect(service.update(uuid('r1'), {}, { expectOwner: 'w1' }))
                .rejects.toThrow(`Run "${uuid('r1')}" is not claimed by "w1" (claim: none).`);
            await expect(service.update(uuid('r1'), {}, { expectWaitId: '1:c2:w0' }))
                .rejects.toThrow(`Run "${uuid('r1')}" does not wait on "1:c2:w0" (wait: none).`);
        });

        it('passes the guards that hold: several statuses, the current owner, the wait id', async () => {
            await service.create(makeRun(uuid('r1'), { status: RunStatus.WAITING, waiting: DISPATCH }));
            await service.claim(uuid('r1'), 'w1', 60_000);

            const updated = await service.update(
                uuid('r1'),
                { status: RunStatus.QUEUED },
                {
                    expectStatus: [RunStatus.QUEUED, RunStatus.WAITING],
                    expectOwner: 'w1',
                    expectWaitId: '1:c2:w0',
                },
            );

            expect(updated.status).toBe(RunStatus.QUEUED);
        });

        it('expectOwner checks the current claim: a lease taken over after expiry refuses its former owner', async () => {
            await service.create(makeRun(uuid('r1'), { status: RunStatus.RUNNING }));
            expect(await service.claim(uuid('r1'), 'w1', 1_000)).toBe(true);
            clock.advance(1_001);
            expect(await service.claim(uuid('r1'), 'w2', 1_000)).toBe(true);
            await expect(service.update(uuid('r1'), { status: RunStatus.COMPLETED }, { expectStatus: [RunStatus.RUNNING], expectOwner: 'w1' }))
                .rejects.toBeInstanceOf(InvalidRunStateError);

            const updated = await service.update(
                uuid('r1'),
                { status: RunStatus.COMPLETED, claim: undefined },
                { expectStatus: [RunStatus.RUNNING], expectOwner: 'w2' },
            );

            expect(updated.status).toBe(RunStatus.COMPLETED);
            expect(updated).not.toHaveProperty('claim');
        });

        it('expectWaitId matches a legacy wait point without id by its approvalId', async () => {
            await service.create(makeRun(uuid('r1')));
            await service.update(uuid('r1'), { status: RunStatus.WAITING, waiting: LEGACY_APPROVAL });

            await expect(service.update(uuid('r1'), { status: RunStatus.QUEUED }, { expectWaitId: '0:c1:1' }))
                .rejects.toThrow(`Run "${uuid('r1')}" does not wait on "0:c1:1" (wait: 0:c1:0).`);
            expect((await service.update(uuid('r1'), { status: RunStatus.QUEUED }, { expectWaitId: '0:c1:0' })).status).toBe(RunStatus.QUEUED);
        });

        it('two updates that each expect status queued: one wins', async () => {
            const ids = Array.from({ length: 20 }, (_, i) => uuid(`r${i}`));

            for (const id of ids) {
                await service.create(makeRun(id));
            }

            const results = await Promise.allSettled(ids.flatMap((id) => [
                service.update(id, { status: RunStatus.RUNNING, address: 'first' }, { expectStatus: [RunStatus.QUEUED] }),
                service.update(id, { status: RunStatus.RUNNING, address: 'second' }, { expectStatus: [RunStatus.QUEUED] }),
            ]));

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(20);

            for (const [index, id] of ids.entries()) {
                const pair = results.slice(index * 2, (index * 2) + 2);
                const winner = pair.findIndex((result) => result.status === 'fulfilled');
                const loser = pair[1 - winner] as PromiseRejectedResult;

                expect(loser.reason).toBeInstanceOf(InvalidRunStateError);
                expect(loser.reason.message).toBe(`Run "${id}" is "running", expected one of: queued.`);
                expect((await service.findOneOrFail(id)).address).toBe(winner === 0 ? 'first' : 'second');
            }
        });
    });

    describe('find', () => {
        it('filters by agent, status and concurrencyKey (case sensitive), with pages and the total', async () => {
            await service.create(makeRun(uuid('r3'), {
                status: RunStatus.RUNNING,
                concurrencyKey: 'k1',
                createdAt: new Date(3_000),
            }));
            await service.create(makeRun(uuid('r1'), { concurrencyKey: 'k1', createdAt: new Date(1_000) }));
            await service.create(makeRun(uuid('r2'), {
                agent: 'b',
                concurrencyKey: 'K1',
                createdAt: new Date(2_000),
            }));
            await service.create(makeRun(uuid('r4'), {
                status: RunStatus.COMPLETED,
                concurrencyKey: 'k2',
                createdAt: new Date(4_000),
            }));

            const all = await service.find({});

            expect(all.total).toBe(4);
            expect(idsOf(all.data)).toEqual([uuid('r1'), uuid('r2'), uuid('r3'), uuid('r4')]);
            expect(idsOf((await service.find({ agent: 'a' })).data)).toEqual([uuid('r1'), uuid('r3'), uuid('r4')]);
            expect((await service.find({ status: [RunStatus.QUEUED, RunStatus.RUNNING] })).total).toBe(3);
            expect(await service.find({ status: [] })).toEqual({ data: [], total: 0 });
            expect(idsOf((await service.find({ concurrencyKey: 'k1' })).data)).toEqual([uuid('r1'), uuid('r3')]);

            const page = await service.find({
                agent: 'a',
                limit: 1,
                offset: 1,
            });

            expect(idsOf(page.data)).toEqual([uuid('r3')]);
            expect(page.total).toBe(3);
            expect(await service.find({ agent: 'a', limit: 0 })).toEqual({ data: [], total: 3 });
            expect(await service.find({ offset: 10 })).toEqual({ data: [], total: 4 });
        });

        it('returns every matching run without a limit', async () => {
            for (let i = 0; i < 250; i++) {
                await service.create(makeRun(uuid(`r${String(i).padStart(3, '0')}`), { createdAt: new Date(i) }));
            }

            expect((await service.find({})).data).toHaveLength(250);
            expect((await service.find({ offset: 200 })).data).toHaveLength(50);
        });

        it('orders by createdAt, then id, ascending by default and descending with order desc', async () => {
            await service.create(makeRun(uuid('b')));
            await service.create(makeRun(uuid('a')));
            await service.create(makeRun(uuid('c'), { createdAt: new Date(2_000) }));

            expect(idsOf((await service.find({})).data)).toEqual([uuid('a'), uuid('b'), uuid('c')]);
            expect(idsOf((await service.find({ order: 'asc' })).data)).toEqual([uuid('a'), uuid('b'), uuid('c')]);
            expect(idsOf((await service.find({ order: 'desc' })).data)).toEqual([uuid('c'), uuid('b'), uuid('a')]);

            const page = await service.find({
                order: 'desc',
                limit: 1,
                offset: 1,
            });

            expect(idsOf(page.data)).toEqual([uuid('b')]);
            expect(page.total).toBe(3);
        });

        it('ids returns exactly the listed runs; agents is an AND with agent', async () => {
            await service.create(makeRun(uuid('r1'), { agent: 'a', createdAt: new Date(1_000) }));
            await service.create(makeRun(uuid('r2'), { agent: 'b', createdAt: new Date(2_000) }));
            await service.create(makeRun(uuid('r3'), { agent: 'c', createdAt: new Date(3_000) }));
            await service.create(makeRun(uuid('r4'), { agent: 'a', createdAt: new Date(4_000) }));

            expect(await service.find({ ids: [uuid('r3'), uuid('missing'), uuid('r1')] }))
                .toEqual({ data: [await service.findOneOrFail(uuid('r1')), await service.findOneOrFail(uuid('r3'))], total: 2 });
            expect(await service.find({ ids: [] })).toEqual({ data: [], total: 0 });
            expect(idsOf((await service.find({ agents: ['a', 'c'] })).data)).toEqual([uuid('r1'), uuid('r3'), uuid('r4')]);
            expect(await service.find({ agents: [] })).toEqual({ data: [], total: 0 });
            expect(await service.find({ agent: 'a', agents: ['b'] })).toEqual({ data: [], total: 0 });
            expect(idsOf((await service.find({ agent: 'a', agents: ['a', 'b'] })).data)).toEqual([uuid('r1'), uuid('r4')]);
            expect(await service.find({ agents: ['a'], limit: 0 })).toEqual({ data: [], total: 2 });
        });

        it('filters by the parent: parentRunId, parentRunIds and hasParent, combined', async () => {
            await service.create(makeRun(uuid('p1'), { createdAt: new Date(100) }));
            await service.create(makeRun(uuid('p2'), { createdAt: new Date(200) }));
            await service.create(makeRun(uuid('p3'), { createdAt: new Date(300) }));
            await service.create(makeChild(uuid('c3'), uuid('p2'), 3_000));
            await service.create(makeChild(uuid('c1'), uuid('p1')));
            await service.create(makeChild(uuid('c2'), uuid('p3'), 2_000));
            await service.create(makeChild(uuid('c4'), uuid('p1'), 4_000));
            await service.update(uuid('c4'), { status: RunStatus.RUNNING });

            expect(idsOf((await service.find({ parentRunId: uuid('p1') })).data)).toEqual([uuid('c1'), uuid('c4')]);
            expect(await service.find({ parentRunId: uuid('c1') })).toEqual({ data: [], total: 0 });
            expect(idsOf((await service.find({ parentRunIds: [uuid('p1'), uuid('p2')] })).data)).toEqual([uuid('c1'), uuid('c3'), uuid('c4')]);
            expect(await service.find({ parentRunIds: [] })).toEqual({ data: [], total: 0 });

            const page = await service.find({
                parentRunIds: [uuid('p1'), uuid('p2')],
                limit: 1,
                offset: 1,
            });

            expect(idsOf(page.data)).toEqual([uuid('c3')]);
            expect(page.total).toBe(3);
            expect(idsOf((await service.find({ parentRunIds: [uuid('p1'), uuid('p2')], status: [RunStatus.RUNNING] })).data)).toEqual([uuid('c4')]);
            expect(idsOf((await service.find({ parentRunIds: [uuid('p1'), uuid('p2')], parentRunId: uuid('p2') })).data)).toEqual([uuid('c3')]);
            expect((await service.find({ parentRunIds: [uuid('p1')], parentRunId: uuid('p2') })).total).toBe(0);
            expect((await service.find({ parentRunIds: [uuid('p1')], hasParent: false })).total).toBe(0);

            expect(idsOf((await service.find({ hasParent: true })).data)).toEqual([uuid('c1'), uuid('c2'), uuid('c3'), uuid('c4')]);
            expect(idsOf((await service.find({ hasParent: false })).data)).toEqual([uuid('p1'), uuid('p2'), uuid('p3')]);
            expect((await service.find({ hasParent: true, limit: 0 })).total).toBe(4);
            expect(idsOf((await service.find({ hasParent: true, status: [RunStatus.RUNNING] })).data)).toEqual([uuid('c4')]);
            expect(idsOf((await service.find({ hasParent: true, parentRunId: uuid('p2') })).data)).toEqual([uuid('c3')]);
            expect((await service.find({ hasParent: false, parentRunId: uuid('p1') })).total).toBe(0);
        });

        it('filters by the wait point kind, combined with the other filters, pages and the total', async () => {
            const approval = (id: string): ApprovalWaitPoint => ({
                ...(LEGACY_APPROVAL as ApprovalWaitPoint),
                id,
                approvalId: id,
            });

            await service.create(makeRun(uuid('r1'), {
                status: RunStatus.WAITING,
                waiting: approval('0:c1:0'),
                createdAt: new Date(1_000),
            }));
            await service.create(makeRun(uuid('r2'), {
                status: RunStatus.WAITING,
                waiting: DISPATCH,
                createdAt: new Date(2_000),
            }));
            await service.create(makeRun(uuid('r3'), {
                status: RunStatus.WAITING,
                waiting: approval('0:c1:1'),
                createdAt: new Date(3_000),
            }));
            await service.create(makeRun(uuid('r4'), { createdAt: new Date(4_000) }));

            const approvals = await service.find({ waitKind: 'approval' });

            expect(idsOf(approvals.data)).toEqual([uuid('r1'), uuid('r3')]);
            expect(approvals.total).toBe(2);
            expect(idsOf((await service.find({ waitKind: 'dispatch' })).data)).toEqual([uuid('r2')]);

            const page = await service.find({
                status: [RunStatus.WAITING],
                waitKind: 'approval',
                limit: 1,
                offset: 1,
            });

            expect(idsOf(page.data)).toEqual([uuid('r3')]);
            expect(page.total).toBe(2);
            expect((await service.find({ waitKind: 'approval', limit: 0 })).total).toBe(2);
            expect(idsOf((await service.find({ waitKind: 'approval', order: 'desc' })).data)).toEqual([uuid('r3'), uuid('r1')]);
        });

        it('findOrFail rejects an empty page even when the total is nonzero', async () => {
            await expect(service.findOrFail({})).rejects.toThrow(new RepositoryNotFoundError('runs'));
            await service.create(makeRun(uuid('r1')));
            await expect(service.findOrFail({ limit: 0 })).rejects.toThrow('No matching runs were found.');
            await expect(service.findOrFail({ offset: 1 })).rejects.toBeInstanceOf(RepositoryNotFoundError);
            expect(await service.find({ offset: 1 })).toEqual({ data: [], total: 1 });
            expect(idsOf((await service.findOrFail({ order: 'desc', limit: 1 })).data)).toEqual([uuid('r1')]);
        });

        it('list runs a rapiq query over the public run fields', async () => {
            await service.create(makeRun(uuid('r1'), { claim: { owner: 'w1', expiresAt: new Date(20_000) } }));
            await service.create(makeRun(uuid('r2'), { claim: { owner: 'w2', expiresAt: new Date(20_000) } }));

            const result = await service.list(defineQuery({ filters: eq('claim.owner', 'w2') }));

            expect(idsOf(result.data)).toEqual([uuid('r2')]);
            expect(result.meta.total).toBe(1);
        });

        it('list selects a wait point kind through a top-level waiting filter and refuses any other waiting condition', async () => {
            const approval = { ...LEGACY_APPROVAL, id: '0:c1:0' } as WaitPoint;

            await service.create(makeRun(uuid('w1'), {
                agent: 'a',
                status: RunStatus.WAITING,
                waiting: approval,
            }));
            await service.create(makeRun(uuid('w2'), {
                agent: 'b',
                status: RunStatus.WAITING,
                waiting: DISPATCH,
            }));
            await service.create(makeRun(uuid('w3'), {
                agent: 'b',
                status: RunStatus.WAITING,
                waiting: approval,
            }));
            await service.create(makeRun(uuid('q1'), { agent: 'b' }));

            const approvals = await service.list(defineQuery({ filters: eq('waiting', 'approval'), pagination: { limit: 1 } }));

            expect(idsOf(approvals.data)).toEqual([uuid('w1')]);
            expect(approvals.meta.total).toBe(2);
            expect(idsOf((await service.list(defineQuery({ filters: and(eq('agent', 'b'), eq('waiting', 'approval')) }))).data)).toEqual([uuid('w3')]);
            expect(idsOf((await service.list(defineQuery({ filters: eq('waiting', 'dispatch') }))).data)).toEqual([uuid('w2')]);

            for (const filters of [
                eq('waiting', 'human'),
                inArray('waiting', ['approval']),
                and(eq('waiting', 'approval'), eq('waiting', 'dispatch')),
                or(eq('waiting', 'approval'), eq('agent', 'a')),
            ]) {
                await expect(service.list(defineQuery({ filters }))).rejects.toBeInstanceOf(ValidationError);
            }
        });

        it('list orders by the query\'s sorts, then by id in the last sort\'s direction; createdAt, then id without sorts', async () => {
            await service.create(makeRun(uuid('r2'), { createdAt: new Date(1_000) }));
            await service.create(makeRun(uuid('r1'), { createdAt: new Date(1_000) }));
            await service.create(makeRun(uuid('r0'), { createdAt: new Date(2_000) }));

            expect(idsOf((await service.list(defineQuery({}))).data)).toEqual([uuid('r1'), uuid('r2'), uuid('r0')]);
            expect(idsOf((await service.list(defineQuery({ sorts: { createdAt: 'DESC' } }))).data)).toEqual([uuid('r0'), uuid('r2'), uuid('r1')]);
            expect(idsOf((await service.list(defineQuery({ sorts: { createdAt: 'ASC', id: 'DESC' } }))).data)).toEqual([uuid('r2'), uuid('r1'), uuid('r0')]);

            const page = await service.list(defineQuery({ pagination: { limit: 1, offset: 1 } }));

            expect(idsOf(page.data)).toEqual([uuid('r2')]);
            expect(page.meta.total).toBe(3);
        });
    });

    describe('claim', () => {
        it('grants a single owner until expiry; renew extends to now + ttl for the current owner only', async () => {
            await service.create(makeRun(uuid('r1')));
            expect(await service.claim(uuid('r1'), 'w1', 1_000)).toBe(true);
            expect((await service.findOneOrFail(uuid('r1'))).claim).toEqual({ owner: 'w1', expiresAt: new Date(11_000) });
            expect(await service.claim(uuid('r1'), 'w2', 1_000)).toBe(false);
            clock.advance(500);
            expect(await service.renewClaim(uuid('r1'), 'w1', 1_000)).toBe(true);
            expect((await service.findOneOrFail(uuid('r1'))).claim).toEqual({ owner: 'w1', expiresAt: new Date(11_500) });
            expect(await service.renewClaim(uuid('r1'), 'w2', 1_000)).toBe(false);
            clock.advance(700);
            expect(await service.claim(uuid('r1'), 'w2', 1_000)).toBe(false);
        });

        it('a lease expires at exactly expiresAt: renew is refused, a claim takes over', async () => {
            await service.create(makeRun(uuid('r1')));
            expect(await service.claim(uuid('r1'), 'w1', 1_000)).toBe(true);
            clock.advance(999);
            expect(await service.claim(uuid('r1'), 'w2', 1_000)).toBe(false);
            clock.advance(1);
            expect(await service.renewClaim(uuid('r1'), 'w1', 1_000)).toBe(false);
            expect(await service.claim(uuid('r1'), 'w2', 1_000)).toBe(true);
            expect((await service.findOneOrFail(uuid('r1'))).claim?.owner).toBe('w2');
        });

        it('claim and renewClaim of a missing or malformed run return false; renew of an unclaimed run too', async () => {
            await service.create(makeRun(uuid('r1')));
            expect(await service.claim(uuid('nope'), 'w', 1_000)).toBe(false);
            expect(await service.claim('not-a-uuid', 'w', 1_000)).toBe(false);
            expect(await service.renewClaim(uuid('nope'), 'w', 1_000)).toBe(false);
            expect(await service.renewClaim(uuid('r1'), 'w', 1_000)).toBe(false);
        });

        it('is atomic under concurrency: one of twenty claims wins', async () => {
            await service.create(makeRun(uuid('r1')));

            const results = await Promise.all(Array.from({ length: 20 }, (_, i) => service.claim(uuid('r1'), `w${i}`, 1_000)));

            expect(results.filter(Boolean)).toHaveLength(1);
            expect((await service.findOneOrFail(uuid('r1'))).claim?.owner).toBe(`w${results.indexOf(true)}`);
        });

        it('two owners taking over one expired claim: exactly one succeeds and the previous owner\'s renew then fails', async () => {
            const ids = Array.from({ length: 10 }, (_, i) => uuid(`r${i}`));

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

        it('reads the clock after the row lock: a claim waiting for the lock compares a fresh time', async () => {
            await service.create(makeRun(uuid('r1')));
            await service.claim(uuid('r1'), 'w1', 1_000);

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const holder = repository.transaction(async (bound) => {
                await bound.findOneById(uuid('r1'));
                lock();
                await release;
            });

            await locked;

            const claim = service.claim(uuid('r1'), 'w2', 1_000);

            // the lease expires while the claim waits for the row
            clock.advance(1_000);
            done();
            await holder;
            expect(await claim).toBe(true);
        });
    });
});
