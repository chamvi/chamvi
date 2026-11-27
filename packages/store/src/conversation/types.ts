/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { 
    ConversationItemRecord, 
    ConversationNoteRecord, 
    ConversationOperationRecord, 
    ConversationRecord, 
} from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The items of conversations: the generic entity port on
 * `ConversationItemRecord` (key `id`, assigned when a row is stored and
 * increasing in that order: sort by `CONVERSATION_ITEM_STORED_ORDER` for
 * the transcript's order; `(scopeId, generation, key)` unique, and
 * `upsert` replaces by it, keeping the stored storage key). `scopeId`
 * references a conversation (`EntityRelationError` naming
 * `conversation`), `runId` a run (naming `run`). `findMany` honours a
 * query's `fields`: the recall reads ids and `bytes` without the text.
 */
export interface IConversationItemRepository extends IEntityRepository<ConversationItemRecord> {}

/**
 * The notes of conversations: the generic entity port on
 * `ConversationNoteRecord` (key `id`, `(scopeId, generation, key)`
 * unique; a sort by `key` orders by code point). `scopeId` references a
 * conversation, `source.runId` a run.
 */
export interface IConversationNoteRepository extends IEntityRepository<ConversationNoteRecord> {}

/**
 * The note operations of conversations: the generic entity port on
 * `ConversationOperationRecord` (key `id`, `(scopeId, generation,
 * operationId)` unique). `scopeId` references a conversation, `runId` a
 * run.
 */
export interface IConversationOperationRepository extends IEntityRepository<ConversationOperationRecord> {}

/**
 * The conversation port: the generic entity port on `ConversationRecord`
 * (key `id`, `key` unique; `activeRunId` references a run), with the
 * aggregate's child tables as repositories of their own. Inside
 * `transaction(fn)` the handed-in repository's `items`, `notes` and
 * `operations` are bound to the same transaction: a rejected `fn`
 * restores the conversation and its children alike. A single-row read of
 * a conversation inside a transaction locks the row against changes, not
 * against the inserts of rows referencing it (child rows, runs and
 * checkpoints). A conversation row is never removed: runs and checkpoints
 * keep referencing it, and its children reference it.
 */
export interface IConversationRepository extends IEntityRepository<ConversationRecord> {
    readonly items: IConversationItemRepository;

    readonly notes: IConversationNoteRepository;

    readonly operations: IConversationOperationRepository;
}
