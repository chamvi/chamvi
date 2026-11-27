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
    lte,
} from '@rapiq/core';
import { isObject } from 'smob';
import { uuidv7 } from 'uuidv7';
import type { IConversationRepository } from '@chamvi/store';
import type { 
    ConversationNote, 
    ConversationNoteOperation, 
    ConversationOperationRecord, 
    ConversationScope, 
} from '@chamvi/core-kit';
import { CONVERSATION_NOTES_MAX } from '../constants.ts';
import {
    compareNotes,
    isNoteActive,
    readNote,
    resultOf,
} from '../helpers.ts';
import {
    assertConversationScope,
    assertNoteOperationContent,
    assertNoteOperationShape,
    assertPage,
} from '../persistence/module.ts';
import type { ConversationFindOptions, ConversationNoteResult, ConversationServiceContext } from '../types.ts';
import { conversationOwnerError } from './errors.ts';
import { requireCurrentConversation } from './scope.ts';

export async function findConversationNotes(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    query: ConversationFindOptions,
): Promise<{ data: ConversationNote[]; total: number }> {
    assertConversationScope(scope);
    assertPage(query);

    const notes = await findLiveConversationNotes(ctx, scope);

    return { data: notes.slice(query.offset, query.offset + query.limit), total: notes.length };
}

export async function findConversationNote(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    key: string,
): Promise<ConversationNote | undefined> {
    assertConversationScope(scope);

    if (typeof key !== 'string') {
        return undefined;
    }

    const record = await ctx.repository.findOneById(scope.id);

    if (!record || record.generation !== scope.generation) {
        return undefined;
    }

    const note = await ctx.repository.notes.findOneBy({
        scopeId: record.id,
        generation: record.generation,
        key,
    });

    return note && isNoteActive(note, new Date(ctx.clock.now())) ? readNote(note) : undefined;
}

export async function applyConversationNote(
    ctx: ConversationServiceContext,
    scope: ConversationScope,
    operation: ConversationNoteOperation,
): Promise<ConversationNoteResult> {
    assertConversationScope(scope);

    return ctx.repository.transaction(async (repository) => {
        const record = requireCurrentConversation(scope, await repository.findOneById(scope.id));
        const runId = isObject(operation) && isObject(operation.source) ? operation.source.runId : undefined;

        // ownership before any write or replay
        if (record.activeRunId === undefined || runId !== record.activeRunId) {
            throw conversationOwnerError();
        }

        assertNoteOperationShape(operation);

        const where = { scopeId: record.id, generation: record.generation };
        const recorded = await repository.operations.findOneBy({ ...where, operationId: operation.id });

        if (recorded) {
            if (recorded.inputHash !== operation.inputHash || recorded.runId !== operation.source.runId) {
                throw new ValidationError('The note operation was already applied with another input.');
            }

            return resultOf(recorded);
        }

        const now = new Date(ctx.clock.now());

        assertNoteOperationContent(operation, now);
        await dropExpiredConversationNotes(repository, record.id, now);

        const prior = await repository.notes.findOneBy({ ...where, key: operation.key });
        let result: ConversationNoteResult;

        if (operation.kind === 'set') {
            if (!prior && (await repository.notes.findManyBy(where)).length >= CONVERSATION_NOTES_MAX) {
                throw new ValidationError(`A conversation holds at most ${CONVERSATION_NOTES_MAX} notes.`);
            }

            const values = {
                text: operation.text,
                updatedAt: now,
                source: {
                    runId: operation.source.runId,
                    toolCallId: operation.source.toolCallId,
                    stepIndex: operation.source.stepIndex,
                },
                expiresAt: operation.expiresAt === undefined ? undefined : new Date(operation.expiresAt.getTime()),
            };

            await repository.notes.save(prior ?
                repository.notes.merge(prior, values) :
                repository.notes.create({
                    id: uuidv7(),
                    ...where,
                    key: operation.key,
                    createdAt: now,
                    ...values,
                }));

            result = {
                kind: 'set',
                key: operation.key,
                updatedAt: now,
            };
        } else {
            if (prior) {
                await repository.notes.remove(prior);
            }

            result = {
                kind: 'remove',
                key: operation.key,
                removed: prior !== null,
            };
        }

        const stored: ConversationOperationRecord = {
            id: uuidv7(),
            ...where,
            operationId: operation.id,
            runId: operation.source.runId,
            inputHash: operation.inputHash,
            kind: result.kind,
            key: result.key,
            createdAt: now,
        };

        if (result.kind === 'remove') {
            stored.removed = result.removed;
        }

        await repository.operations.save(repository.operations.create(stored));

        return result;
    });
}

/** Removes the scope's expired notes (at most the live limit and those expired since the last write). */
export async function dropExpiredConversationNotes(repository: IConversationRepository, scopeId: string, now: Date): Promise<void> {
    const { data } = await repository.notes.findMany(defineQuery({
        fields: ['id'],
        filters: and(eq('scopeId', scopeId), lte('expiresAt', now)),
    }));

    if (data.length > 0) {
        await repository.notes.removeManyBy({ id: data.map((note) => note.id) });
    }
}

/** The current generation's live notes, by key in code-point order. */
async function findLiveConversationNotes(ctx: ConversationServiceContext, scope: ConversationScope): Promise<ConversationNote[]> {
    const record = await ctx.repository.findOneById(scope.id);

    if (!record || record.generation !== scope.generation) {
        return [];
    }

    const now = new Date(ctx.clock.now());

    return (await ctx.repository.notes.findManyBy({ scopeId: record.id, generation: record.generation }))
        .filter((note) => isNoteActive(note, now))
        .map((note) => readNote(note))
        .sort(compareNotes);
}
