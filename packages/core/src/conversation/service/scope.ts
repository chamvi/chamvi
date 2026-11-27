/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import { EntityConflictError } from '@chamvi/store';
import type { ConversationIdentity, ConversationRecord, ConversationScope } from '@chamvi/core-kit';
import { RepositoryNotFoundError } from '../../errors/index.ts';
import { readScope } from '../helpers.ts';
import { assertConversationScope, identityId } from '../persistence/module.ts';
import type { ConversationServiceContext } from '../types.ts';
import { conversationStaleError } from './errors.ts';

export async function resolveConversationScope(
    ctx: ConversationServiceContext,
    identity: ConversationIdentity,
): Promise<ConversationScope> {
    const key = identityId(identity);
    const existing = await ctx.repository.findOneBy({ key });

    if (existing) {
        return readScope(existing);
    }

    try {
        const created = await ctx.repository.transaction((repository) => repository.save(repository.create({
            id: uuidv7(),
            key,
            identity: {
                agent: identity.agent,
                channel: identity.channel,
                account: identity.account,
                chat: identity.chat,
                audience: identity.audience,
            },
            generation: 0,
        })));

        return readScope(created);
    } catch (error) {
        if (!(error instanceof EntityConflictError)) {
            throw error;
        }
    }

    // created concurrently: the stored row wins
    const stored = await ctx.repository.findOneBy({ key });

    if (!stored) {
        throw new RepositoryNotFoundError('conversations');
    }

    return readScope(stored);
}

export async function findConversationScope(
    ctx: ConversationServiceContext,
    identity: ConversationIdentity,
): Promise<ConversationScope | undefined> {
    const record = await ctx.repository.findOneBy({ key: identityId(identity) });

    return record ? readScope(record) : undefined;
}

export async function findActiveConversationRun(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
): Promise<string | undefined> {
    assertConversationScope(scope);

    const record = await ctx.repository.findOneById(scope.id);

    return record?.generation === scope.generation ? record.activeRunId : undefined;
}

/** The row of the scope's current generation, else the stale-scope refusal. */
export function requireCurrentConversation(scope: ConversationScope, record: ConversationRecord | null): ConversationRecord {
    if (!record || record.generation !== scope.generation) {
        throw conversationStaleError();
    }

    return record;
}
