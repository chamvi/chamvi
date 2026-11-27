/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import {
    and,
    defineQuery,
    eq,
    lt,
} from '@rapiq/core';
import { expect, it } from 'vitest';
import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/core-kit';
import type { CheckpointRecord, ConversationItemRecord } from '@chamvi/core-kit';
import { makeRun, testUuid } from '../fixture/helpers.ts';
import type { ConversationContractContext } from './context.ts';
import { KEY } from './constants.ts';
import {
    conversationOf,
    itemOf,
    noteOf,
    operationOf,
} from './helpers.ts';

/** The item, note and operation cases of the conversation contract, and the references between conversations, runs and checkpoints. */
export function registerConversationChildCases(context: ConversationContractContext): void {
    it('items get storage keys in the order they are stored; a sort by CONVERSATION_ITEM_STORED_ORDER is the transcript order', async () => {
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

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
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

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
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

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
        const {
            conversations,
            runs,
            checkpoints,
            insert,
        } = context;

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
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

        const runId = await insertRun('run-a');

        await insert(conversationOf('c1'));
        await insertItem(itemOf(testUuid('c1'), runId, 'user:a'));

        await expect(conversations.remove((await conversations.findOneById(testUuid('c1')))!))
            .rejects.toMatchObject({ entity: 'conversation_item', relation: 'conversation' });
        expect(await conversations.findOneById(testUuid('c1'))).not.toBeNull();
    });

    it('notes and operations store as given; a note sorts by key in code-point order', async () => {
        const {
            conversations,
            insert,
            insertRun,
        } = context;

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
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

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
}
