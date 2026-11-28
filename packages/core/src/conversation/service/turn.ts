/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityRelationError, ValidationError } from '@chamvi/errors';
import {
    and,
    defineQuery,
    eq,
    lt,
} from '@rapiq/core';
import type { ICondition } from '@rapiq/core';
import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/core-kit';
import type {
    ConversationItemRecord,
    ConversationRecord,
    ConversationScope,
    ConversationSnapshot,
} from '@chamvi/core-kit';
import type { IConversationRepository } from '@chamvi/store';
import { InvalidRunStateError, RunNotFoundError } from '../../errors/index.ts';
import { CONVERSATION_LIMITS_MAX } from '../constants.ts';
import {
    isNoteActive,
    readItem,
    readNote,
    readScope,
} from '../helpers.ts';
import {
    assertConversationScope,
    assertConversationText,
    assertRunId,
    buildSnapshotContent,
    selectRecent,
    userItemId,
} from '../persistence/module.ts';
import type { BeginTurnResult, ConversationServiceContext, ResolvedConversationLimits } from '../types.ts';
import { createConversationItem } from './items.ts';
import { dropExpiredConversationNotes } from './notes.ts';
import { trimConversationItemCount, trimExpiredConversationItems } from './retention.ts';

/**
 * Item sizes (ids and byte lengths, no text) the first recall page reads,
 * newest first: a short transcript or a budget used by recent items needs
 * no more.
 */
const RECALL_FIRST_PAGE = 100;

/** Item sizes every later recall page reads: a generation holds at most about this many items. */
const RECALL_PAGE = CONVERSATION_LIMITS_MAX.maxStoredItems;

export async function beginConversationTurn(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    runId: string,
    text: string,
    limits: ResolvedConversationLimits,
): Promise<BeginTurnResult> {
    assertConversationScope(scope);
    assertRunId(runId);
    assertConversationText(text, CONVERSATION_LIMITS_MAX.maxItemBytes);

    try {
        return await ctx.repository.transaction(async (repository) => {
            const record = await repository.findOneById(scope.id);

            if (!record || record.generation !== scope.generation) {
                return { kind: 'stale' };
            }

            if (record.activeRunId === runId && record.snapshot) {
                return { kind: 'ready', snapshot: readConversationSnapshot(record, runId) };
            }

            assertConversationText(text, limits.maxItemBytes);

            if (record.activeRunId !== undefined && record.activeRunId !== runId) {
                return { kind: 'busy', runId: record.activeRunId };
            }

            const where = { scopeId: record.id, generation: record.generation };

            if (await repository.items.findOneBy({ ...where, key: userItemId(runId) })) {
                throw new InvalidRunStateError('The conversation turn has already ended.');
            }

            const now = new Date(ctx.clock.now());

            await trimExpiredConversationItems(repository, record.id, runId, limits, now);
            await dropExpiredConversationNotes(repository, record.id, now);

            const content = await recallConversation(repository, record, limits, now);

            await repository.items.save(createConversationItem(repository, {
                ...where,
                key: userItemId(runId),
                role: 'user',
                text,
                runId,
                createdAt: now,
                status: 'sent',
            }));

            const saved = await repository.save(repository.merge(record, {
                activeRunId: runId,
                snapshot: { ...content, createdAt: now },
            }));

            await trimConversationItemCount(repository, record.id, record.generation, runId, limits.maxStoredItems);

            return { kind: 'ready', snapshot: readConversationSnapshot(saved, runId) };
        });
    } catch (error) {
        if (error instanceof EntityRelationError && error.relation === 'run') {
            throw new RunNotFoundError(runId);
        }

        throw error;
    }
}

