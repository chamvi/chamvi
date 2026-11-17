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
    lt,
} from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { CONVERSATION_ITEM_STORED_ORDER, EntityConflictError } from '@chamvi/store';
import type {
    CheckpointRecord,
    ConversationItemRecord,
    ConversationNoteRecord,
    ConversationOperationRecord,
    ConversationRecord,
    ICheckpointRepository,
    IConversationRepository,
    IRunRepository,
} from '@chamvi/store';
import { makeRun, testUuid } from '../fixture/helpers.ts';
import type { ConversationRepositoryContractInput } from './types.ts';

const KEY = 'a'.repeat(64);

function conversationOf(label: string, overrides: Partial<ConversationRecord> = {}): ConversationRecord {
    return {
        id: testUuid(label),
        key: KEY,
        identity: {
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        },
        generation: 0,
        ...overrides,
    };
}

function itemOf(scopeId: string, runId: string, key: string, overrides: Partial<Omit<ConversationItemRecord, 'id'>> = {}): Omit<ConversationItemRecord, 'id'> {
    return {
        scopeId,
        generation: 0,
        key,
        role: 'user',
        text: `text of ${key}`,
        // stored as given: a repository computes nothing (the service stamps the text's byte length)
        bytes: 1000 + key.length,
        runId,
        createdAt: new Date(1_000),
        status: 'sent',
        ...overrides,
    };
}

function noteOf(label: string, scopeId: string, runId: string, key: string, overrides: Partial<ConversationNoteRecord> = {}): ConversationNoteRecord {
    return {
        id: testUuid(label),
        scopeId,
        generation: 0,
        key,
        text: `note ${key}`,
        createdAt: new Date(1_000),
        updatedAt: new Date(1_000),
        source: {
            runId,
            toolCallId: 'call-1',
            stepIndex: 0,
        },
        ...overrides,
    };
}

function operationOf(
    label: string,
    scopeId: string,
    runId: string,
    operationId: string,
    overrides: Partial<ConversationOperationRecord> = {},
): ConversationOperationRecord {
    return {
        id: testUuid(label),
        scopeId,
        generation: 0,
        operationId,
        runId,
        inputHash: 'hash',
        kind: 'set',
        key: 'name',
        createdAt: new Date(1_000),
        ...overrides,
    };
}

/**
 * The storage behaviour of an `IConversationRepository`: conversations
 * stored as given (`key` unique, `activeRunId` referencing a run), their
 * items, notes and operations as child repositories (unique natural
 * keys, references to the conversation and to a run, item storage keys
 * in the order items are stored), the children bound to the root's
 * transaction and rolled back with it, runs and checkpoints referencing a
 * conversation, a conversation row lock that holds off another
 * transaction's locked read but not the inserts of rows referencing it,
 * copies, and concurrent first saves.
 */
