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
} from '@rapiq/core';
import { uuidv7 } from 'uuidv7';
import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/core-kit';
import type { ConversationItem, ConversationItemRecord, ConversationScope } from '@chamvi/core-kit';
import type { IConversationRepository } from '@chamvi/store';
import { readItem } from '../helpers.ts';
import { assertConversationScope, assertPage, itemBytes } from '../persistence/module.ts';
import type { ConversationFindOptions, ConversationServiceContext } from '../types.ts';

export async function findConversationItems(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    query: ConversationFindOptions,
): Promise<{ data: ConversationItem[]; total: number }> {
    assertConversationScope(scope);
    assertPage(query);

    const { data, meta } = await ctx.repository.items.findMany(defineQuery({
        filters: and(eq('scopeId', scope.id), eq('generation', scope.generation)),
        sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
        pagination: { limit: query.limit, offset: query.offset },
    }));

    return { data: data.map((item) => readItem(item)), total: meta.total };
}

/**
 * A new item of the handed-in repository with a new uuid v7 `id` and its
 * stored byte length: every item the service stores is created here, so
 * `bytes` is always the size the recall budgets its text with. The store
 * assigns its `sequence`.
 */
export function createConversationItem(
    repository: IConversationRepository,
    value: Omit<ConversationItemRecord, 'id' | 'sequence' | 'bytes'>,
): ConversationItemRecord {
    return repository.items.create({
        ...value,
        id: uuidv7(),
        bytes: itemBytes(value.text),
    });
}
