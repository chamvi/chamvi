/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { In } from 'typeorm';
import type { DataSource, EntitySubscriberInterface } from 'typeorm';
import {
    afterEach,
    expect,
    it,
    vi,
} from 'vitest';
import { CONVERSATION_LIMITS_MAX, DEFAULT_CONVERSATION_LIMITS, RunNotFoundError } from '@chamvi/core';
import type { ConversationScope } from '@chamvi/store';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { ConversationItemEntity, ConversationNoteEntity } from '../../../src/entities/index.ts';
import { conversationServiceOf, seedRun } from '../../utils/conversation.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Whether a statement reads the text column of conversation items. */
const readsItemText = (query: string) => query.startsWith('SELECT') &&
    query.includes('chamvi_conversation_items') &&
    /\."text" AS/.test(query);

describePostgres('conversation query bounds', () => {
    let dataSource: DataSource;

    afterEach(async () => {
        vi.restoreAllMocks();

        if (dataSource?.isInitialized) {
            await dataSource.destroy();
        }
    });

    async function setup() {
        dataSource = await createTestDataSource();

        const clock = new ControllableClock(new Date('2026-10-28T00:00:00.000Z'));
        const store = conversationServiceOf(dataSource, clock);
        const scope = await store.resolve({
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'queries',
            audience: 'direct',
        });

        await seedRun(dataSource, testUuid('writer'));
        await store.beginTurn(scope, testUuid('writer'), 'input', DEFAULT_CONVERSATION_LIMITS);

        return {
            clock,
            store,
            scope,
        };
    }

    /** `count` sent items of the run in the scope, of `sizeOf(index)` ASCII bytes each, oldest first. */
    async function seedItems(scope: ConversationScope, runId: string, count: number, sizeOf: (index: number) => number) {
        const sizes = Array.from({ length: count }, (_value, index) => sizeOf(index));

        await dataSource.query(
            `INSERT INTO chamvi_conversation_items (scope_id, generation, key, run_id, created_at, role, text, bytes, status)
             SELECT $1, $2, 'item-' || i, $3, now(), 'assistant', repeat(chr((97 + i % 26)::int), size), size, 'sent'
             FROM unnest($4::int[]) WITH ORDINALITY AS seeded(size, i)
             ORDER BY i`,
            [scope.id, scope.generation, runId, sizes],
        );
    }

    it('recalls older fitting records beyond a page, reading the text of the recalled records only', async () => {
        const {
            clock,
            store,
            scope,
        } = await setup();

        await store.endTurn(scope, testUuid('writer'), []);
        await seedRun(dataSource, testUuid('next'));

        const rows = Array.from({ length: 250 }, (_value, index) => ({
            scopeId: scope.id,
            generation: scope.generation,
            key: `item-${index}`,
            runId: testUuid('writer'),
            createdAt: clock.now(),
            role: 'assistant' as const,
            text: index === 0 ? 'é' : 'éé',
            bytes: index === 0 ? 2 : 4,
            status: 'sent' as const,
        }));

        await dataSource.getRepository(ConversationItemEntity).insert(rows);
        await dataSource.getRepository(ConversationItemEntity).insert({
            ...rows[0]!,
            key: 'unknown',
            text: 'u',
            bytes: 1,
            status: 'unknown',
        });

        const queries = vi.spyOn(dataSource.logger, 'logQuery');
        const result = await store.beginTurn(scope, testUuid('next'), 'now', {
            ...DEFAULT_CONVERSATION_LIMITS,
            maxItems: 3,
            maxHistoryBytes: 6,
        });

        expect(result.kind).toBe('ready');

        if (result.kind !== 'ready') {
            throw new Error('expected ready');
        }

        expect(result.snapshot.itemIds).toEqual(['item-0', 'item-249']);
        expect(result.snapshot.messages).toEqual([
            { role: 'assistant', content: 'é' },
            { role: 'assistant', content: 'éé' },
        ]);
        expect(result.snapshot.omitted).toBe(249);

        const calls = queries.mock.calls.filter(([query]) => query.startsWith('SELECT') && query.includes('chamvi_conversation_items'));
        const sizeReads = calls.filter(([query]) => !readsItemText(query));
        const textReads = calls.filter(([query]) => readsItemText(query));

        // the sizes are read in bounded pages; the text of the two recalled records in one read, and the "turn ended" lookup
        for (const [query] of sizeReads.filter(([query]) => !query.startsWith('SELECT COUNT'))) {
            const limit = /LIMIT (\d+)/.exec(query);

            expect(limit, query).not.toBeNull();
            expect(Number(limit![1])).toBeLessThanOrEqual(CONVERSATION_LIMITS_MAX.maxStoredItems);
        }

        expect(textReads).toHaveLength(2);
        expect(textReads.some(([, parameters]) => parameters?.includes(`user:${testUuid('next')}`))).toBe(true);

        const ids = (await dataSource.getRepository(ConversationItemEntity).findBy({ scopeId: scope.id, key: In(['item-0', 'item-249']) }))
            .map((row) => row.id);

        // the selected read names the scope, the generation and the recalled ids, nothing else
        expect(textReads.some(([, parameters]) => {
            const values = (parameters ?? []).map(String);

            return ids.every((id) => values.includes(id)) && values.length === ids.length + 2;
        })).toBe(true);
    });

    // statements of the turn: 13, of which 3 read sizes (two pages and one count) and 1 the selected text,
    // plus 5 for trimming the one item beyond maxStoredItems (the seeded items, the setup's input and this turn's)
    it.each([
        ['999 large items at the default limits', 999, 16_000, DEFAULT_CONVERSATION_LIMITS, 18],
        ['9,999 items at the highest limits', 9999, 2000, { ...CONVERSATION_LIMITS_MAX, retentionMs: DEFAULT_CONVERSATION_LIMITS.retentionMs }, 18],
    ] as const)('the recall reads the text of the selected items only: %s', async (_name, count, size, limits, maxStatements) => {
        const { store, scope } = await setup();
        const loaded: string[] = [];
        let loadedBytes = 0;
        const subscriber: EntitySubscriberInterface<ConversationItemEntity> = {
            listenTo: () => ConversationItemEntity,
            afterLoad(entity) {
                if (!(typeof entity.text === 'string')) {
                    return;
                }

                loaded.push(entity.key);
                loadedBytes += Buffer.byteLength(entity.text, 'utf8');
            },
        };

        await store.endTurn(scope, testUuid('writer'), []);
        await seedItems(scope, testUuid('writer'), count, (index) => size + (index % 97));
        await seedRun(dataSource, testUuid('next'));
        (dataSource.subscribers as EntitySubscriberInterface[]).push(subscriber);

        const queries = vi.spyOn(dataSource.logger, 'logQuery');
        const result = await store.beginTurn(scope, testUuid('next'), 'now', limits);

        if (result.kind !== 'ready') {
            throw new Error('expected ready');
        }

        const statements = queries.mock.calls.map(([query]) => query);
        const textReads = statements.filter((query) => readsItemText(query));
        const recalled = result.snapshot.messages.reduce((sum, message) => sum + Buffer.byteLength(message.content as string, 'utf8'), 0);

        expect(result.snapshot.itemIds.length).toBeGreaterThan(0);
        expect(result.snapshot.omitted).toBe(count + 1 - result.snapshot.itemIds.length);
        // no text of an item the recall did not select: the "turn ended" lookup (no row) and one read of the selected
        expect([...loaded].sort()).toEqual([...result.snapshot.itemIds].sort());
        expect(loadedBytes).toBe(recalled);
        expect(textReads).toHaveLength(2);
        expect(statements.length).toBeLessThanOrEqual(maxStatements);
    }, 120_000);

    it.each(['age', 'count'] as const)('trims by %s without fetching discarded text', async (mode) => {
        const {
            clock,
            store,
            scope,
        } = await setup();

        await store.endTurn(scope, testUuid('writer'), []);

        const rows = Array.from({ length: 205 }, (_value, index) => ({
            scopeId: scope.id,
            generation: scope.generation,
            key: `item-${index}`,
            runId: testUuid('writer'),
            createdAt: clock.now(),
            role: 'user' as const,
            text: 'discarded text',
            bytes: 14,
            status: 'sent' as const,
        }));

        await dataSource.getRepository(ConversationItemEntity).insert(rows);
        clock.advance(1000);

        const queries = vi.spyOn(dataSource.logger, 'logQuery');

        await store.prune({
            ...DEFAULT_CONVERSATION_LIMITS,
            ...(mode === 'age' ? { retentionMs: 1000 } : { maxStoredItems: 5 }),
        });

        const reads = queries.mock.calls.map(([query]) => query)
            .filter((query) => query.startsWith('SELECT') && query.includes('chamvi_conversation_items'));

        expect(reads.length).toBeGreaterThan(0);
        expect(reads.every((query) => !query.includes('"text"'))).toBe(true);

        const remaining = await store.findItems(scope, { limit: 10, offset: 0 });

        expect(remaining.total).toBe(mode === 'age' ? 0 : 5);
    });

    it('keeps live notes on reset in one write of the notes and drops expired notes', async () => {
        const {
            clock,
            store,
            scope,
        } = await setup();

        for (const key of ['keep', 'expired']) {
            await store.applyNote(scope, {
                id: key,
                inputHash: key,
                kind: 'set',
                key,
                text: `body-${key}`,
                source: {
                    runId: testUuid('writer'),
                    toolCallId: key,
                    stepIndex: 0,
                },
                expiresAt: new Date(clock.now().getTime() + (key === 'expired' ? 1000 : 2000)),
            });
        }

        const note = await store.findOneNote(scope, 'keep');

        await store.endTurn(scope, testUuid('writer'), []);
        clock.advance(1000);

        const queries = vi.spyOn(dataSource.logger, 'logQuery');
        const next = await store.reset(scope.identity, { keepNotes: true });
        const writes = queries.mock.calls.map(([query]) => query)
            .filter((query) => query.includes('chamvi_conversation_notes'));

        // the notes (at most CONVERSATION_NOTES_MAX live ones) are read once and written back in one statement
        expect(writes.filter((query) => query.startsWith('INSERT'))).toHaveLength(1);
        expect(writes.filter((query) => query.startsWith('DELETE'))).toHaveLength(1);
        expect(writes.filter((query) => query.startsWith('UPDATE'))).toHaveLength(0);
        expect(await store.findOneNote(next, 'keep')).toEqual(note);
        expect(await store.findOneNote(next, 'expired')).toBeUndefined();
        expect(await store.findNotes(scope, { limit: 10, offset: 0 })).toEqual({ data: [], total: 0 });
    });

    it('resolve returns one uuid scope for one identity, also when four callers race on a new identity', async () => {
        const { store } = await setup();
        const identity = {
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'race',
            audience: 'direct',
        };
        const scopes = await Promise.all(Array.from({ length: 4 }, () => store.resolve(identity)));
        const [scope] = scopes;

        expect(scope!.id).toMatch(UUID_V7);
        expect(scopes.every((entry) => entry.id === scope!.id)).toBe(true);
        expect(await store.findOne(identity)).toEqual(scope);
    });

    it('pendingEmits and malformed scope or run ids are absent, not a database error', async () => {
        const { store, scope } = await setup();
        const page = { limit: 10, offset: 0 };
        const writer = testUuid('writer');
        const absent = { ...scope, id: 'a'.repeat(64) };
        const item = {
            id: 'emit',
            role: 'assistant' as const,
            text: 'answer',
            runId: writer,
            createdAt: new Date(),
            status: 'pending' as const,
        };

        expect(await store.activeRun(absent)).toBeUndefined();
        expect(await store.pendingEmits(absent, writer)).toEqual([]);
        expect(await store.pendingEmits(scope, 'not-a-uuid')).toEqual([]);
        expect(await store.findItems(absent, page)).toEqual({ data: [], total: 0 });
        expect(await store.findNotes(absent, page)).toEqual({ data: [], total: 0 });
        expect(await store.findOneNote(absent, 'key')).toBeUndefined();
        expect(await store.beginTurn(absent, writer, 'input', DEFAULT_CONVERSATION_LIMITS)).toEqual({ kind: 'stale' });
        // the turn is held: a malformed run is busy, as any other run, before anything is written
        expect(await store.beginTurn(scope, 'not-a-uuid', 'input', DEFAULT_CONVERSATION_LIMITS)).toEqual({ kind: 'busy', runId: writer });
        await expect(store.prepareEmit(absent, item)).rejects.toMatchObject({ code: 'invalid_run_state' });
        await expect(store.confirmEmit(absent, 'emit')).rejects.toMatchObject({ code: 'invalid_run_state' });
        await expect(store.endTurn(absent, writer, [])).resolves.toBeUndefined();
        await expect(store.endTurn(scope, 'not-a-uuid', [])).resolves.toBeUndefined();
        expect(await store.activeRun(scope)).toBe(writer);
        await store.endTurn(scope, writer, []);
        await expect(store.beginTurn(scope, 'not-a-uuid', 'input', DEFAULT_CONVERSATION_LIMITS))
            .rejects.toBeInstanceOf(RunNotFoundError);
    });

    it('a reset keeps the scope id', async () => {
        const { store, scope } = await setup();

        await store.endTurn(scope, testUuid('writer'), []);

        const next = await store.reset(scope.identity, { keepNotes: false });

        expect(next.id).toBe(scope.id);
        expect(next.generation).toBe(scope.generation + 1);
    });

    it('keeps a note row id when the note is written again', async () => {
        const { store, scope } = await setup();
        const operation = {
            inputHash: 'hash',
            kind: 'set' as const,
            key: 'key',
            source: {
                runId: testUuid('writer'),
                toolCallId: 'call',
                stepIndex: 0,
            },
        };
        const notes = dataSource.getRepository(ConversationNoteEntity);

        await store.applyNote(scope, {
            ...operation,
            id: 'first',
            text: 'one',
        });

        const { id } = await notes.findOneByOrFail({ scopeId: scope.id, key: 'key' });

        await store.applyNote(scope, {
            ...operation,
            id: 'second',
            text: 'two',
        });
        expect(await notes.findOneByOrFail({ scopeId: scope.id, key: 'key' })).toMatchObject({ id, text: 'two' });
    });
});
