/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONVERSATION_LIMITS,
    InvalidRunStateError,
    RunNotFoundError,
    RunStatus,
} from '@chamvi/core';
import type {
    AgentRevision,
    ApprovalWaitPoint,
    Artifact,
    Checkpoint,
    DispatchWaitPoint,
    IStore,
    Step,
    WaitPoint,
} from '@chamvi/core';
import { ControllableClock } from '../clock/index.ts';
import { describeConnectionContract } from './connection.ts';
import {
    RUN_1,
    makeAgentRevision,
    makeArtifact,
    makeChild,
    makeRun,
} from './helpers.ts';

const RUN_2 = '019a0000-0000-7000-8000-000000000002';
const RUN_3 = '019a0000-0000-7000-8000-000000000003';
const RUN_4 = '019a0000-0000-7000-8000-000000000004';
const RESERVED_RUN_1 = '019a0000-0000-7000-8000-000000000005';
const RESERVED_RUN_2 = '019a0000-0000-7000-8000-000000000006';
const PARENT_1 = '019a0000-0000-7000-8000-000000000007';
const PARENT_2 = '019a0000-0000-7000-8000-000000000008';
const PARENT_3 = '019a0000-0000-7000-8000-000000000009';
const CHILD_1 = '019a0000-0000-7000-8000-00000000000a';
const CHILD_2 = '019a0000-0000-7000-8000-00000000000b';
const CHILD_3 = '019a0000-0000-7000-8000-00000000000c';
const CHILD_4 = '019a0000-0000-7000-8000-00000000000d';
const ARTIFACT_1 = '019a0000-0000-7000-8000-00000000000e';
const ARTIFACT_2 = '019a0000-0000-7000-8000-00000000000f';
const ARTIFACT_3 = '019a0000-0000-7000-8000-000000000012';
const ARTIFACT_4 = '019a0000-0000-7000-8000-000000000013';
const TAINTED_RUN = '019a0000-0000-7000-8000-000000000010';
const CLEAN_RUN = '019a0000-0000-7000-8000-000000000011';
const MISSING_ID = '019a0000-0000-7000-8000-000000000fff';

/**
 * Shared behavioural contract for every store.
 *
 * @param create Factory for a fresh, empty store. It MUST use the given clock for all
 *               TTL/expiry decisions (e.g. `(clock) => createMemoryStore({ clock })`).
 */
