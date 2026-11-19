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
    gt,
    lte,
    ne,
} from '@rapiq/core';
import type { ICondition } from '@rapiq/core';
import { isObject } from 'smob';
import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/store';
import type { ConversationIdentity, ConversationScope, IConversationRepository } from '@chamvi/store';
import { InvalidRunStateError, ValidationError } from '../../errors/index.ts';
import { isNoteActive, readScope } from '../helpers.ts';
import { identityId } from '../persistence/module.ts';
import type { ConversationServiceContext, ResolvedConversationLimits } from '../types.ts';
import { dropExpiredConversationNotes } from './notes.ts';
import { resolveConversationScope } from './scope.ts';

/** Rows a trim or a prune reads per page before it removes them. */
const TRIM_PAGE = 100;

export async function resetConversation(
    ctx: ConversationServiceContext,
    identity: ConversationIdentity,
    options: { keepNotes: boolean },
): Promise<ConversationScope> {
    if (!isObject(options) || typeof options.keepNotes !== 'boolean') {
        throw new ValidationError('The reset options need keepNotes as a boolean.');
    }

    const scope = await resolveConversationScope(ctx, identity);

    return ctx.repository.transaction(async (repository) => {
        const record = await repository.findOneById(scope.id);

        if (!record || record.activeRunId !== undefined) {
            throw new InvalidRunStateError('The conversation has an active turn and cannot be reset.');
        }

        const now = new Date(ctx.clock.now());
        const generation = record.generation + 1;
        const saved = await repository.save(repository.merge(record, {
            generation,
            activeRunId: undefined,
            snapshot: undefined,
        }));

        if (options.keepNotes) {
            // at most CONVERSATION_NOTES_MAX live notes and those expired since the last write
            const notes = await repository.notes.findManyBy({ scopeId: record.id });
            const expired = notes.filter((note) => !isNoteActive(note, now));
            const live = notes.filter((note) => isNoteActive(note, now));

            if (expired.length > 0) {
                await repository.notes.removeManyBy({ id: expired.map((note) => note.id) });
            }

            if (live.length > 0) {
                await repository.notes.upsertMany(live.map((note) => ({ ...note, generation })));
            }
        } else {
            await repository.notes.removeManyBy({ scopeId: record.id });
            await repository.operations.removeManyBy({ scopeId: record.id });
        }

        return readScope(saved);
    });
}

export async function deleteConversation(ctx: ConversationServiceContext, identity: ConversationIdentity): Promise<void> {
    const key = identityId(identity);

    await ctx.repository.transaction(async (repository) => {
        const record = await repository.findOneBy({ key });

        if (!record) {
            return;
        }

        if (record.activeRunId !== undefined) {
            throw new InvalidRunStateError('The conversation has an active turn and cannot be deleted.');
        }

        await repository.save(repository.merge(record, {
            generation: record.generation + 1,
            activeRunId: undefined,
            snapshot: undefined,
        }));
        await repository.items.removeManyBy({ scopeId: record.id });
        await repository.notes.removeManyBy({ scopeId: record.id });
        await repository.operations.removeManyBy({ scopeId: record.id });
    });
}

export async function pruneConversations(
    ctx: ConversationServiceContext,
    limits: ResolvedConversationLimits,
    options: { isSettled?: (runId: string) => Promise<boolean> } = {},
): Promise<void> {
    const { isSettled } = options;
    const settled = new Map<string, boolean>();
    let failure: { error: unknown } | undefined;
    let after: string | undefined;

    for (;;) {
        const { data: page } = await ctx.repository.findMany(defineQuery({
            ...(after === undefined ? {} : { filters: gt('id', after) }),
            sorts: { id: 'ASC' },
            pagination: { limit: TRIM_PAGE },
        }));

        if (page.length === 0) {
            break;
        }

        for (const conversation of page) {
            await trimConversation(ctx, conversation.id, limits);

            if (isSettled) {
                const error = await pruneConversationOperations(ctx, conversation.id, limits, isSettled, settled);

                failure ??= error;
            }
        }

        after = page[page.length - 1]!.id;
    }

    if (failure) {
        throw failure.error;
    }
}

/** The trims of prune on one conversation, under its row lock. */
async function trimConversation(ctx: ConversationServiceContext, id: string, limits: ResolvedConversationLimits): Promise<void> {
    await ctx.repository.transaction(async (repository) => {
        const record = await repository.findOneById(id);

        if (!record) {
            return;
        }

        const now = new Date(ctx.clock.now());

        await trimExpiredConversationItems(repository, record.id, record.activeRunId, limits, now);

        for (const generation of await findConversationItemGenerations(repository, record.id)) {
            await trimConversationItemCount(repository, record.id, generation, record.activeRunId, limits.maxStoredItems);
        }

        await dropExpiredConversationNotes(repository, record.id, now);
    });
}

/**
 * The note operation records of one conversation that prune removes:
 * candidates in pages read without a transaction, `isSettled` asked
 * outside any transaction, then removed under the row lock after a
 * re-check. Resolves the first failure of `isSettled`, if any.
 */
