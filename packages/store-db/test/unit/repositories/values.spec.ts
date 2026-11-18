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
import type { Checkpoint } from '@chamvi/store';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';
import { seedRun } from '../../utils/conversation.ts';
import { createTestServices } from '../../utils/store.ts';

describePostgres('database repository values', () => {
    let dataSource: DataSource;
    let store: ReturnType<typeof createTestServices>;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        store = createTestServices({ dataSource, clock: new ControllableClock(new Date(10_000)) });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('jsonb values round-trip arrays, null and strings', async () => {
        await seedRun(dataSource, testUuid('r1'));
        await store.stateService.set('a', 'arr', [1, 2]);
        await expect(store.stateService.findOne('a', 'arr')).resolves.toEqual([1, 2]);
        await store.stateService.set('a', 'n', null);
        await expect(store.stateService.findOne('a', 'n')).resolves.toBeNull();
        await store.stateService.set('a', 's', 'text');
        await expect(store.stateService.findOne('a', 's')).resolves.toBe('text');
        await store.stateService.set('a', 'arr', undefined);
        await expect(store.stateService.findOne('a', 'arr')).resolves.toBeUndefined();

        await store.effectService.save('e', [1]);
        await expect(store.effectService.findOne('e')).resolves.toEqual({ result: [1] });
        await store.effectService.save('u', undefined);
        await expect(store.effectService.findOne('u')).resolves.toEqual({ result: null });
        await expect(store.effectService.findOne('missing')).resolves.toBeUndefined();

        const step = {
            runId: testUuid('r1'),
            index: 0,
            kind: 'tool' as const,
            name: 'lookup',
            input: ['x'],
            output: 'done',
            startedAt: new Date(1_000),
            finishedAt: new Date(2_000),
        };

        await store.stepService.create(step);

        const steps = await store.stepService.find(testUuid('r1'));

        expect(steps).toEqual([step]);
        expect(Object.keys(steps[0]!)).not.toContain('error');

        await store.stateService.upsertDocument('a', 'c', '1', [1]);
        await expect(store.stateService.findDocuments('a', 'c')).resolves.toEqual([{ id: '1', doc: [1] }]);
        await store.stateService.upsertDocument('a', 'c', 'n', null);
        await expect(store.stateService.findDocuments('a', 'c')).resolves.toContainEqual({ id: 'n', doc: null });

        const cp: Checkpoint = {
            runId: testUuid('r1'),
            stepIndex: 1,
            messages: [
                {
                    role: 'assistant',
                    content: [{
                        type: 'tool-call',
                        toolCallId: 'c1',
                        toolName: 'lookup',
                        input: { q: 'x' },
                    }],
                },
            ],
            finishReason: 'tool-calls',
            createdAt: new Date(3_000),
        };

        await store.checkpointService.save(cp);
        await expect(store.checkpointService.findOne(testUuid('r1'))).resolves.toEqual(cp);
    });

    it('upserts keep the id of the stored row', async () => {
        const stored = async (table: string, where: string, parameters: unknown[]) => {
            const rows: { id: string }[] = await dataSource.query(`SELECT id FROM ${table} WHERE ${where}`, parameters);

            expect(rows).toHaveLength(1);

            return rows[0]!.id;
        };
        const twice = async (table: string, where: string, parameters: unknown[], write: (n: number) => Promise<unknown>) => {
            await write(1);

            const id = await stored(table, where, parameters);

            await write(2);
            expect(await stored(table, where, parameters)).toBe(id);
        };

        await seedRun(dataSource, testUuid('r1'));
        await twice('chamvi_effects', 'key = $1', ['e'], (n) => store.effectService.save('e', n));
        await twice('chamvi_kv', 'agent = $1 AND key = $2', ['a', 'k'], (n) => store.stateService.set('a', 'k', n));
        await twice('chamvi_docs', 'agent = $1 AND document_id = $2', ['a', 'd'], (n) => store.stateService.upsertDocument('a', 'c', 'd', n));
        await twice('chamvi_agent_revisions', 'agent = $1', ['a'], (n) => store.agentRevisionService.save({
            agent: 'a',
            hash: `h${n}`,
            changedAt: new Date(n),
        }));
        await twice('chamvi_checkpoints', 'run_id = $1', [testUuid('r1')], (n) => store.checkpointService.save({
            runId: testUuid('r1'),
            stepIndex: n,
            messages: [],
            createdAt: new Date(n),
        }));

        await twice('chamvi_locks', 'key = $1', ['l'], (n) => store.lockService.acquire('l', `o${n}`, 0));
        await twice('chamvi_idempotency_keys', 'scope = $1 AND key = $2', ['s', 'k'], (n) => store.idempotencyService.claim('s', 'k', testUuid(`r${n}`), 0));
        await expect(store.idempotencyService.claim('s', 'k', testUuid('r9'), 0)).resolves.toEqual({ created: true, runId: testUuid('r9') });
    });

    it('checkpoints.save keeps the row with the higher step index', async () => {
        await seedRun(dataSource, testUuid('r1'));

        const at = new Date(1_000);

        await store.checkpointService.save({
            runId: testUuid('r1'),
            stepIndex: 2,
            messages: [],
            createdAt: at,
        });
        await store.checkpointService.save({
            runId: testUuid('r1'),
            stepIndex: 1,
            messages: [{ role: 'user', content: 'stale' }],
            createdAt: at,
        });

        expect(await store.checkpointService.findOne(testUuid('r1'))).toMatchObject({ stepIndex: 2, messages: [] });
    });

    it('steps.find orders by index, then insertion', async () => {
        await seedRun(dataSource, testUuid('r1'));

        const at = new Date(1_000);

        for (const [index, name] of [[2, 'two'], [0, 'zero'], [1, 'one-a'], [1, 'one-b']] as const) {
            await store.stepService.create({
                runId: testUuid('r1'),
                index,
                kind: 'llm',
                name,
                startedAt: at,
                finishedAt: at,
            });
        }

        const steps = await store.stepService.find(testUuid('r1'));

        expect(steps.map((s) => s.name)).toEqual(['zero', 'one-a', 'one-b', 'two']);
    });

    it('store NUL characters and lone surrogates as U+FFFD, keeping escaped text and surrogate pairs', async () => {
        const raw = {
            nul: 'a\0b',
            'k\0': 1,
            lone: 'x\uD800y\uDC00z',
            pair: 'emoji \uD83D\uDE00',
            literal: '\\u0000 and \\\0 and \\uD800',
        };
        const clean = {
            nul: 'a\uFFFDb',
            'k\uFFFD': 1,
            lone: 'x\uFFFDy\uFFFDz',
            pair: 'emoji \uD83D\uDE00',
            literal: '\\u0000 and \\\uFFFD and \\uD800',
        };

        await store.stateService.set('a', 'k', raw);
        await expect(store.stateService.findOne('a', 'k')).resolves.toEqual(clean);

        await store.effectService.save('e', raw);
        await expect(store.effectService.findOne('e')).resolves.toEqual({ result: clean });

        await store.stateService.upsertDocument('a', 'c', '1', raw);
        await expect(store.stateService.findDocuments('a', 'c', { where: { nul: 'a\0b' } }))
            .resolves.toEqual([{ id: '1', doc: clean }]);

        const at = new Date(1_000);

        await store.runService.create({
            id: testUuid('r1'),
            agent: 'a',
            status: 'queued',
            trigger: {
                id: 't1',
                agent: 'a',
                trigger: 'http',
                channel: 'http',
                payload: raw,
                receivedAt: at,
            },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: at,
            updatedAt: at,
        });
        await store.stepService.create({
            runId: testUuid('r1'),
            index: 0,
            kind: 'tool',
            input: raw,
            output: raw,
            error: raw,
            startedAt: at,
            finishedAt: at,
        });

        const [step] = await store.stepService.find(testUuid('r1'));

        expect(step).toMatchObject({
            input: clean,
            output: clean,
            error: clean,
        });

        await store.checkpointService.save({
            runId: testUuid('r1'),
            stepIndex: 0,
            messages: [{ role: 'user', content: raw.nul }],
            createdAt: at,
        });
        expect((await store.checkpointService.findOne(testUuid('r1')))?.messages).toEqual([{ role: 'user', content: clean.nul }]);

        await store.runService.update(testUuid('r1'), { output: raw });

        const run = await store.runService.findOne(testUuid('r1'));

        expect(run?.trigger.payload).toEqual(clean);
        expect(run?.output).toEqual(clean);
    });

    it('state.findDocuments where with an undefined value matches object documents lacking the key, as MemoryStateRepository does', async () => {
        await store.stateService.upsertDocument('a', 'c', '1', { a: 1 });
        await store.stateService.upsertDocument('a', 'c', '2', { b: 1 });
        await store.stateService.upsertDocument('a', 'c', '3', [1]);
        await store.stateService.upsertDocument('a', 'c', '4', { a: 2, b: 1 });
        await store.stateService.upsertDocument('a', 'c', '5', null);

        const ids = async (where: Record<string, unknown>) => (await store.stateService.findDocuments('a', 'c', { where })).map((d) => d.id);

        await expect(ids({ a: undefined })).resolves.toEqual(['2']);
        await expect(ids({ a: undefined, b: 1 })).resolves.toEqual(['2']);
        await expect(ids({ b: 1 })).resolves.toEqual(['2', '4']);
        await expect(ids({ a: undefined, c: undefined })).resolves.toEqual(['2']);
    });

    it('state.findDocuments where matches nested values by equality, null values and respects limit', async () => {
        await store.stateService.upsertDocument('a', 'c', '1', { nested: { x: [1, 2], y: 1 }, k: null });
        await store.stateService.upsertDocument('a', 'c', '2', { nested: { x: [3] }, k: 1 });
        await store.stateService.upsertDocument('a', 'c', '3', { k: null });

        const ids = async (q: { where?: Record<string, unknown>; limit?: number }) => (await store.stateService.findDocuments('a', 'c', q)).map((d) => d.id);

        // equality at the top level, as memory: a nested subset no longer matches (it did by containment)
        await expect(ids({ where: { nested: { x: [1] } } })).resolves.toEqual([]);
        await expect(ids({ where: { nested: { x: [1, 2], y: 1 } } })).resolves.toEqual(['1']);
        await expect(ids({ where: { k: null } })).resolves.toEqual(['1', '3']);
        await expect(ids({ where: { k: null }, limit: 1 })).resolves.toEqual(['1']);
        await expect(ids({ where: {} })).resolves.toEqual(['1', '2', '3']);
    });

    it('state.upsertDocument with an undefined doc reads back a JSON null', async () => {
        await store.stateService.upsertDocument('a', 'c', 'u', undefined);
        await expect(store.stateService.findDocuments('a', 'c')).resolves.toEqual([{ id: 'u', doc: null }]);
    });
});
