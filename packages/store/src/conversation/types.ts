/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelMessage } from 'ai';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * Who a conversation is with, as the trusted channel names it: the memory key, the
 * channel, an account alias on that channel, the chat and an explicit
 * audience. Each field is a non-blank string of at most
 * CONVERSATION_FIELD_MAX_LENGTH UTF-16 code units without control characters
 * or lone surrogates. Its digest, the sha256 of its canonical JSON, is the
 * conversation row's unique `key`.
 */
export type ConversationIdentity = {
    /** Stable memory key from the agent configuration; defaults to its name. */
    agent: string;
    channel: string;
    account: string;
    chat: string;
    audience: string;
};

/**
 * One generation of a conversation: `id` the conversation row's id (a uuid,
 * the identity's digest is the row's `key`), `generation` advanced by a reset
 * or delete, so queued work of an older generation never
 * reaches the new one.
 */
export type ConversationScope = {
    id: string;
    generation: number;
    identity: ConversationIdentity;
};

/** A run's conversation (`Run.conversation`): set by the trusted intake only, never by a dispatch envelope. */
export type ConversationBinding = {
    scope: ConversationScope;
    text: string;
};

/**
 * One transcript record: an accepted user message (`sent` = accepted input),
 * or an assistant emit to the source address (`sent` once the channel's `out`
 * resolved, `unknown` when that is uncertain). Only `sent` items are recalled.
 */
export type ConversationItem = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    runId: string;
    createdAt: Date;
    status: 'pending' | 'sent' | 'unknown';
    effectKey?: string;
    target?: { channel: string; address: string };
};

/** Where a note operation came from: the run, tool call and model step. */
export type ConversationNoteSource = {
    runId: string;
    toolCallId: string;
    stepIndex: number;
};

export type ConversationNote = {
    key: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;
    source: ConversationNoteSource;
};

/**
 * One durable note change. `id` identifies the operation (derived from its
 * source and the operation's ordinal within the tool call), `inputHash` the
 * input it was applied with, so a replay with the same id is answered from
 * the record and never applied twice.
 */
export type ConversationNoteOperation = {
    id: string;
    inputHash: string;
    source: ConversationNoteSource;
    kind: 'set';
    key: string;
    text: string;
    expiresAt?: Date;
} | {
    id: string;
    inputHash: string;
    source: ConversationNoteSource;
    kind: 'remove';
    key: string;
};

/**
 * What a run recalled, stored before its first model step: the rendered
 * messages, the items and notes they came from, and how many items did not fit.
 */
export type ConversationSnapshot = {
    scope: ConversationScope;
    runId: string;
    messages: ModelMessage[];
    itemIds: string[];
    noteKeys: string[];
    createdAt: Date;
    omitted: number;
};

/** What a conversation row keeps of its active turn's snapshot: the run and the scope are the row's own. */
export type ConversationRecordSnapshot = Pick<ConversationSnapshot, 'messages' | 'itemIds' | 'noteKeys' | 'createdAt' | 'omitted'>;

/**
 * The row of one conversation identity: its current scope (`id`,
 * `generation`, `identity`), the identity's digest and the turn it holds.
 */
export type ConversationRecord = {
    /** The scope id (a uuid); items, notes, operations, runs and checkpoints reference it. */
    id: string;
    /** The identity's digest (sha256 hex), unique. */
    key: string;
    identity: ConversationIdentity;
    generation: number;
    /** The run holding the turn; references a run. */
    activeRunId?: string;
    /** The active turn's snapshot. */
    snapshot?: ConversationRecordSnapshot;
};

/**
 * One stored transcript item: the item (its `id` stored as `key`), the
 * scope and generation it belongs to, the row's storage key `id`,
 * assigned when the row is stored, in the order rows are stored
 * (`CONVERSATION_ITEM_STORED_ORDER`), and the byte length of its text.
 */
export type ConversationItemRecord = Omit<ConversationItem, 'id'> & {
    /** The storage key: a positive integer, increasing in the order rows are stored. */
    id: number;
    /** The item's id (`ConversationItem.id`), unique within its scope and generation. */
    key: string;
    /** The conversation row's id. */
    scopeId: string;
    generation: number;
    /**
     * The number of bytes of `text` encoded as UTF-8 (`Buffer.byteLength(text, 'utf8')`):
     * the size the history recall budgets an item with (`maxHistoryBytes`), so the
     * recall selects by sizes and reads the text of the selected items only. The
     * conversation service sets it whenever it stores an item; a repository stores
     * it as given and never computes it.
     */
    bytes: number;
};

/** One stored note: the note, its row id (a uuid) and the scope and generation it belongs to. */
export type ConversationNoteRecord = ConversationNote & {
    id: string;
    /** The conversation row's id. */
    scopeId: string;
    generation: number;
};

/**
 * One stored note operation: the record a replay is answered from,
 * metadata only, never the note's text. `operationId` is the operation's
 * id, unique within its scope and generation; `removed` is set for a
 * removal only.
 */
export type ConversationOperationRecord = {
    /** The row id (a uuid). */
    id: string;
    /** The conversation row's id. */
    scopeId: string;
    generation: number;
    operationId: string;
    /** The run that applied it; references a run. */
    runId: string;
    inputHash: string;
    kind: 'set' | 'remove';
    key: string;
    removed?: boolean;
    createdAt: Date;
};

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