export function describeConversationRepositoryContract(input: ConversationRepositoryContractInput): void {
    describe(`conversation repository contract: ${input.name}`, () => {
        let conversations: IConversationRepository;
        let runs: IRunRepository;
        let checkpoints: ICheckpointRepository;

        beforeEach(async () => {
            ({
                repository: conversations,
                runs,
                checkpoints,
            } = await input.create());
        });

        const insert = (value: ConversationRecord) => conversations.save(conversations.create(value));
        const insertRun = async (label: string) => {
            await runs.save(runs.create(makeRun(testUuid(label))));

            return testUuid(label);
        };
        const insertItem = (value: Omit<ConversationItemRecord, 'id'>) => conversations.items.save(conversations.items.create(value as ConversationItemRecord));

        it('stores a conversation as given, reads it back by key and by id, and resolves from save what the next read returns', async () => {
            const saved = await insert(conversationOf('c1'));

            expect(saved).toStrictEqual(conversationOf('c1'));
            expect(await conversations.findOneBy({ key: KEY })).toStrictEqual(saved);
            expect(await conversations.findOneById(testUuid('c1'))).toStrictEqual(saved);
            expect(await conversations.findOneBy({ key: 'b'.repeat(64) })).toBeNull();
            expect(await conversations.findOneById('not-a-uuid')).toBeNull();
        });

        it('save of a read conversation writes the turn and its snapshot, then clears them, each save resolving the next read', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const read = (await conversations.findOneById(testUuid('c1')))!;
            const snapshot = {
                messages: [{ role: 'user' as const, content: 'hello' }, { role: 'assistant' as const, content: 'hi' }],
                itemIds: ['user:a', 'assistant:a:0'],
                noteKeys: ['name'],
                createdAt: new Date(2_000),
                omitted: 3,
            };
            const held = await conversations.save(conversations.merge(read, {
                activeRunId: runId,
                snapshot,
                generation: 2,
            }));

            expect(held).toStrictEqual(conversationOf('c1', {
                activeRunId: runId,
                snapshot,
                generation: 2,
            }));
            expect(await conversations.findOneById(testUuid('c1'))).toStrictEqual(held);

            const cleared = await conversations.save(conversations.merge(held, { activeRunId: undefined, snapshot: undefined }));
            const next = await conversations.findOneById(testUuid('c1'));

            expect(next).toStrictEqual(conversationOf('c1', { generation: 2 }));
            expect({ ...cleared }).toEqual(next);
        });

        it('a created conversation whose key is stored is EntityConflictError and leaves the stored row', async () => {
            await insert(conversationOf('c1'));

            await expect(insert(conversationOf('c2', { generation: 5 }))).rejects.toBeInstanceOf(EntityConflictError);
            expect(await conversations.findOneBy({ key: KEY })).toStrictEqual(conversationOf('c1'));
            expect(await conversations.findOneById(testUuid('c2'))).toBeNull();
        });

        it('an active run that does not exist is EntityRelationError naming the run, and nothing is stored', async () => {
            await insert(conversationOf('c1'));

            const read = (await conversations.findOneById(testUuid('c1')))!;

            await expect(conversations.save(conversations.merge(read, { activeRunId: testUuid('missing') })))
                .rejects.toMatchObject({
                    code: 'entity_relation_invalid',
                    entity: 'conversation',
                    relation: 'run',
                });
            expect(await conversations.findOneById(testUuid('c1'))).toStrictEqual(conversationOf('c1'));
        });

        it('items get storage keys in the order they are stored; a sort by CONVERSATION_ITEM_STORED_ORDER is the transcript order', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const scopeId = testUuid('c1');
            const first = await insertItem(itemOf(scopeId, runId, 'user:a'));
            const second = await insertItem(itemOf(scopeId, runId, 'assistant:a:0', {
                role: 'assistant',
                status: 'pending',
                effectKey: 'effect',
                target: { channel: 'chat', address: 'room' },
            }));
            const third = await insertItem(itemOf(scopeId, runId, 'assistant:a:1', { role: 'assistant', status: 'unknown' }));

            expect(Number.isSafeInteger(first.id)).toBe(true);
            expect(first.id).toBeLessThan(second.id);
            expect(second.id).toBeLessThan(third.id);
            expect(second).toStrictEqual({
                ...itemOf(scopeId, runId, 'assistant:a:0', {
                    role: 'assistant',
                    status: 'pending',
                    effectKey: 'effect',
                    target: { channel: 'chat', address: 'room' },
                }),
                id: second.id,
            });

            const ascending = await conversations.items.findMany(defineQuery({
                filters: and(eq('scopeId', scopeId), eq('generation', 0)),
                sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
            }));

            expect(ascending.data).toStrictEqual([first, second, third]);

            const older = await conversations.items.findMany(defineQuery({
                filters: and(eq('scopeId', scopeId), lt(CONVERSATION_ITEM_STORED_ORDER, third.id)),
                sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'DESC' },
                pagination: { limit: 1 },
            }));

            expect(older.data.map((item) => item.key)).toEqual(['assistant:a:0']);
            expect(older.meta.total).toBe(2);

            // the sizes of the sent items, newest first, without their text
            const sizes = await conversations.items.findMany(defineQuery({
                fields: [CONVERSATION_ITEM_STORED_ORDER, 'bytes'],
                filters: and(eq('scopeId', scopeId), eq('generation', 0), eq('status', 'sent')),
                sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'DESC' },
                pagination: { limit: 10 },
            }));

            expect(sizes.data).toStrictEqual([{ id: first.id, bytes: first.bytes }]);
            expect(first.bytes).toBe(1000 + 'user:a'.length);

            expect(await conversations.items.findOneBy({
                scopeId,
                generation: 0,
                key: 'user:a',
            })).toStrictEqual(first);
        });

        it('an item, note or operation of a stored natural key is EntityConflictError; another generation may hold it', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const scopeId = testUuid('c1');

            await insertItem(itemOf(scopeId, runId, 'user:a'));
            await expect(insertItem(itemOf(scopeId, runId, 'user:a', { text: 'other' }))).rejects.toBeInstanceOf(EntityConflictError);
            await insertItem(itemOf(scopeId, runId, 'user:a', { generation: 1 }));

            await conversations.notes.save(conversations.notes.create(noteOf('n1', scopeId, runId, 'name')));
            await expect(conversations.notes.save(conversations.notes.create(noteOf('n2', scopeId, runId, 'name'))))
                .rejects.toBeInstanceOf(EntityConflictError);
            await conversations.notes.save(conversations.notes.create(noteOf('n3', scopeId, runId, 'name', { generation: 1 })));

            await conversations.operations.save(conversations.operations.create(operationOf('o1', scopeId, runId, 'op')));
            await expect(conversations.operations.save(conversations.operations.create(operationOf('o2', scopeId, runId, 'op'))))
                .rejects.toBeInstanceOf(EntityConflictError);
            await conversations.operations.save(conversations.operations.create(operationOf('o3', scopeId, runId, 'op', { generation: 1 })));

            expect((await conversations.items.findManyBy({ scopeId })).map((item) => [item.key, item.generation])).toEqual([['user:a', 0], ['user:a', 1]]);
            expect((await conversations.notes.findManyBy({ scopeId })).map((note) => note.id)).toEqual([testUuid('n1'), testUuid('n3')]);
            expect((await conversations.operations.findManyBy({ scopeId })).map((operation) => operation.id)).toEqual([testUuid('o1'), testUuid('o3')]);
        });

        it('a child of a missing conversation or run is EntityRelationError naming both, and nothing is stored', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const scopeId = testUuid('c1');
            const missing = testUuid('missing');

            await expect(insertItem(itemOf(missing, runId, 'user:a')))
                .rejects.toMatchObject({ entity: 'conversation_item', relation: 'conversation' });
            await expect(insertItem(itemOf(scopeId, missing, 'user:a')))
                .rejects.toMatchObject({ entity: 'conversation_item', relation: 'run' });
            await expect(conversations.notes.save(conversations.notes.create(noteOf('n1', missing, runId, 'name'))))
                .rejects.toMatchObject({ entity: 'conversation_note', relation: 'conversation' });
            await expect(conversations.notes.save(conversations.notes.create(noteOf('n1', scopeId, missing, 'name'))))
                .rejects.toMatchObject({ entity: 'conversation_note', relation: 'run' });
            await expect(conversations.operations.save(conversations.operations.create(operationOf('o1', missing, runId, 'op'))))
                .rejects.toMatchObject({ entity: 'conversation_operation', relation: 'conversation' });
            await expect(conversations.operations.save(conversations.operations.create(operationOf('o1', scopeId, missing, 'op'))))
                .rejects.toMatchObject({ entity: 'conversation_operation', relation: 'run' });

            expect(await conversations.items.findManyBy({ scopeId })).toEqual([]);
            expect(await conversations.notes.findManyBy({ scopeId })).toEqual([]);
            expect(await conversations.operations.findManyBy({ scopeId })).toEqual([]);
        });

        it('runs and checkpoints reference a conversation: a missing one is EntityRelationError naming it; a referenced conversation is not removed', async () => {
            await insert(conversationOf('c1'));

            const scope = {
                id: testUuid('c1'),
                generation: 0,
                identity: conversationOf('c1').identity,
            };
            const missing = { ...scope, id: testUuid('missing') };

            await expect(runs.save(runs.create(makeRun(testUuid('run-x'), { conversation: { scope: missing, text: 'hi' } }))))
                .rejects.toMatchObject({ entity: 'run', relation: 'conversation' });
            await expect(runs.save(runs.create(makeRun(testUuid('run-y'), { conversation: { scope: { ...scope, id: KEY }, text: 'hi' } }))))
                .rejects.toMatchObject({ entity: 'run', relation: 'conversation' });
            expect(await runs.findOneById(testUuid('run-x'))).toBeNull();

            await runs.save(runs.create(makeRun(testUuid('run-a'), { conversation: { scope, text: 'hi' } })));

            const checkpoint = (scopeId: string): CheckpointRecord => ({
                id: testUuid('cp'),
                runId: testUuid('run-a'),
                stepIndex: 0,
                messages: [],
                conversation: { scopeId, generation: 0 },
                createdAt: new Date(1_000),
            });

            await expect(checkpoints.save(checkpoints.create(checkpoint(testUuid('missing')))))
                .rejects.toMatchObject({ entity: 'checkpoint', relation: 'conversation' });
            await checkpoints.save(checkpoints.create(checkpoint(testUuid('c1'))));

            const read = (await conversations.findOneById(testUuid('c1')))!;

            await expect(conversations.remove(read)).rejects.toMatchObject({ code: 'entity_relation_invalid', relation: 'conversation' });
            expect(await conversations.findOneById(testUuid('c1'))).toStrictEqual(conversationOf('c1'));
        });

        it('a conversation its children reference is not removed: EntityRelationError naming the child', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));
            await insertItem(itemOf(testUuid('c1'), runId, 'user:a'));

            await expect(conversations.remove((await conversations.findOneById(testUuid('c1')))!))
                .rejects.toMatchObject({ entity: 'conversation_item', relation: 'conversation' });
            expect(await conversations.findOneById(testUuid('c1'))).not.toBeNull();
        });

        it('notes and operations store as given; a note sorts by key in code-point order', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const scopeId = testUuid('c1');
            const expiring = noteOf('n1', scopeId, runId, 'b', { expiresAt: new Date(5_000) });
            const saved = await conversations.notes.save(conversations.notes.create(expiring));

            expect(saved).toStrictEqual(expiring);
            expect(await conversations.notes.findOneById(testUuid('n1'))).toStrictEqual(expiring);

            for (const [index, key] of ['a-b', 'a', 'a0'].entries()) {
                await conversations.notes.save(conversations.notes.create(noteOf(`k${index}`, scopeId, runId, key)));
            }

            const { data } = await conversations.notes.findMany(defineQuery({ filters: eq('scopeId', scopeId), sorts: { key: 'ASC' } }));

            expect(data.map((note) => note.key)).toEqual(['a', 'a-b', 'a0', 'b']);

            const removal = operationOf('o1', scopeId, runId, 'op-remove', { kind: 'remove', removed: false });
            const set = operationOf('o2', scopeId, runId, 'op-set');

            expect(await conversations.operations.save(conversations.operations.create(removal))).toStrictEqual(removal);
            expect(await conversations.operations.save(conversations.operations.create(set))).toStrictEqual(set);
            expect(await conversations.operations.findOneBy({
                scopeId,
                generation: 0,
                operationId: 'op-remove',
            })).toStrictEqual(removal);
            expect(await conversations.operations.findOneById(testUuid('o2'))).toStrictEqual(set);

            const read = (await conversations.notes.findOneById(testUuid('n1')))!;
            const changed = await conversations.notes.save(conversations.notes.merge(read, { text: 'changed', expiresAt: undefined }));

            expect(await conversations.notes.findOneById(testUuid('n1'))).toStrictEqual(noteOf('n1', scopeId, runId, 'b', { text: 'changed' }));
            expect({ ...changed }).toEqual(noteOf('n1', scopeId, runId, 'b', { text: 'changed' }));
        });

        it('upsertMany replaces items by storage key and resolves the next reads; removeManyBy removes by scope or by a list of keys', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const scopeId = testUuid('c1');
            const stored: ConversationItemRecord[] = [];

            for (let index = 0; index < 5; index++) {
                stored.push(await insertItem(itemOf(scopeId, runId, `k${index}`, { status: 'pending' })));
            }

            const replaced = await conversations.items.upsertMany(stored.slice(0, 3).map((item) => ({ ...item, status: 'sent' as const })));

            expect(replaced).toStrictEqual(stored.slice(0, 3).map((item) => ({ ...item, status: 'sent' })));
            expect(await conversations.items.findManyBy({ scopeId, status: 'sent' })).toStrictEqual(replaced);

            expect(await conversations.items.removeManyBy({ id: [stored[0]!.id, stored[4]!.id] })).toBe(2);
            expect((await conversations.items.findManyBy({ scopeId })).map((item) => item.key)).toEqual(['k1', 'k2', 'k3']);
            expect(await conversations.items.removeManyBy({ scopeId })).toBe(3);
            expect(await conversations.items.findManyBy({ scopeId })).toEqual([]);
        });

        it('binds the children to the transaction: their writes stay unseen outside until the commit and commit with it', async () => {
            const runId = await insertRun('run-a');
            const { promise: held, resolve: release } = Promise.withResolvers<void>();
            const { promise: ready, resolve: written } = Promise.withResolvers<void>();

            const committing = conversations.transaction(async (repository) => {
                // children referencing a conversation the same transaction stores
                await repository.save(repository.create(conversationOf('c1')));
                await repository.items.save(repository.items.create(itemOf(testUuid('c1'), runId, 'user:a') as ConversationItemRecord));
                await repository.notes.save(repository.notes.create(noteOf('n1', testUuid('c1'), runId, 'name')));
                await repository.operations.save(repository.operations.create(operationOf('o1', testUuid('c1'), runId, 'op')));
                expect(await repository.items.findManyBy({ scopeId: testUuid('c1') })).toHaveLength(1);
                written();
                await held;
            });

            await ready;
            expect(await conversations.items.findManyBy({ scopeId: testUuid('c1') })).toEqual([]);
            expect(await conversations.notes.findManyBy({ scopeId: testUuid('c1') })).toEqual([]);
            release();
            await committing;
            expect(await conversations.items.findManyBy({ scopeId: testUuid('c1') })).toHaveLength(1);
            expect(await conversations.notes.findManyBy({ scopeId: testUuid('c1') })).toHaveLength(1);
            expect(await conversations.operations.findManyBy({ scopeId: testUuid('c1') })).toHaveLength(1);
        });

        it('a rejected transaction restores the conversation and its children', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));
            await insertItem(itemOf(testUuid('c1'), runId, 'user:a'));

            await expect(conversations.transaction(async (repository) => {
                const read = (await repository.findOneById(testUuid('c1')))!;

                await repository.save(repository.merge(read, { generation: 1, activeRunId: runId }));
                await repository.items.removeManyBy({ scopeId: testUuid('c1') });
                await repository.notes.save(repository.notes.create(noteOf('n1', testUuid('c1'), runId, 'name')));
                await repository.operations.save(repository.operations.create(operationOf('o1', testUuid('c1'), runId, 'op')));

                throw new TypeError('rolled back');
            })).rejects.toThrow('rolled back');

            expect(await conversations.findOneById(testUuid('c1'))).toStrictEqual(conversationOf('c1'));
            expect(await conversations.items.findManyBy({ scopeId: testUuid('c1') })).toHaveLength(1);
            expect(await conversations.notes.findManyBy({ scopeId: testUuid('c1') })).toEqual([]);
            expect(await conversations.operations.findManyBy({ scopeId: testUuid('c1') })).toEqual([]);
        });

        it('a child repository used after its transaction ended is refused with a storage error and writes nothing', async () => {
            const runId = await insertRun('run-a');
            let escaped!: IConversationRepository;

            await insert(conversationOf('c1'));
            await conversations.transaction(async (repository) => {
                escaped = repository;
            });

            await expect(escaped.items.save(escaped.items.create(itemOf(testUuid('c1'), runId, 'user:a') as ConversationItemRecord)))
                .rejects.toMatchObject({ code: expect.stringMatching(/^(entity_deadlock|database_unavailable)$/) });
            await expect(escaped.notes.removeManyBy({ scopeId: testUuid('c1') }))
                .rejects.toMatchObject({ code: expect.stringMatching(/^(entity_deadlock|database_unavailable)$/) });
            expect(await conversations.items.findManyBy({ scopeId: testUuid('c1') })).toEqual([]);
        });

        it('a locked read of a conversation holds off another transaction\'s locked read until it ends, never the insert of a row referencing it', async () => {
            const runId = await insertRun('run-a');

            await insert(conversationOf('c1'));

            const order: string[] = [];
            const { promise: held, resolve: release } = Promise.withResolvers<void>();
            const { promise: lockedOnce, resolve: locked } = Promise.withResolvers<void>();

            const first = conversations.transaction(async (repository) => {
                await repository.findOneById(testUuid('c1'));
                locked();
                await held;

                const read = (await repository.findOneById(testUuid('c1')))!;

                await repository.save(repository.merge(read, { generation: 1 }));
                order.push('first');
            });

            await lockedOnce;

            // an item and a run referencing the locked conversation are inserted while it is held
            await insertItem(itemOf(testUuid('c1'), runId, 'user:a'));
            await runs.save(runs.create(makeRun(testUuid('run-b'), {
                conversation: {
                    scope: {
                        id: testUuid('c1'),
                        generation: 0,
                        identity: conversationOf('c1').identity,
                    },
                    text: 'hi',
                },
            })));
            order.push('inserted');

            const second = conversations.transaction(async (repository) => {
                const read = (await repository.findOneById(testUuid('c1')))!;

                order.push(`second saw ${read.generation}`);
            });

            await input.untilBlocked();
            release();
            await Promise.all([first, second]);

            expect(order).toEqual(['inserted', 'first', 'second saw 1']);
        });

        it('copies values in and out', async () => {
            const runId = await insertRun('run-a');
            const value = conversationOf('c1');

            await insert(value);
            value.identity.chat = 'mutated';

            const read = (await conversations.findOneById(testUuid('c1')))!;

            read.identity.chat = 'changed';
            expect((await conversations.findOneById(testUuid('c1')))!.identity.chat).toBe('room');

            const item = itemOf(testUuid('c1'), runId, 'assistant:a:0', { role: 'assistant', target: { channel: 'chat', address: 'room' } });
            const stored = await insertItem(item);

            item.target!.address = 'mutated';
            stored.text = 'changed';
            expect((await conversations.items.findOneBy({ id: stored.id }))?.target?.address).toBe('room');
            expect((await conversations.items.findOneBy({ key: 'assistant:a:0' }))?.text).toBe('text of assistant:a:0');
        });

        it('concurrent first saves of one key: exactly one is stored, the others are EntityConflictError', async () => {
            const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => conversations.transaction(
                (repository) => repository.save(repository.create(conversationOf(`c${i}`, { generation: i }))),
            )));
            const stored = results.filter((result) => result.status === 'fulfilled');

            expect(stored).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')
                .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);

            const row = (await conversations.findOneBy({ key: KEY }))!;

            expect(row).toStrictEqual((stored[0] as PromiseFulfilledResult<ConversationRecord>).value);
        });
    });
}
