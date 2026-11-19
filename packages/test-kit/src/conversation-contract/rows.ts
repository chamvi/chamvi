/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { expect, it } from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import { testUuid } from '../fixture/helpers.ts';
import type { ConversationContractContext } from './context.ts';
import { KEY } from './constants.ts';
import { conversationOf } from './helpers.ts';

/** The conversation row cases of the conversation contract. */
export function registerConversationRowCases(context: ConversationContractContext): void {
    it('stores a conversation as given, reads it back by key and by id, and resolves from save what the next read returns', async () => {
        const { conversations, insert } = context;

        const saved = await insert(conversationOf('c1'));

        expect(saved).toStrictEqual(conversationOf('c1'));
        expect(await conversations.findOneBy({ key: KEY })).toStrictEqual(saved);
        expect(await conversations.findOneById(testUuid('c1'))).toStrictEqual(saved);
        expect(await conversations.findOneBy({ key: 'b'.repeat(64) })).toBeNull();
        expect(await conversations.findOneById('not-a-uuid')).toBeNull();
    });

    it('save of a read conversation writes the turn and its snapshot, then clears them, each save resolving the next read', async () => {
        const {
            conversations,
            insert,
            insertRun,
        } = context;

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
        const { conversations, insert } = context;

        await insert(conversationOf('c1'));

        await expect(insert(conversationOf('c2', { generation: 5 }))).rejects.toBeInstanceOf(EntityConflictError);
        expect(await conversations.findOneBy({ key: KEY })).toStrictEqual(conversationOf('c1'));
        expect(await conversations.findOneById(testUuid('c2'))).toBeNull();
    });

    it('an active run that does not exist is EntityRelationError naming the run, and nothing is stored', async () => {
        const { conversations, insert } = context;

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
}