export function describeRepositoryContract(
    create: (clock: ControllableClock) => IStore | Promise<IStore>,
): void {
    const setup = async () => {
        const clock = new ControllableClock();
        const store = await create(clock);

        return { clock, store };
    };

    describe('repository contract', () => {
        it('findOneOrFail rejects missing identities without creating them', async () => {
            const { store } = await setup();

            await expect(store.runs.findOneOrFail(MISSING_ID)).rejects.toMatchObject({ code: 'run_not_found' });
            await expect(store.artifacts.findOneOrFail(MISSING_ID)).rejects.toMatchObject({ code: 'artifact_not_found' });
            await expect(store.checkpoints.findOneOrFail(MISSING_ID)).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.effects.findOneOrFail('missing')).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.agentRevisions.findOneOrFail('missing')).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.state.findOneOrFail('a', 'missing')).rejects.toMatchObject({ code: 'repository_not_found' });
            expect(await store.runs.find({})).toEqual({ data: [], total: 0 });
            expect(await store.state.find('a')).toEqual([]);
        });

        it.each([MISSING_ID, 'not-a-uuid'])('refuses writes referencing unknown run %s with RunNotFoundError', async (runId) => {
            const { store } = await setup();
            const at = new Date(1_000);

            await expect(store.steps.insert({
                runId,
                index: 0,
                kind: 'llm',
                startedAt: at,
                finishedAt: at,
            })).rejects.toBeInstanceOf(RunNotFoundError);
            await expect(store.checkpoints.save({
                runId,
                stepIndex: 0,
                messages: [],
                createdAt: at,
            })).rejects.toBeInstanceOf(RunNotFoundError);
            await expect(store.runs.insert(makeChild(RUN_1, runId))).rejects.toBeInstanceOf(RunNotFoundError);
            expect(await store.runs.findOne(RUN_1)).toBeUndefined();
            expect(await store.steps.find(runId)).toEqual([]);
            expect(await store.checkpoints.findOne(runId)).toBeUndefined();

            if (!store.conversations) {
                return;
            }

            const identity = {
                agent: 'a',
                channel: 'chat',
                account: 'main',
                chat: 'room',
                audience: 'direct',
            };
            const scope = await store.conversations.resolve(identity);

            await expect(store.conversations.beginTurn(scope, runId, 'hello', DEFAULT_CONVERSATION_LIMITS))
                .rejects.toBeInstanceOf(RunNotFoundError);
            expect(await store.conversations.activeRun(scope)).toBeUndefined();
            expect((await store.conversations.findItems(scope, { limit: 10, offset: 0 })).total).toBe(0);
        });

        it('findOrFail rejects empty collections and pages even when total is nonzero', async () => {
            const { store } = await setup();

            await expect(store.runs.findOrFail({})).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.steps.findOrFail(MISSING_ID)).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.artifacts.findOrFail(MISSING_ID)).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.agentRevisions.findOrFail()).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.state.findOrFail('a')).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.state.findDocumentsOrFail('a', 'notes')).rejects.toMatchObject({ code: 'repository_not_found' });
            await store.runs.insert(makeRun(RUN_1));
            await expect(store.runs.findOrFail({ limit: 0 })).rejects.toMatchObject({ code: 'repository_not_found' });
            await expect(store.runs.findOrFail({ offset: 1 })).rejects.toMatchObject({ code: 'repository_not_found' });
            expect(await store.runs.find({ offset: 1 })).toEqual({ data: [], total: 1 });
            await store.state.set('a', 'key', 'value');
            await expect(store.state.findOrFail('a', { offset: 1 })).rejects.toMatchObject({ code: 'repository_not_found' });
            await store.state.upsertDocument('a', 'notes', '1', { title: 'first' });
            await expect(store.state.findDocumentsOrFail('a', 'notes', { where: { title: 'absent' } })).rejects.toMatchObject({ code: 'repository_not_found' });
        });

        it('OrFail queries preserve ordered results, latest checkpoints and copies', async () => {
            const { store } = await setup();
            const run = makeRun(RUN_1);

            await store.runs.insert(run);
            await store.runs.insert(makeRun(RUN_2, { createdAt: new Date(2_000) }));

            const found = await store.runs.findOneOrFail(RUN_1);

            found.trigger.payload = { changed: true };
            expect(await store.runs.findOneOrFail(RUN_1)).toEqual(run);
            expect((await store.runs.findOrFail({ order: 'desc', limit: 1 })).data.map((row) => row.id)).toEqual([RUN_2]);

            const checkpoint = {
                runId: RUN_1,
                stepIndex: 2,
                messages: [],
                createdAt: new Date(1_000),
            };

            await store.checkpoints.save(checkpoint);
            await store.checkpoints.save({ ...checkpoint, stepIndex: 1 });
            expect(await store.checkpoints.findOneOrFail(RUN_1)).toEqual(checkpoint);

            const artifact = makeArtifact(ARTIFACT_1);

            await store.artifacts.insert(artifact, new Uint8Array([1, 2, 3]));
            expect(await store.artifacts.findOneOrFail(ARTIFACT_1)).toEqual(artifact);
            expect(await store.artifacts.findOrFail(RUN_1)).toEqual([artifact]);

            const revision = makeAgentRevision('a');

            await store.agentRevisions.save(revision);
            expect(await store.agentRevisions.findOneOrFail('a')).toEqual(revision);
            expect(await store.agentRevisions.findOrFail()).toEqual([revision]);

            const step: Step = {
                runId: RUN_1,
                index: 0,
                kind: 'llm',
                output: 'hello',
                startedAt: new Date(1_000),
                finishedAt: new Date(1_001),
            };

            await store.steps.insert(step);
            expect(await store.steps.findOrFail(RUN_1)).toEqual([step]);
        });

        it('findOneOrFail treats falsy stored values as present and preserves scope', async () => {
            const { store } = await setup();

            for (const value of [null, false, 0, '']) {
                await store.state.set('a', 'key', value);
                expect(await store.state.findOneOrFail('a', 'key')).toEqual(value);
                await store.effects.save('effect', value);
                expect(await store.effects.findOneOrFail('effect')).toEqual({ result: value });
            }

            await expect(store.state.findOneOrFail('b', 'key')).rejects.toMatchObject({ code: 'repository_not_found' });
            expect(await store.state.findOrFail('a')).toEqual([{ key: 'key', value: '' }]);
            await store.state.upsertDocument('a', 'notes', '1', { title: 'first' });

            const docs = await store.state.findDocumentsOrFail('a', 'notes', { where: { title: 'first' } });

            expect(docs).toEqual([{ id: '1', doc: { title: 'first' } }]);
            docs[0]!.doc = { changed: true };
            expect(await store.state.findDocumentsOrFail('a', 'notes')).toEqual([{ id: '1', doc: { title: 'first' } }]);
            await store.state.set('a', 'key', undefined);
            await expect(store.state.findOneOrFail('a', 'key')).rejects.toMatchObject({ code: 'repository_not_found' });
        });

        it('idempotency.claim is atomic under concurrency', async () => {
            const { store } = await setup();
            const results = await Promise.all(
                Array.from({ length: 20 }, () => store.idempotency.claim('github', 'd1', randomUUID(), 60_000)),
            );

            expect(results.filter((r) => r.created)).toHaveLength(1);

            const winner = results.find((r) => r.created)!;

            expect(winner.runId).toMatch(/^[0-9a-f-]{36}$/);
            expect(results.every((r) => r.runId === winner.runId)).toBe(true);
        });

        it('idempotency.claim expires after ttl', async () => {
            const { store, clock } = await setup();
            const first = await store.idempotency.claim('github', 'd1', RESERVED_RUN_1, 1_000);

            expect(first).toEqual({ created: true, runId: RESERVED_RUN_1 });
            expect(await store.idempotency.claim('github', 'd1', RESERVED_RUN_2, 1_000)).toEqual({ created: false, runId: RESERVED_RUN_1 });
            clock.advance(1_001);
            expect(await store.idempotency.claim('github', 'd1', RESERVED_RUN_2, 1_000)).toEqual({ created: true, runId: RESERVED_RUN_2 });
        });

        it('runs.update enforces expectStatus', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1));
            await expect(
                store.runs.update(RUN_1, { status: RunStatus.RUNNING }, { expectStatus: [RunStatus.WAITING] }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect((await store.runs.findOne(RUN_1))?.status).toBe(RunStatus.QUEUED);

            const updated = await store.runs.update(RUN_1, { status: RunStatus.RUNNING }, { expectStatus: [RunStatus.QUEUED] });

            expect(updated.status).toBe(RunStatus.RUNNING);
            expect((await store.runs.findOne(RUN_1))?.status).toBe(RunStatus.RUNNING);
        });

        it('runs.claim grants a single owner until expiry', async () => {
            const { store, clock } = await setup();

            await store.runs.insert(makeRun(RUN_1));
            expect(await store.runs.claim(RUN_1, 'w1', 1_000)).toBe(true);
            expect(await store.runs.claim(RUN_1, 'w2', 1_000)).toBe(false);
            clock.advance(500);
            expect(await store.runs.renewClaim(RUN_1, 'w1', 1_000)).toBe(true);
            expect(await store.runs.renewClaim(RUN_1, 'w2', 1_000)).toBe(false);
            clock.advance(700);
            expect(await store.runs.claim(RUN_1, 'w2', 1_000)).toBe(false);
        });

        it('runs.claim can be taken over after expiry', async () => {
            const { store, clock } = await setup();

            await store.runs.insert(makeRun(RUN_1));
            expect(await store.runs.claim(RUN_1, 'w1', 1_000)).toBe(true);
            clock.advance(1_001);
            expect(await store.runs.renewClaim(RUN_1, 'w1', 1_000)).toBe(false);
            expect(await store.runs.claim(RUN_1, 'w2', 1_000)).toBe(true);
            expect((await store.runs.findOne(RUN_1))?.claim?.owner).toBe('w2');
        });

        it('checkpoints.findOne returns highest stepIndex', async () => {
            const { store } = await setup();

            expect(await store.checkpoints.findOne(RUN_1)).toBeUndefined();
            await store.runs.insert(makeRun(RUN_1));
            await store.runs.insert(makeRun(RUN_2));

            const at = new Date(1_000);

            await store.checkpoints.save({
                runId: RUN_1,
                stepIndex: 2,
                messages: [],
                createdAt: at,
            });
            await store.checkpoints.save({
                runId: RUN_1,
                stepIndex: 5,
                messages: [],
                createdAt: at,
            });
            await store.checkpoints.save({
                runId: RUN_1,
                stepIndex: 3,
                messages: [],
                createdAt: at,
            });
            await store.checkpoints.save({
                runId: RUN_2,
                stepIndex: 9,
                messages: [],
                createdAt: at,
            });
            expect((await store.checkpoints.findOne(RUN_1))?.stepIndex).toBe(5);
        });

        it('checkpoints.save with an equal stepIndex replaces the latest', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1));

            const at = new Date(1_000);

            await store.checkpoints.save({
                runId: RUN_1,
                stepIndex: 2,
                messages: [],
                createdAt: at,
            });
            await store.checkpoints.save({
                runId: RUN_1,
                stepIndex: 2,
                messages: [{ role: 'user', content: 'again' }],
                createdAt: at,
            });
            expect((await store.checkpoints.findOne(RUN_1))?.messages).toEqual([{ role: 'user', content: 'again' }]);
        });

        it('lock acquire is exclusive and released by owner only', async () => {
            const { store } = await setup();

            expect(await store.locks.acquire('k', 'a', 1_000)).toBe(true);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(false);
            await store.locks.release('k', 'b');
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(false);
            await store.locks.release('k', 'a');
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(true);
        });

        it('locks.renew extends a held lease to exactly now + ttlMs', async () => {
            const { clock, store } = await setup();

            expect(await store.locks.acquire('k', 'a', 1_000)).toBe(true);
            clock.advance(999);
            expect(await store.locks.renew('k', 'a', 1_000)).toBe(true);
            clock.advance(1);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(false);
            clock.advance(998);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(false);
            clock.advance(1);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(true);
        });

        it('locks.renew is refused after expiry, for another owner, after release and for an unknown key', async () => {
            const { clock, store } = await setup();

            expect(await store.locks.renew('missing', 'a', 1_000)).toBe(false);
            expect(await store.locks.acquire('k', 'a', 1_000)).toBe(true);
            expect(await store.locks.renew('k', 'b', 1_000)).toBe(false);
            clock.advance(1_000);
            expect(await store.locks.renew('k', 'a', 1_000)).toBe(false);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(true);
            expect(await store.locks.renew('k', 'a', 1_000)).toBe(false);
            expect(await store.locks.renew('k', 'b', 1_000)).toBe(true);
            await store.locks.release('k', 'b');
            expect(await store.locks.renew('k', 'b', 1_000)).toBe(false);
            expect(await store.locks.acquire('k', 'c', 1_000)).toBe(true);
        });

        it('effect roundtrip', async () => {
            const { store } = await setup();

            expect(await store.effects.findOne('e1')).toBeUndefined();
            await store.effects.save('e1', { ok: true });
            expect(await store.effects.findOne('e1')).toEqual({ result: { ok: true } });
            await store.effects.save('e2', null);
            expect(await store.effects.findOne('e2')).toEqual({ result: null });
        });

        it('state.find lists one agent\'s keys in code-point order with limit and offset', async () => {
            const { store } = await setup();

            await store.state.set('triage', 'b', 2);
            await store.state.set('triage', 'a-1', { n: 1 });
            await store.state.set('triage', 'B', 'upper');
            await store.state.set('triage', 'a', [1]);
            await store.state.set('other', 'x', true);
            await store.state.set('triage', 'gone', 1);
            await store.state.set('triage', 'gone', undefined);

            expect(await store.state.find('triage')).toEqual([
                { key: 'B', value: 'upper' },
                { key: 'a', value: [1] },
                { key: 'a-1', value: { n: 1 } },
                { key: 'b', value: 2 },
            ]);
            expect((await store.state.find('triage', { limit: 2, offset: 1 })).map((e) => e.key)).toEqual(['a', 'a-1']);
            expect(await store.state.find('triage', { limit: 0 })).toEqual([]);
            expect(await store.state.find('nobody')).toEqual([]);

            const [, first] = await store.state.find('triage');

            (first!.value as number[]).push(2);
            expect((await store.state.find('triage'))[1]!.value).toEqual([1]);
        });

        it('state.find orders an astral key after every BMP key (code points, not UTF-16 units)', async () => {
            const { store } = await setup();

            await store.state.set('triage', '\u{1F600}', 'emoji');
            await store.state.set('triage', '\uFFFD', 'replacement');
            await store.state.set('triage', 'z', 'ascii');
            expect((await store.state.find('triage')).map((e) => e.key)).toEqual(['z', '\uFFFD', '\u{1F600}']);
            expect((await store.state.find('triage', { offset: 1, limit: 1 })).map((e) => e.key)).toEqual(['\uFFFD']);
        });

        it('state.set with undefined removes the key', async () => {
            const { store } = await setup();

            await store.state.set('a', 'k', 1);
            await store.state.set('a', 'k', undefined);
            expect(await store.state.findOne('a', 'k')).toBeUndefined();
            expect(await store.state.find('a')).toEqual([]);
        });

        it('state kv and docs roundtrip, state.findDocuments where filters by top-level equality', async () => {
            const { store } = await setup();

            expect(await store.state.findOne('a', 'k')).toBeUndefined();
            await store.state.set('a', 'k', { n: 1 });
            expect(await store.state.findOne('a', 'k')).toEqual({ n: 1 });
            expect(await store.state.findOne('b', 'k')).toBeUndefined();

            await store.state.upsertDocument('a', 'todos', '1', { title: 'x', done: false });
            await store.state.upsertDocument('a', 'todos', '2', { title: 'y', done: true });
            await store.state.upsertDocument('a', 'todos', '3', { title: 'z', done: true });
            await store.state.upsertDocument('b', 'todos', '1', { title: 'other', done: true });

            expect(await store.state.findDocuments('a', 'todos')).toHaveLength(3);

            const done = await store.state.findDocuments('a', 'todos', { where: { done: true } });

            expect(done.map((d) => d.id).sort()).toEqual(['2', '3']);
            expect(await store.state.findDocuments('a', 'todos', { where: { done: true }, limit: 1 })).toHaveLength(1);

            await store.state.upsertDocument('a', 'todos', '1', { title: 'x2', done: true });
            expect((await store.state.findDocuments('a', 'todos', { where: { title: 'x2' } })).map((d) => d.id)).toEqual(['1']);
            await store.state.deleteDocument('a', 'todos', '1');
            expect(await store.state.findDocuments('a', 'todos', { where: { title: 'x2' } })).toEqual([]);
        });

        it('runs.find filters by agent, status, concurrencyKey and returns total', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_3, {
                agent: 'a',
                status: RunStatus.RUNNING,
                concurrencyKey: 'k1',
                createdAt: new Date(3_000),
            }));
            await store.runs.insert(makeRun(RUN_1, {
                agent: 'a',
                status: RunStatus.QUEUED,
                concurrencyKey: 'k1',
                createdAt: new Date(1_000),
            }));
            await store.runs.insert(makeRun(RUN_2, {
                agent: 'b',
                status: RunStatus.QUEUED,
                createdAt: new Date(2_000),
            }));
            await store.runs.insert(makeRun(RUN_4, {
                agent: 'a',
                status: RunStatus.COMPLETED,
                concurrencyKey: 'k2',
                createdAt: new Date(4_000),
            }));

            const all = await store.runs.find({});

            expect(all.total).toBe(4);
            expect(all.data.map((r) => r.id)).toEqual([RUN_1, RUN_2, RUN_3, RUN_4]);

            expect((await store.runs.find({ agent: 'a' })).data.map((r) => r.id)).toEqual([RUN_1, RUN_3, RUN_4]);
            expect((await store.runs.find({ status: [RunStatus.QUEUED, RunStatus.RUNNING] })).total).toBe(3);
            expect((await store.runs.find({ concurrencyKey: 'k1' })).data.map((r) => r.id)).toEqual([RUN_1, RUN_3]);

            const page = await store.runs.find({
                agent: 'a',
                limit: 1,
                offset: 1,
            });

            expect(page.total).toBe(3);
            expect(page.data.map((r) => r.id)).toEqual([RUN_3]);
        });

        it('runs.find without a limit returns every matching run', async () => {
            const { store } = await setup();

            for (let i = 0; i < 250; i++) {
                await store.runs.insert(makeRun(randomUUID(), { createdAt: new Date(i) }));
            }

            const all = await store.runs.find({});

            expect(all.total).toBe(250);
            expect(all.data).toHaveLength(250);
            expect((await store.runs.find({ offset: 200 })).data).toHaveLength(50);
        });

        it('runs.claim is atomic under concurrency', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1));

            const results = await Promise.all(
                Array.from({ length: 20 }, (_, i) => store.runs.claim(RUN_1, `w${i}`, 1_000)),
            );

            expect(results.filter(Boolean)).toHaveLength(1);
        });

        it('acquire is atomic under concurrency', async () => {
            const { store } = await setup();
            const results = await Promise.all(
                Array.from({ length: 20 }, (_, i) => store.locks.acquire('k', `o${i}`, 1_000)),
            );

            expect(results.filter(Boolean)).toHaveLength(1);
        });

        it('lock expires after ttl and can be taken over', async () => {
            const { store, clock } = await setup();

            expect(await store.locks.acquire('k', 'a', 1_000)).toBe(true);
            clock.advance(999);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(false);
            clock.advance(1);
            expect(await store.locks.acquire('k', 'b', 1_000)).toBe(true);
            await store.locks.release('k', 'a');
            expect(await store.locks.acquire('k', 'c', 1_000)).toBe(false);
        });

        it('expiry boundary: exactly at expiresAt counts as expired', async () => {
            const { store, clock } = await setup();

            await store.runs.insert(makeRun(RUN_1));
            expect(await store.runs.claim(RUN_1, 'w1', 1_000)).toBe(true);
            await store.idempotency.claim('s', 'k', RESERVED_RUN_1, 1_000);
            clock.advance(999);
            expect(await store.runs.claim(RUN_1, 'w2', 1_000)).toBe(false);
            expect((await store.idempotency.claim('s', 'k', RESERVED_RUN_2, 1_000)).created).toBe(false);
            clock.advance(1);
            expect(await store.runs.renewClaim(RUN_1, 'w1', 1_000)).toBe(false);
            expect(await store.runs.claim(RUN_1, 'w2', 1_000)).toBe(true);
            expect((await store.idempotency.claim('s', 'k', RESERVED_RUN_2, 1_000)).created).toBe(true);
        });

        it('runs.update on a missing run throws RunNotFoundError', async () => {
            const { store } = await setup();

            await expect(store.runs.update(MISSING_ID, { status: RunStatus.RUNNING })).rejects.toBeInstanceOf(RunNotFoundError);
        });

        it('runs.claim and renewClaim on a missing run return false', async () => {
            const { store } = await setup();

            expect(await store.runs.claim(MISSING_ID, 'w', 1_000)).toBe(false);
            expect(await store.runs.renewClaim(MISSING_ID, 'w', 1_000)).toBe(false);
        });

        it('runs.update accepts several allowed statuses', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1, { status: RunStatus.WAITING }));

            const run = await store.runs.update(RUN_1, { status: RunStatus.RUNNING }, { expectStatus: [RunStatus.QUEUED, RunStatus.WAITING] });

            expect(run.status).toBe(RunStatus.RUNNING);
            await expect(
                store.runs.update(RUN_1, { status: RunStatus.FAILED }, { expectStatus: [RunStatus.QUEUED, RunStatus.WAITING] }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
        });

        it('runs.update enforces expectOwner against the current claim', async () => {
            const { store, clock } = await setup();

            await store.runs.insert(makeRun(RUN_1, { status: RunStatus.RUNNING }));
            await expect(
                store.runs.update(RUN_1, { status: RunStatus.COMPLETED }, { expectOwner: 'w1' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect(await store.runs.claim(RUN_1, 'w1', 1_000)).toBe(true);
            await expect(
                store.runs.update(RUN_1, { status: RunStatus.COMPLETED }, { expectOwner: 'w2' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            clock.advance(1_001);
            expect(await store.runs.claim(RUN_1, 'w2', 1_000)).toBe(true);
            await expect(
                store.runs.update(RUN_1, { status: RunStatus.COMPLETED }, { expectStatus: [RunStatus.RUNNING], expectOwner: 'w1' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect((await store.runs.findOne(RUN_1))?.status).toBe(RunStatus.RUNNING);

            const updated = await store.runs.update(
                RUN_1,
                { status: RunStatus.COMPLETED, claim: undefined },
                { expectStatus: [RunStatus.RUNNING], expectOwner: 'w2' },
            );

            expect(updated.status).toBe(RunStatus.COMPLETED);
            expect(updated.claim).toBeUndefined();
        });

        it('runs.update preserves untouched fields and does not clobber claim', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1, {
                concurrencyKey: 'k',
                address: 't',
                usage: { inputTokens: 3, outputTokens: 4 },
            }));
            await store.runs.claim(RUN_1, 'w1', 1_000);

            const before = await store.runs.findOne(RUN_1);
            const updated = await store.runs.update(RUN_1, { status: RunStatus.RUNNING });

            expect(updated.claim).toEqual(before?.claim);
            expect(updated.concurrencyKey).toBe('k');
            expect(updated.address).toBe('t');
            expect(updated.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
            expect(updated.agent).toBe('a');
            expect(updated.createdAt).toEqual(before?.createdAt);
            expect((await store.runs.findOne(RUN_1))?.claim).toEqual(before?.claim);
        });

        it('run taint persists on insert and update with a Date timestamp', async () => {
            const { store } = await setup();
            const taint = { at: new Date('2026-10-30T12:34:56.789Z'), source: 'tool:web_fetch' };

            await store.runs.insert(makeRun(TAINTED_RUN, { taint }));
            await store.runs.insert(makeRun(CLEAN_RUN));

            expect((await store.runs.findOne(CLEAN_RUN))?.taint).toBeUndefined();

            const inserted = await store.runs.findOneOrFail(TAINTED_RUN);

            expect(inserted.taint).toEqual(taint);
            expect(inserted.taint?.at).toBeInstanceOf(Date);

            const patched = await store.runs.update(CLEAN_RUN, { taint });

            expect(patched.taint).toEqual(taint);
            expect(patched.taint?.at).toBeInstanceOf(Date);

            for (const id of [TAINTED_RUN, CLEAN_RUN]) {
                const updated = await store.runs.update(id, { status: RunStatus.RUNNING });

                expect(updated.taint).toEqual(taint);
                expect(updated.taint?.at).toBeInstanceOf(Date);

                const stored = await store.runs.findOneOrFail(id);

                expect(stored.taint).toEqual(taint);
                expect(stored.taint?.at).toBeInstanceOf(Date);
            }
        });

        it('run.address and trigger.channel round-trip', async () => {
            const { store } = await setup();
            const run = makeRun(RUN_1, { address: 'owner/repo#7' });

            run.trigger = {
                ...run.trigger,
                channel: 'github',
                address: 'owner/repo#7',
            };
            await store.runs.insert(run);

            const stored = await store.runs.findOne(RUN_1);

            expect(stored?.address).toBe('owner/repo#7');
            expect(stored?.trigger.channel).toBe('github');
            expect(stored?.trigger.address).toBe('owner/repo#7');
            expect(stored?.trigger).not.toHaveProperty('source');
            expect(stored?.trigger).not.toHaveProperty('thread');

            const updated = await store.runs.update(RUN_1, { address: 'owner/repo#8' });

            expect(updated.address).toBe('owner/repo#8');

            const listed = await store.runs.find({});

            expect(listed.data[0]?.address).toBe('owner/repo#8');
            expect(listed.data[0]?.trigger.channel).toBe('github');
        });

        it('trigger.parent round-trips', async () => {
            const { store } = await setup();
            const run = makeRun(RUN_1);
            const parent = {
                kind: 'dispatch' as const,
                runId: PARENT_1,
                agent: 'a',
                role: 'default',
                depth: 1,
            };

            run.trigger = {
                ...run.trigger,
                channel: 'agent',
                parent,
            };
            await store.runs.insert(makeRun(PARENT_1));
            await store.runs.insert(run);
            expect((await store.runs.findOne(RUN_1))?.trigger.parent).toEqual(parent);

            const listed = await store.runs.find({ ids: [RUN_1] });

            expect(listed.data[0]?.trigger.parent).toEqual(parent);
        });

        it('trigger.parent.source round-trips', async () => {
            const { store } = await setup();
            const run = makeChild(RUN_1, PARENT_1);
            const parent = {
                ...run.trigger.parent!,
                source: { channel: 'github', address: 'o/r#12' },
            };

            run.trigger = { ...run.trigger, parent };
            await store.runs.insert(makeRun(PARENT_1));
            await store.runs.insert(run);
            expect((await store.runs.findOne(RUN_1))?.trigger.parent).toEqual(parent);
            expect((await store.runs.find({ ids: [RUN_1] })).data[0]?.trigger.parent?.source).toEqual(parent.source);
        });

        it('parentRunId is derived from trigger.parent and filters children', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(PARENT_1));
            await store.runs.insert(makeChild(RUN_2, PARENT_1, 2_000));
            await store.runs.insert(makeChild(RUN_1, PARENT_1, 1_500));
            await store.runs.insert(makeRun(RUN_3));

            const children = await store.runs.find({ parentRunId: PARENT_1 });

            expect(children.data.map((r) => r.id)).toEqual([RUN_1, RUN_2]);
            expect(children.total).toBe(2);
            expect((await store.runs.findOne(RUN_1))?.parentRunId).toBe(PARENT_1);
            expect((await store.runs.findOne(RUN_3))?.parentRunId).toBeUndefined();
            expect((await store.runs.findOne(PARENT_1))?.parentRunId).toBeUndefined();
            expect((await store.runs.find({ parentRunId: RUN_3 })).data).toEqual([]);
        });

        it('hasParent filters runs with and without a parent, with paging and total', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(PARENT_1, { createdAt: new Date(500) }));
            await store.runs.insert(makeChild(RUN_1, PARENT_1, 1_000));
            await store.runs.insert(makeRun(RUN_2, { createdAt: new Date(1_500) }));
            await store.runs.insert(makeChild(RUN_3, RUN_1, 2_000));
            await store.runs.update(RUN_3, { status: RunStatus.RUNNING });

            const children = await store.runs.find({ hasParent: true });

            expect(children.data.map((r) => r.id)).toEqual([RUN_1, RUN_3]);
            expect(children.total).toBe(2);
            expect((await store.runs.find({ hasParent: false })).data.map((r) => r.id)).toEqual([PARENT_1, RUN_2]);

            const page = await store.runs.find({
                hasParent: true,
                limit: 1,
                offset: 1,
            });

            expect(page.data.map((r) => r.id)).toEqual([RUN_3]);
            expect(page.total).toBe(2);
            expect((await store.runs.find({ hasParent: true, limit: 0 })).total).toBe(2);
            expect((await store.runs.find({ hasParent: true, status: [RunStatus.RUNNING] })).data.map((r) => r.id)).toEqual([RUN_3]);
            expect((await store.runs.find({ hasParent: true, parentRunId: PARENT_1 })).data.map((r) => r.id)).toEqual([RUN_1]);
            expect((await store.runs.find({ hasParent: false, parentRunId: PARENT_1 })).total).toBe(0);
        });

        it('parentRunIds filters the children of several runs, with paging and total', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(PARENT_1, { createdAt: new Date(100) }));
            await store.runs.insert(makeRun(PARENT_2, { createdAt: new Date(200) }));
            await store.runs.insert(makeRun(PARENT_3, { createdAt: new Date(300) }));
            await store.runs.insert(makeChild(CHILD_3, PARENT_2, 3_000));
            await store.runs.insert(makeChild(CHILD_1, PARENT_1, 1_000));
            await store.runs.insert(makeChild(CHILD_2, PARENT_3, 2_000));
            await store.runs.insert(makeChild(CHILD_4, PARENT_1, 4_000));
            await store.runs.update(CHILD_4, { status: RunStatus.RUNNING });

            const children = await store.runs.find({ parentRunIds: [PARENT_1, PARENT_2] });

            expect(children.data.map((r) => r.id)).toEqual([CHILD_1, CHILD_3, CHILD_4]);
            expect(children.total).toBe(3);
            expect((await store.runs.find({ parentRunIds: [] })).data).toEqual([]);
            expect((await store.runs.find({ parentRunIds: [] })).total).toBe(0);

            const page = await store.runs.find({
                parentRunIds: [PARENT_1, PARENT_2],
                limit: 1,
                offset: 1,
            });

            expect(page.data.map((r) => r.id)).toEqual([CHILD_3]);
            expect(page.total).toBe(3);
            expect((await store.runs.find({ parentRunIds: [PARENT_1, PARENT_2], status: [RunStatus.RUNNING] })).data.map((r) => r.id))
                .toEqual([CHILD_4]);
            expect((await store.runs.find({ parentRunIds: [PARENT_1, PARENT_2], parentRunId: PARENT_2 })).data.map((r) => r.id)).toEqual([CHILD_3]);
            expect((await store.runs.find({ parentRunIds: [PARENT_1], parentRunId: PARENT_2 })).total).toBe(0);
            expect((await store.runs.find({ parentRunIds: [PARENT_1], hasParent: false })).total).toBe(0);
        });

        it('parentRunId comes from trigger.parent, never from the caller (insert or update)', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(PARENT_1));
            await store.runs.insert(makeRun(RUN_1, { parentRunId: PARENT_1 }));

            expect((await store.runs.findOne(RUN_1))?.parentRunId).toBeUndefined();
            expect((await store.runs.find({ parentRunId: PARENT_1 })).data).toEqual([]);

            await store.runs.insert(makeChild(CHILD_1, PARENT_1));
            await store.runs.update(RUN_1, { parentRunId: PARENT_1 });
            await store.runs.update(CHILD_1, { parentRunId: RUN_1, status: RunStatus.RUNNING });

            expect((await store.runs.findOne(RUN_1))?.parentRunId).toBeUndefined();
            expect((await store.runs.findOne(CHILD_1))?.parentRunId).toBe(PARENT_1);
            expect((await store.runs.find({ parentRunId: PARENT_1 })).data.map((r) => r.id)).toEqual([CHILD_1]);
        });

        it('insert of a child whose parent is absent throws RunNotFoundError and writes nothing', async () => {
            const { store } = await setup();

            await expect(store.runs.insert(makeChild(RUN_1, MISSING_ID))).rejects.toBeInstanceOf(RunNotFoundError);
            expect(await store.runs.findOne(RUN_1)).toBeUndefined();
        });

        it('find({ ids }) returns exactly the listed runs', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1, { createdAt: new Date(1_000) }));
            await store.runs.insert(makeRun(RUN_2, { createdAt: new Date(2_000) }));
            await store.runs.insert(makeRun(RUN_3, { createdAt: new Date(3_000) }));

            const listed = await store.runs.find({ ids: [RUN_3, MISSING_ID, RUN_1] });

            expect(listed.data.map((r) => r.id)).toEqual([RUN_1, RUN_3]);
            expect(listed.total).toBe(2);
            expect(await store.runs.find({ ids: [] })).toEqual({ data: [], total: 0 });
        });

        it('find({ agents }) returns only the runs of the listed agents, an AND with agent', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_1, { agent: 'a', createdAt: new Date(1_000) }));
            await store.runs.insert(makeRun(RUN_2, { agent: 'b', createdAt: new Date(2_000) }));
            await store.runs.insert(makeRun(RUN_3, { agent: 'c', createdAt: new Date(3_000) }));
            await store.runs.insert(makeRun(RUN_4, { agent: 'a', createdAt: new Date(4_000) }));

            const listed = await store.runs.find({ agents: ['a', 'c'] });

            expect(listed.data.map((r) => r.id)).toEqual([RUN_1, RUN_3, RUN_4]);
            expect(listed.total).toBe(3);
            expect(await store.runs.find({ agents: [] })).toEqual({ data: [], total: 0 });
            expect(await store.runs.find({ agent: 'a', agents: ['b'] })).toEqual({ data: [], total: 0 });
            expect((await store.runs.find({ agent: 'a', agents: ['a', 'b'] })).data.map((r) => r.id)).toEqual([RUN_1, RUN_4]);
            expect(await store.runs.find({ agents: ['a'], limit: 0 })).toEqual({ data: [], total: 2 });
        });

        it('subtreeUsage round-trips and survives unrelated updates', async () => {
            const { store } = await setup();
            const subtreeUsage = { inputTokens: 10, outputTokens: 5 };

            await store.runs.insert(makeRun(RUN_1, { subtreeUsage }));
            await store.runs.insert(makeRun(RUN_2));

            expect((await store.runs.findOne(RUN_1))?.subtreeUsage).toEqual(subtreeUsage);
            expect((await store.runs.findOne(RUN_2))?.subtreeUsage).toBeUndefined();

            const updated = await store.runs.update(RUN_1, { status: RunStatus.RUNNING });

            expect(updated.subtreeUsage).toEqual(subtreeUsage);
            expect((await store.runs.findOne(RUN_1))?.subtreeUsage).toEqual(subtreeUsage);

            await store.runs.update(RUN_2, { subtreeUsage: { inputTokens: 1, outputTokens: 2 } });
            expect((await store.runs.findOne(RUN_2))?.subtreeUsage).toEqual({ inputTokens: 1, outputTokens: 2 });
        });

        it('both wait point kinds round-trip with Date revival', async () => {
            const { store } = await setup();
            const approval: ApprovalWaitPoint = {
                kind: 'approval',
                id: '0:c1:0',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                options: [{ id: 'yes', label: 'Yes' }],
                channel: 'console',
                expiresAt: new Date(5_000),
                notifiedAt: new Date(2_000),
            };
            const dispatch: DispatchWaitPoint = {
                kind: 'dispatch',
                id: '1:c2:w0',
                toolName: 'review',
                toolCallId: 'c2',
                runIds: [CHILD_1, CHILD_2],
                expiresAt: new Date(9_000),
            };

            await store.runs.insert(makeRun(RUN_1, { status: RunStatus.WAITING, waiting: approval }));
            await store.runs.insert(makeRun(RUN_2));
            await store.runs.update(RUN_2, { status: RunStatus.WAITING, waiting: dispatch });

            const first = await store.runs.findOneOrFail(RUN_1);
            const second = await store.runs.findOneOrFail(RUN_2);

            expect(first.waiting).toEqual(approval);
            expect(first.waiting?.expiresAt).toBeInstanceOf(Date);
            expect(first.waiting?.kind === 'approval' ? first.waiting.notifiedAt : undefined).toBeInstanceOf(Date);
            expect(second.waiting).toEqual(dispatch);
            expect(second.waiting?.expiresAt).toBeInstanceOf(Date);

            const listed = await store.runs.find({ ids: [RUN_2] });

            expect(listed.data[0]?.waiting).toEqual(dispatch);
            expect(listed.data[0]?.waiting?.expiresAt).toBeInstanceOf(Date);
        });

        it('waitKind filters by the wait point kind, with paging and total', async () => {
            const { store } = await setup();
            const approval = (id: string): ApprovalWaitPoint => ({
                kind: 'approval',
                id,
                approvalId: id,
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: new Date(5_000),
            });
            const dispatch: DispatchWaitPoint = {
                kind: 'dispatch',
                id: '1:c2:w0',
                toolName: 'review',
                toolCallId: 'c2',
                runIds: [MISSING_ID],
                expiresAt: new Date(9_000),
            };

            await store.runs.insert(makeRun(RUN_1, {
                status: RunStatus.WAITING,
                waiting: approval('0:c1:0'),
                createdAt: new Date(1_000),
            }));
            await store.runs.insert(makeRun(RUN_2, {
                status: RunStatus.WAITING,
                waiting: dispatch,
                createdAt: new Date(2_000),
            }));
            await store.runs.insert(makeRun(RUN_3, {
                status: RunStatus.WAITING,
                waiting: approval('0:c1:1'),
                createdAt: new Date(3_000),
            }));
            await store.runs.insert(makeRun(RUN_4, { createdAt: new Date(4_000) }));

            const approvals = await store.runs.find({ waitKind: 'approval' });

            expect(approvals.data.map((r) => r.id)).toEqual([RUN_1, RUN_3]);
            expect(approvals.total).toBe(2);
            expect((await store.runs.find({ waitKind: 'dispatch' })).data.map((r) => r.id)).toEqual([RUN_2]);

            const page = await store.runs.find({
                status: [RunStatus.WAITING],
                waitKind: 'approval',
                limit: 1,
                offset: 1,
            });

            expect(page.data.map((r) => r.id)).toEqual([RUN_3]);
            expect(page.total).toBe(2);
            expect((await store.runs.find({ waitKind: 'approval', limit: 0 })).total).toBe(2);
        });

        it('a legacy approval wait point without id reads back with id = approvalId', async () => {
            const { store } = await setup();
            const legacy = {
                kind: 'approval',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: new Date(5_000),
            } as unknown as WaitPoint;

            await store.runs.insert(makeRun(RUN_1));

            const updated = await store.runs.update(RUN_1, { status: RunStatus.WAITING, waiting: legacy });

            expect(updated.waiting?.id).toBe('0:c1:0');
            expect((await store.runs.findOneOrFail(RUN_1)).waiting).toEqual({ ...legacy, id: '0:c1:0' });
            expect((await store.runs.find({ ids: [RUN_1] })).data[0]?.waiting?.id).toBe('0:c1:0');
        });

        it('expectWaitId guards update', async () => {
            const { store } = await setup();
            const waiting: DispatchWaitPoint = {
                kind: 'dispatch',
                id: '1:c2:w0',
                toolName: 'review',
                toolCallId: 'c2',
                runIds: [CHILD_1],
                expiresAt: new Date(9_000),
            };

            await store.runs.insert(makeRun(RUN_1, { status: RunStatus.WAITING, waiting }));
            await store.runs.insert(makeRun(RUN_2, { status: RunStatus.WAITING }));

            await expect(
                store.runs.update(RUN_1, { status: RunStatus.QUEUED }, { expectWaitId: '1:c2:w1' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            await expect(
                store.runs.update(RUN_2, { status: RunStatus.QUEUED }, { expectWaitId: '1:c2:w0' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);
            expect((await store.runs.findOneOrFail(RUN_1)).status).toBe(RunStatus.WAITING);
            expect((await store.runs.findOneOrFail(RUN_2)).status).toBe(RunStatus.WAITING);

            const updated = await store.runs.update(
                RUN_1,
                { status: RunStatus.QUEUED },
                { expectStatus: [RunStatus.WAITING], expectWaitId: '1:c2:w0' },
            );

            expect(updated.status).toBe(RunStatus.QUEUED);
        });

        it('keepUpdatedAt leaves updatedAt as stored', async () => {
            const { store, clock } = await setup();

            await store.runs.insert(makeRun(RUN_1));

            const before = await store.runs.findOneOrFail(RUN_1);

            clock.advance(5_000);

            const kept = await store.runs.update(
                RUN_1,
                { subtreeUsage: { inputTokens: 3, outputTokens: 4 } },
                { keepUpdatedAt: true },
            );

            expect(kept.updatedAt).toEqual(before.updatedAt);
            expect(kept.subtreeUsage).toEqual({ inputTokens: 3, outputTokens: 4 });
            expect((await store.runs.findOneOrFail(RUN_1)).updatedAt).toEqual(before.updatedAt);

            const stamped = await store.runs.update(RUN_1, { subtreeUsage: { inputTokens: 5, outputTokens: 6 } });

            expect(stamped.updatedAt).toEqual(clock.now());
        });

        it('expectWaitId matches a wait point without id by its approvalId', async () => {
            const { store } = await setup();
            const legacy = {
                kind: 'approval',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: new Date(5_000),
            } as unknown as WaitPoint;

            await store.runs.insert(makeRun(RUN_1));
            await store.runs.update(RUN_1, { status: RunStatus.WAITING, waiting: legacy });

            await expect(
                store.runs.update(RUN_1, { status: RunStatus.QUEUED }, { expectWaitId: '0:c1:1' }),
            ).rejects.toBeInstanceOf(InvalidRunStateError);

            const updated = await store.runs.update(RUN_1, { status: RunStatus.QUEUED }, { expectWaitId: '0:c1:0' });

            expect(updated.status).toBe(RunStatus.QUEUED);
        });

        it('an envelope stored before channels (source, thread) reads back as channel and address', async () => {
            const { store } = await setup();
            const run = makeRun(RUN_1);

            run.trigger = {
                id: run.trigger.id,
                agent: run.trigger.agent,
                trigger: run.trigger.trigger,
                payload: run.trigger.payload,
                receivedAt: run.trigger.receivedAt,
                source: 'github',
                thread: 'owner/repo#7',
            } as unknown as typeof run.trigger;
            await store.runs.insert(run);

            for (const stored of [
                await store.runs.findOne(RUN_1),
                (await store.runs.find({})).data[0],
                await store.runs.update(RUN_1, { status: RunStatus.RUNNING }),
            ]) {
                expect(stored?.trigger.channel).toBe('github');
                expect(stored?.trigger.address).toBe('owner/repo#7');
                expect(stored?.trigger).not.toHaveProperty('source');
                expect(stored?.trigger).not.toHaveProperty('thread');
            }
        });

        it('runs.find breaks createdAt ties by id ascending', async () => {
            const { store } = await setup();

            for (const id of [RUN_2, RUN_3, RUN_1]) {
                await store.runs.insert(makeRun(id));
            }

            expect((await store.runs.find({})).data.map((r) => r.id)).toEqual([RUN_1, RUN_2, RUN_3]);
        });

        it('runs.find order desc returns newest first, ties by id descending, and pages from the newest', async () => {
            const { store } = await setup();

            await store.runs.insert(makeRun(RUN_2));
            await store.runs.insert(makeRun(RUN_1));
            await store.runs.insert(makeRun(RUN_3, { createdAt: new Date(2_000) }));
            expect((await store.runs.find({ order: 'desc' })).data.map((r) => r.id)).toEqual([RUN_3, RUN_2, RUN_1]);
            expect((await store.runs.find({ order: 'asc' })).data.map((r) => r.id)).toEqual([RUN_1, RUN_2, RUN_3]);

            const page = await store.runs.find({
                order: 'desc',
                limit: 1,
                offset: 1,
            });

            expect(page.data.map((r) => r.id)).toEqual([RUN_2]);
            expect(page.total).toBe(3);
        });

        it('runs.insert inserts only when the id is absent, also under concurrency', async () => {
            const { store } = await setup();
            const results = await Promise.all(
                Array.from({ length: 5 }, (_, i) => store.runs.insert(makeRun(RUN_1, { address: `t${i}` }))),
            );

            expect(results.filter(Boolean)).toHaveLength(1);

            const winner = results.indexOf(true);

            expect((await store.runs.findOne(RUN_1))?.address).toBe(`t${winner}`);
            await store.runs.update(RUN_1, { status: RunStatus.RUNNING });
            expect(await store.runs.insert(makeRun(RUN_1))).toBe(false);
            expect((await store.runs.findOne(RUN_1))?.status).toBe(RunStatus.RUNNING);
            expect((await store.runs.find({})).total).toBe(1);
        });

        it('does not alias values passed in or returned', async () => {
            const { store } = await setup();
            const at = new Date(1_000);

            // run
            const run = makeRun(RUN_1);

            await store.runs.insert(run);
            run.usage.inputTokens = 99;
            run.trigger.payload = { changed: true };

            const got = (await store.runs.findOne(RUN_1))!;

            expect(got.usage.inputTokens).toBe(0);
            expect(got.trigger.payload).toEqual({});
            got.usage.inputTokens = 77;
            expect((await store.runs.findOne(RUN_1))?.usage.inputTokens).toBe(0);
            await store.runs.claim(RUN_1, 'w', 1_000);

            const claimed = (await store.runs.findOne(RUN_1))!;

            claimed.claim!.owner = 'evil';
            expect((await store.runs.findOne(RUN_1))?.claim?.owner).toBe('w');

            // checkpoint
            const messages = [{ role: 'user', content: 'hi' }] as Checkpoint['messages'];

            await store.checkpoints.save({
                runId: RUN_1,
                stepIndex: 1,
                messages,
                createdAt: at,
            });
            messages.push({ role: 'user', content: 'later' });

            const cp = (await store.checkpoints.findOne(RUN_1))!;

            expect(cp.messages).toHaveLength(1);
            cp.messages.push({ role: 'user', content: 'x' });
            expect((await store.checkpoints.findOne(RUN_1))?.messages).toHaveLength(1);

            // step
            const step: Step = {
                runId: RUN_1,
                index: 0,
                kind: 'tool',
                input: { a: 1 },
                startedAt: at,
                finishedAt: at,
            };

            await store.steps.insert(step);
            (step.input as { a: number }).a = 2;

            const steps = await store.steps.find(RUN_1);

            expect(steps[0]!.input).toEqual({ a: 1 });
            (steps[0]!.input as { a: number }).a = 3;
            expect((await store.steps.find(RUN_1))[0]!.input).toEqual({ a: 1 });

            // effect
            const result = { list: [1] };

            await store.effects.save('e', result);
            result.list.push(2);

            const effect = (await store.effects.findOne('e'))!;

            expect(effect.result).toEqual({ list: [1] });
            (effect.result as { list: number[] }).list.push(3);
            expect(await store.effects.findOne('e')).toEqual({ result: { list: [1] } });

            // doc
            const doc = { n: [1] };

            await store.state.upsertDocument('a', 'c', '1', doc);
            doc.n.push(2);

            const docs = await store.state.findDocuments('a', 'c');

            expect(docs[0]!.doc).toEqual({ n: [1] });
            (docs[0]!.doc as { n: number[] }).n.push(3);
            expect((await store.state.findDocuments('a', 'c'))[0]!.doc).toEqual({ n: [1] });

            // kv
            const value = { n: [1] };

            await store.state.set('a', 'k', value);
            value.n.push(2);

            const stored = (await store.state.findOne('a', 'k')) as { n: number[] };

            expect(stored).toEqual({ n: [1] });
            stored.n.push(3);
            expect(await store.state.findOne('a', 'k')).toEqual({ n: [1] });
        });

        it('artifacts.insert inserts only when the id is absent, also under concurrency', async () => {
            const { store } = await setup();
            const first = makeArtifact(ARTIFACT_1, { filename: 'first.txt' });

            expect(await store.artifacts.insert(first, new Uint8Array([1, 2, 3]))).toBe(true);
            expect(await store.artifacts.insert(makeArtifact(ARTIFACT_1, { filename: 'second.txt', size: 1 }), new Uint8Array([9]))).toBe(false);
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(first);
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([1, 2, 3]);

            const results = await Promise.all(
                Array.from({ length: 10 }, (_, i) => store.artifacts.insert(makeArtifact(ARTIFACT_2, { size: 1 }), new Uint8Array([i]))),
            );

            expect(results.filter(Boolean)).toHaveLength(1);
            expect((await store.artifacts.find(RUN_1)).filter((a) => a.id === ARTIFACT_2)).toHaveLength(1);
        });

        it('artifacts.findOne and artifacts.read return metadata and plain Uint8Array bytes', async () => {
            const { store } = await setup();
            const artifact = makeArtifact(ARTIFACT_1, { size: 4 });

            await store.artifacts.insert(artifact, new Uint8Array([0, 255, 10, 13]));

            const got = await store.artifacts.findOne(ARTIFACT_1);

            expect(got).toEqual(artifact);
            expect(got?.createdAt).toBeInstanceOf(Date);
            expect(got).not.toHaveProperty('data');

            const bytes = await store.artifacts.read(ARTIFACT_1);

            expect(bytes?.constructor).toBe(Uint8Array);
            expect(Array.from(bytes!)).toEqual([0, 255, 10, 13]);

            const empty = makeArtifact(ARTIFACT_2, { size: 0, filename: undefined });

            await store.artifacts.insert(empty, new Uint8Array());
            expect((await store.artifacts.read(ARTIFACT_2))?.byteLength).toBe(0);
            expect((await store.artifacts.findOne(ARTIFACT_2))?.filename).toBeUndefined();
        });

        it('artifact reads of unknown ids are empty', async () => {
            const { store } = await setup();

            expect(await store.artifacts.findOne(MISSING_ID)).toBeUndefined();
            expect(await store.artifacts.read(MISSING_ID)).toBeUndefined();
            expect(await store.artifacts.find(MISSING_ID)).toEqual([]);
        });

        it('artifacts.find returns the run\'s artifacts by createdAt, then id', async () => {
            const { store } = await setup();

            await store.artifacts.insert(makeArtifact(ARTIFACT_3, { createdAt: new Date(2_000) }), new Uint8Array([1]));
            await store.artifacts.insert(makeArtifact(ARTIFACT_2, { createdAt: new Date(1_000) }), new Uint8Array([1]));
            await store.artifacts.insert(makeArtifact(ARTIFACT_1, { createdAt: new Date(2_000) }), new Uint8Array([1]));
            await store.artifacts.insert(makeArtifact(ARTIFACT_4, { runId: RUN_2, createdAt: new Date(500) }), new Uint8Array([1]));

            const listed = await store.artifacts.find(RUN_1);

            expect(listed.map((a) => a.id)).toEqual([ARTIFACT_2, ARTIFACT_1, ARTIFACT_3]);
            expect(listed[0]).toEqual(makeArtifact(ARTIFACT_2, { createdAt: new Date(1_000) }));
            expect((await store.artifacts.find(RUN_2)).map((a) => a.id)).toEqual([ARTIFACT_4]);
        });

        it('does not alias artifacts passed in or returned', async () => {
            const { store } = await setup();
            const artifact: Artifact = makeArtifact(ARTIFACT_1);
            const data = new Uint8Array([1, 2, 3]);

            await store.artifacts.insert(artifact, data);
            data[0] = 9;
            artifact.mediaType = 'text/html';
            artifact.createdAt.setTime(0);
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([1, 2, 3]);
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(makeArtifact(ARTIFACT_1));

            const read = (await store.artifacts.read(ARTIFACT_1))!;

            read[1] = 9;
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([1, 2, 3]);

            const got = (await store.artifacts.findOne(ARTIFACT_1))!;

            got.size = 99;

            const [listed] = await store.artifacts.find(RUN_1);

            listed!.filename = 'evil';
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(makeArtifact(ARTIFACT_1));
        });

        it('artifacts.save inserts an absent artifact', async () => {
            const { store } = await setup();
            const artifact = makeArtifact(ARTIFACT_1);

            expect(await store.artifacts.save(artifact, new Uint8Array([1, 2, 3]))).toEqual(artifact);
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(artifact);
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([1, 2, 3]);
        });

        it('artifacts.save replaces bytes and metadata and keeps createdAt', async () => {
            const { clock, store } = await setup();
            const first = makeArtifact(ARTIFACT_1, {
                mediaType: 'image/png',
                filename: 'first.png',
                createdAt: clock.now(),
            });

            await store.artifacts.insert(first, new Uint8Array([1, 2, 3]));
            clock.advance(5_000);

            const saved = await store.artifacts.save(
                makeArtifact(ARTIFACT_1, {
                    mediaType: 'image/jpeg',
                    filename: undefined,
                    size: 1,
                    createdAt: clock.now(),
                }),
                new Uint8Array([9]),
            );
            const expected: Artifact = {
                id: ARTIFACT_1,
                runId: RUN_1,
                agent: 'a',
                mediaType: 'image/jpeg',
                size: 1,
                createdAt: first.createdAt,
            };

            expect(saved).toEqual(expected);
            expect(saved).not.toHaveProperty('filename');
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(expected);
            expect(await store.artifacts.findOne(ARTIFACT_1)).not.toHaveProperty('filename');
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([9]);
            expect(await store.artifacts.find(RUN_1)).toHaveLength(1);
        });

        it('artifacts.save refuses an id held by another run', async () => {
            const { store } = await setup();
            const first = makeArtifact(ARTIFACT_1);

            await store.artifacts.insert(first, new Uint8Array([1, 2, 3]));
            await expect(store.artifacts.save(makeArtifact(ARTIFACT_1, { runId: RUN_2, size: 1 }), new Uint8Array([9])))
                .rejects.toMatchObject({ code: 'invalid_run_state' });
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(first);
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([1, 2, 3]);
            expect(await store.artifacts.find(RUN_2)).toEqual([]);
        });

        it('artifacts.save copies in and out', async () => {
            const { store } = await setup();
            const artifact = makeArtifact(ARTIFACT_1);
            const data = new Uint8Array([1, 2, 3]);

            const saved = await store.artifacts.save(artifact, data);

            data[0] = 9;
            artifact.mediaType = 'text/html';
            artifact.createdAt.setTime(0);
            saved.size = 99;
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([1, 2, 3]);
            expect(await store.artifacts.findOne(ARTIFACT_1)).toEqual(makeArtifact(ARTIFACT_1));

            await store.artifacts.save(makeArtifact(ARTIFACT_1, { size: 2 }), data.subarray(0, 2));
            data[1] = 7;
            expect(Array.from((await store.artifacts.read(ARTIFACT_1))!)).toEqual([9, 2]);
        });

        it('concurrent artifacts.save calls of one id leave one artifact', async () => {
            const { store } = await setup();

            await Promise.all([
                store.artifacts.save(makeArtifact(ARTIFACT_1, { size: 1 }), new Uint8Array([1])),
                store.artifacts.save(makeArtifact(ARTIFACT_1, { size: 1 }), new Uint8Array([2])),
            ]);

            const listed = await store.artifacts.find(RUN_1);

            expect(listed).toHaveLength(1);
            expect([[1], [2]]).toContainEqual(Array.from((await store.artifacts.read(ARTIFACT_1))!));
        });

        it('agentRevisions.findOne of an unknown agent is undefined', async () => {
            const { store } = await setup();

            expect(await store.agentRevisions.findOne('a')).toBeUndefined();
        });

        it('agentRevisions.save upserts', async () => {
            const { store } = await setup();

            await store.agentRevisions.save(makeAgentRevision('a'));
            expect(await store.agentRevisions.findOne('a')).toEqual(makeAgentRevision('a'));
            await store.agentRevisions.save(makeAgentRevision('a', { hash: 'h2', changedAt: new Date(2_000) }));
            expect(await store.agentRevisions.findOne('a')).toEqual({
                agent: 'a',
                hash: 'h2',
                changedAt: new Date(2_000),
            });
            expect(await store.agentRevisions.find()).toHaveLength(1);
        });

        it('agentRevisions.delete removes it and ignores a missing one', async () => {
            const { store } = await setup();

            await store.agentRevisions.save(makeAgentRevision('a'));
            await store.agentRevisions.save(makeAgentRevision('b'));
            await store.agentRevisions.delete('a');
            expect(await store.agentRevisions.findOne('a')).toBeUndefined();
            await expect(store.agentRevisions.delete('missing')).resolves.toBeUndefined();
            expect(await store.agentRevisions.find()).toEqual([makeAgentRevision('b')]);
        });

        it('agentRevisions.find orders by agent code point', async () => {
            const { store } = await setup();

            expect(await store.agentRevisions.find()).toEqual([]);
            await store.agentRevisions.save(makeAgentRevision('b'));
            await store.agentRevisions.save(makeAgentRevision('a-b'));
            await store.agentRevisions.save(makeAgentRevision('a'));
            expect((await store.agentRevisions.find()).map((r) => r.agent)).toEqual(['a', 'a-b', 'b']);
        });

        it('agent revisions are copied in and out', async () => {
            const { store } = await setup();
            const revision: AgentRevision = makeAgentRevision('a');

            await store.agentRevisions.save(revision);
            revision.hash = 'evil';
            revision.changedAt.setTime(0);
            expect(await store.agentRevisions.findOne('a')).toEqual(makeAgentRevision('a'));

            const got = (await store.agentRevisions.findOne('a'))!;

            expect(got.changedAt).toBeInstanceOf(Date);
            got.hash = 'evil';
            got.changedAt.setTime(0);

            const [listed] = await store.agentRevisions.find();

            expect(listed!.changedAt).toBeInstanceOf(Date);
            listed!.hash = 'evil';
            listed!.changedAt.setTime(0);
            expect(await store.agentRevisions.findOne('a')).toEqual(makeAgentRevision('a'));
            expect(await store.agentRevisions.find()).toEqual([makeAgentRevision('a')]);
        });

        describe('connections', () => {
            describeConnectionContract(setup);
        });
    });
}
