/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import { expect, it } from 'vitest';
import type { ConversationRecord } from '@chamvi/core-kit';
import { testUuid } from '../fixture/helpers.ts';
import type { ConversationContractContext } from './context.ts';
import { KEY } from './constants.ts';
import { conversationOf, itemOf } from './helpers.ts';

/** The copy and concurrent first save cases of the conversation contract. */
export function registerConversationCopyCases(context: ConversationContractContext): void {
    it('copies values in and out', async () => {
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

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
        const { conversations } = context;

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
}
