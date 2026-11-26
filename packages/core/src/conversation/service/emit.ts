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
} from '@rapiq/core';
import { isObject } from 'smob';
import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/store';
import type { ConversationItem, ConversationItemRecord, ConversationScope } from '@chamvi/store';
import { readItem } from '../helpers.ts';
import {
    assertConversationScope,
    assertEmitItem,
    assertRunId,
    isSameEmit,
} from '../persistence/module.ts';
import type { ConversationServiceContext } from '../types.ts';
import { conversationOwnerError } from './errors.ts';
import { createConversationItem } from './items.ts';
import { requireCurrentConversation } from './scope.ts';

export async function prepareConversationEmit(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    item: ConversationItem,
): Promise<void> {
    assertConversationScope(scope);

    await ctx.repository.transaction(async (repository) => {
        const record = requireCurrentConversation(scope, await repository.findOneById(scope.id));

        if (!isObject(item) || record.activeRunId === undefined || item.runId !== record.activeRunId) {
            throw conversationOwnerError();
        }

        assertEmitItem(item);

        const where = { scopeId: record.id, generation: record.generation };
        const stored = await repository.items.findOneBy({ ...where, key: item.id });

        if (stored) {
            if (!isSameEmit(readItem(stored), item)) {
                throw new ValidationError('A conversation item of this id exists with other content.');
            }

            return;
        }

        const value: Omit<ConversationItemRecord, 'id' | 'bytes'> = {
            ...where,
            key: item.id,
            role: 'assistant',
            text: item.text,
            runId: item.runId,
            createdAt: new Date(ctx.clock.now()),
            status: 'pending',
        };

        if (item.effectKey !== undefined) {
            value.effectKey = item.effectKey;
        }

        if (item.target !== undefined) {
            value.target = { channel: item.target.channel, address: item.target.address };
        }

        await repository.items.save(createConversationItem(repository, value));
    });
}

export async function confirmConversationEmit(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    itemId: string,
): Promise<void> {
    assertConversationScope(scope);

    await ctx.repository.transaction(async (repository) => {
        const record = requireCurrentConversation(scope, await repository.findOneById(scope.id));
        const item = typeof itemId === 'string' ?
            await repository.items.findOneBy({
                scopeId: record.id,
                generation: record.generation,
                key: itemId,
            }) :
            null;

        if (!item || record.activeRunId === undefined || item.runId !== record.activeRunId) {
            throw conversationOwnerError();
        }

        if (item.status === 'pending') {
            await repository.items.save(repository.items.merge(item, { status: 'sent' }));
        }
    });
}

export async function findPendingConversationEmits(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    runId: string,
): Promise<ConversationItem[]> {
    assertConversationScope(scope);
    assertRunId(runId);

    const { data } = await ctx.repository.items.findMany(defineQuery({
        filters: and(
            eq('scopeId', scope.id),
            eq('generation', scope.generation),
            eq('runId', runId),
            eq('status', 'pending'),
        ),
        sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
    }));

    return data.map((item) => readItem(item));
}
