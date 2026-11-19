/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { expect, it } from 'vitest';
import type { ConversationItemRecord, IConversationRepository } from '@chamvi/store';
import { makeRun, testUuid } from '../fixture/helpers.ts';
import type { ConversationRepositoryContractInput } from './types.ts';
import type { ConversationContractContext } from './context.ts';
import {
    conversationOf,
    itemOf,
    noteOf,
    operationOf,
} from './helpers.ts';

/** The transaction and row lock cases of the conversation contract. */
export function registerConversationTransactionCases(context: ConversationContractContext, input: ConversationRepositoryContractInput): void {
    it('binds the children to the transaction: their writes stay unseen outside until the commit and commit with it', async () => {
        const { conversations, insertRun } = context;

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
        const {
            conversations,
            insert,
            insertRun,
            insertItem,
        } = context;

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
        const {
            conversations,
            insert,
            insertRun,
        } = context;

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
        const {
            conversations,
            runs,
            insert,
            insertRun,
            insertItem,
        } = context;

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
}