export async function endConversationTurn(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    runId: string,
    confirmedEmitIds: string[],
): Promise<void> {
    assertConversationScope(scope);
    assertRunId(runId);

    const valid = Array.isArray(confirmedEmitIds) && confirmedEmitIds.every((id) => typeof id === 'string');

    if (!valid) {
        throw new ValidationError('The confirmed emit ids must be an array of strings.');
    }

    const confirmed = new Set(confirmedEmitIds);

    await ctx.repository.transaction(async (repository) => {
        const record = await repository.findOneById(scope.id);

        // only the owner of the current generation ends its turn; anything else is a no-op
        if (!record || record.generation !== scope.generation || record.activeRunId !== runId) {
            return;
        }

        const pending = await repository.items.findManyBy({
            scopeId: record.id,
            generation: record.generation,
            runId,
            status: 'pending',
        });

        if (pending.length > 0) {
            await repository.items.upsertMany(pending.map((item) => ({
                ...item,
                status: confirmed.has(item.key) ? 'sent' : 'unknown',
            })));
        }

        await repository.save(repository.merge(record, { activeRunId: undefined, snapshot: undefined }));
    });
}

/**
 * The recall of a turn: the generation's sent items newest first, read
 * as sizes only (ids and stored byte lengths, no text), a page of
 * RECALL_FIRST_PAGE, then pages of RECALL_PAGE; each item taken whole
 * while it fits the remaining maxHistoryBytes (an item that does not
 * fit is skipped and older, smaller ones are still taken), until
 * maxItems or the byte budget is used (`selectRecent`); then the text
 * of the selected items in one read, the snapshot built by
 * `buildSnapshotContent` with the live notes, and `omitted` the sent
 * items not taken.
 */
async function recallConversation(
    repository: IConversationRepository,
    record: ConversationRecord,
    limits: ResolvedConversationLimits,
    now: Date,
): Promise<Omit<ConversationSnapshot, 'scope' | 'runId' | 'createdAt'>> {
    const where = { scopeId: record.id, generation: record.generation };
    let chosen: Pick<ConversationItemRecord, 'id' | 'sequence' | 'bytes'>[] = [];
    let bytes = 0;
    let seen = 0;
    let total: number | undefined;
    let before: number | undefined;

    while (chosen.length < limits.maxItems && bytes < limits.maxHistoryBytes) {
        const conditions: ICondition[] = [
            eq('scopeId', where.scopeId),
            eq('generation', where.generation),
            eq('status', 'sent'),
        ];

        if (before !== undefined) {
            conditions.push(lt(CONVERSATION_ITEM_STORED_ORDER, before));
        }

        const limit = before === undefined ? RECALL_FIRST_PAGE : RECALL_PAGE;
        const { data, meta } = await repository.items.findMany(defineQuery({
            fields: ['id', CONVERSATION_ITEM_STORED_ORDER, 'bytes'],
            filters: and(...conditions),
            sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'DESC' },
            pagination: { limit },
        }));

        total ??= meta.total;

        if (data.length === 0) {
            break;
        }

        before = data[data.length - 1]!.sequence;
        seen += data.length;

        // newer chosen items keep their priority: the page is older than every chosen item
        chosen = selectRecent([...data.reverse(), ...chosen], (item) => item.bytes, limits);
        bytes = chosen.reduce((sum, item) => sum + item.bytes, 0);

        // a short page, or every sent item counted by the first page seen
        if (data.length < limit || seen >= total) {
            break;
        }
    }

    // the text of the selected items only, in transcript order
    const order = new Map(chosen.map((item, index) => [item.id, index]));
    const items = chosen.length === 0 ?
        [] :
        (await repository.items.findManyBy({ ...where, id: chosen.map((item) => item.id) }))
            .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
            .map((item) => readItem(item));
    const notes = (await repository.notes.findManyBy(where))
        .filter((note) => isNoteActive(note, now))
        .map((note) => readNote(note));
    const content = buildSnapshotContent(items, notes, limits);

    return { ...content, omitted: (total ?? 0) - content.itemIds.length };
}

function readConversationSnapshot(record: ConversationRecord, runId: string): ConversationSnapshot {
    const snapshot = record.snapshot!;

    return {
        scope: readScope(record),
        runId,
        messages: structuredClone(snapshot.messages),
        itemIds: [...snapshot.itemIds],
        noteKeys: [...snapshot.noteKeys],
        createdAt: new Date(snapshot.createdAt.getTime()),
        omitted: snapshot.omitted,
    };
}