async function pruneConversationOperations(
    ctx: ConversationServiceContext,
    id: string,
    limits: ResolvedConversationLimits,
    isSettled: (runId: string) => Promise<boolean>,
    settled: Map<string, boolean>,
): Promise<{ error: unknown } | undefined> {
    let failure: { error: unknown } | undefined;
    let after: string | undefined;

    for (;;) {
        const record = await ctx.repository.findOneById(id);

        if (!record) {
            return failure;
        }

        const before = new Date(ctx.clock.now() - limits.retentionMs);
        const conditions: ICondition[] = [eq('scopeId', id), lte('createdAt', before)];

        if (record.activeRunId !== undefined) {
            conditions.push(ne('runId', record.activeRunId));
        }

        if (after !== undefined) {
            conditions.push(gt('id', after));
        }

        const { data: candidates } = await ctx.repository.operations.findMany(defineQuery({
            filters: and(...conditions),
            sorts: { id: 'ASC' },
            pagination: { limit: TRIM_PAGE },
        }));

        if (candidates.length === 0) {
            return failure;
        }

        after = candidates[candidates.length - 1]!.id;

        const removable: string[] = [];

        // no transaction is held while the classifier runs: it may need the same storage
        for (const candidate of candidates) {
            if (!settled.has(candidate.runId)) {
                try {
                    settled.set(candidate.runId, await isSettled(candidate.runId));
                } catch (error) {
                    failure ??= { error };

                    continue;
                }
            }

            if (settled.get(candidate.runId)) {
                removable.push(candidate.id);
            }
        }

        if (removable.length === 0) {
            continue;
        }

        await ctx.repository.transaction(async (repository) => {
            const current = await repository.findOneById(id);

            if (!current) {
                return;
            }

            const threshold = ctx.clock.now() - limits.retentionMs;
            // re-read under the row lock: a record may have gone or changed, or its run become active again
            const stale = (await repository.operations.findManyBy({ id: removable }))
                .filter((operation) => settled.get(operation.runId) === true &&
                    operation.runId !== current.activeRunId &&
                    operation.createdAt.getTime() <= threshold);

            if (stale.length > 0) {
                await repository.operations.removeManyBy({ id: stale.map((operation) => operation.id) });
            }
        });
    }
}

/** Removes the scope's items past retention, of every generation, never the spared run's. */
export async function trimExpiredConversationItems(
    repository: IConversationRepository,
    scopeId: string,
    spared: string | undefined,
    limits: ResolvedConversationLimits,
    now: Date,
): Promise<void> {
    const before = new Date(now.getTime() - limits.retentionMs);
    const conditions: ICondition[] = [eq('scopeId', scopeId), lte('createdAt', before)];

    if (spared !== undefined) {
        conditions.push(ne('runId', spared));
    }

    await removeConversationItemPages(repository, conditions, Infinity);
}

/** Keeps a generation's newest `max` items: removes the oldest beyond it, never the spared run's. */
export async function trimConversationItemCount(
    repository: IConversationRepository,
    scopeId: string,
    generation: number,
    spared: string | undefined,
    max: number,
): Promise<void> {
    const { meta } = await repository.items.findMany(defineQuery({
        fields: [CONVERSATION_ITEM_STORED_ORDER],
        filters: and(eq('scopeId', scopeId), eq('generation', generation)),
        pagination: { limit: 1 },
    }));
    const excess = meta.total - max;

    if (excess <= 0) {
        return;
    }

    const conditions: ICondition[] = [eq('scopeId', scopeId), eq('generation', generation)];

    if (spared !== undefined) {
        conditions.push(ne('runId', spared));
    }

    await removeConversationItemPages(repository, conditions, excess);
}

/** Removes up to `count` of the oldest items matching the conditions, a page of ids at a time. */
async function removeConversationItemPages(repository: IConversationRepository, conditions: ICondition[], count: number): Promise<void> {
    let left = count;

    while (left > 0) {
        const { data } = await repository.items.findMany(defineQuery({
            fields: [CONVERSATION_ITEM_STORED_ORDER],
            filters: and(...conditions),
            sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
            pagination: { limit: Math.min(left, TRIM_PAGE) },
        }));

        if (data.length === 0) {
            return;
        }

        await repository.items.removeManyBy({ id: data.map((item) => item.id) });
        left -= data.length;

        if (data.length < TRIM_PAGE) {
            return;
        }
    }
}

/** The generations the scope holds items of, ascending: one read per generation. */
async function findConversationItemGenerations(repository: IConversationRepository, scopeId: string): Promise<number[]> {
    const generations: number[] = [];

    for (;;) {
        const last = generations.at(-1);
        const { data } = await repository.items.findMany(defineQuery({
            fields: ['generation'],
            filters: last === undefined ? eq('scopeId', scopeId) : and(eq('scopeId', scopeId), gt('generation', last)),
            sorts: { generation: 'ASC' },
            pagination: { limit: 1 },
        }));

        if (data.length === 0) {
            return generations;
        }

        generations.push(data[0]!.generation);
    }
}
