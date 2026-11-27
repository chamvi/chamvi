/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ConversationIdentity,
    ConversationItem,
    ConversationNote,
    ConversationNoteOperation,
    ConversationScope,
} from '@chamvi/core-kit';
import { RepositoryNotFoundError } from '../../errors/index.ts';
import type {
    BeginTurnResult,
    ConversationFindOptions,
    ConversationNoteResult,
    ConversationServiceContext,
    IConversationService,
    ResolvedConversationLimits,
} from '../types.ts';
import { confirmConversationEmit, findPendingConversationEmits, prepareConversationEmit } from './emit.ts';
import { findConversationItems } from './items.ts';
import { applyConversationNote, findConversationNote, findConversationNotes } from './notes.ts';
import { deleteConversation, pruneConversations, resetConversation } from './retention.ts';
import { findActiveConversationRun, findConversationScope, resolveConversationScope } from './scope.ts';
import { beginConversationTurn, endConversationTurn } from './turn.ts';

/**
 * Conversations, their transcripts, notes and note operations over an
 * `IConversationRepository`, with every conversation rule in one place:
 * stale scopes, one active turn per scope generation, the turn's frozen
 * snapshot, emit preparation and confirmation, note limits and replays,
 * reset and delete, retention and trimming, and the history recall.
 *
 * A change runs in one transaction: the conversation row read locked
 * first, then the clock, then the writes through the handed-in repository
 * and its `items`, `notes` and `operations`. Multi-row child writes use
 * the port's batched operations. Values are copied in and out, every date
 * and expiry comes from the clock, and no refusal carries stored content.
 */
export class ConversationService implements IConversationService {
    protected context: ConversationServiceContext;

    constructor(ctx: ConversationServiceContext) {
        this.context = { repository: ctx.repository, clock: ctx.clock };
    }

    async resolve(identity: ConversationIdentity): Promise<ConversationScope> {
        return resolveConversationScope(this.context, identity);
    }

    async findOne(identity: ConversationIdentity): Promise<ConversationScope | undefined> {
        return findConversationScope(this.context, identity);
    }

    async findOneOrFail(identity: ConversationIdentity): Promise<ConversationScope> {
        const result = await this.findOne(identity);

        if (result === undefined) {
            throw new RepositoryNotFoundError('conversations');
        }

        return result;
    }

    async activeRun(scope: ConversationScope): Promise<string | undefined> {
        return findActiveConversationRun(this.context, scope);
    }

    async beginTurn(
        scope: ConversationScope,
        runId: string,
        text: string,
        limits: ResolvedConversationLimits,
    ): Promise<BeginTurnResult> {
        return beginConversationTurn(this.context, scope, runId, text, limits);
    }

    async endTurn(scope: ConversationScope, runId: string, confirmedEmitIds: string[]): Promise<void> {
        return endConversationTurn(this.context, scope, runId, confirmedEmitIds);
    }

    async prepareEmit(scope: ConversationScope, item: ConversationItem): Promise<void> {
        return prepareConversationEmit(this.context, scope, item);
    }

    async confirmEmit(scope: ConversationScope, itemId: string): Promise<void> {
        return confirmConversationEmit(this.context, scope, itemId);
    }

    async pendingEmits(scope: ConversationScope, runId: string): Promise<ConversationItem[]> {
        return findPendingConversationEmits(this.context, scope, runId);
    }

    async findItems(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationItem[]; total: number }> {
        return findConversationItems(this.context, scope, query);
    }

    async findItemsOrFail(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationItem[]; total: number }> {
        const result = await this.findItems(scope, query);

        if (result.data.length === 0) {
            throw new RepositoryNotFoundError('conversation items');
        }

        return result;
    }

    async findNotes(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationNote[]; total: number }> {
        return findConversationNotes(this.context, scope, query);
    }

    async findNotesOrFail(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationNote[]; total: number }> {
        const result = await this.findNotes(scope, query);

        if (result.data.length === 0) {
            throw new RepositoryNotFoundError('conversation notes');
        }

        return result;
    }

    async findOneNote(scope: ConversationScope, key: string): Promise<ConversationNote | undefined> {
        return findConversationNote(this.context, scope, key);
    }

    async findOneNoteOrFail(scope: ConversationScope, key: string): Promise<ConversationNote> {
        const result = await this.findOneNote(scope, key);

        if (result === undefined) {
            throw new RepositoryNotFoundError('conversation notes');
        }

        return result;
    }

    async applyNote(scope: ConversationScope, operation: ConversationNoteOperation): Promise<ConversationNoteResult> {
        return applyConversationNote(this.context, scope, operation);
    }

    async reset(identity: ConversationIdentity, options: { keepNotes: boolean }): Promise<ConversationScope> {
        return resetConversation(this.context, identity, options);
    }

    async delete(identity: ConversationIdentity): Promise<void> {
        return deleteConversation(this.context, identity);
    }

    async prune(
        limits: ResolvedConversationLimits,
        options: { isSettled?: (runId: string) => Promise<boolean> } = {},
    ): Promise<void> {
        return pruneConversations(this.context, limits, options);
    }
}
