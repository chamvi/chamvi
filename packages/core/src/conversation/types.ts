/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationOperation, ConversationTurnKind } from './constants.ts';
import type { IClock } from '../clock/index.ts';
import type { IConversationRepository } from '@chamvi/store';
import type { 
    ConversationIdentity, 
    ConversationItem, 
    ConversationNote, 
    ConversationNoteOperation, 
    ConversationScope, 
    ConversationSnapshot, 
    Invoker, 
    Run, 
} from '@chamvi/core-kit';

/** What a channel hands to the trusted intake: the identity fields it owns plus the user's text. */
export type ConversationTarget = {
    account: string;
    chat: string;
    audience: string;
    /** Accepted user text used for the current model message and future transcript recall. */
    text: string;
};

/**
 * App code's reference to an existing conversation of a registered channel:
 * the identity fields the channel's intake computes for that chat (the engine
 * adds the agent's memory key) and, optionally, the address replies go to.
 * Built by a platform setup or by hand, never from a payload; a scheduler
 * that starts a run inside the conversation hands it to that channel's
 * trusted intake.
 */
export type ConversationRef = {
    /** The registered channel whose intake owns the conversation. */
    channel: string;
    account: string;
    chat: string;
    audience: string;
    /** The run's source address on that channel (where its replies go). */
    address?: string;
};

/**
 * Byte and count bounds of a conversation; every value a positive safe integer
 * at most its CONVERSATION_LIMITS_MAX entry. These are UTF-8 byte bounds, not
 * model token estimates.
 */
export type ConversationLimits = {
    /** Prior transcript items recalled per turn. */
    maxItems?: number;
    /** UTF-8 bytes of recalled transcript per turn. */
    maxHistoryBytes?: number;
    /** UTF-8 bytes of notes recalled per turn. */
    maxNotesBytes?: number;
    /** UTF-8 bytes of one item or note. */
    maxItemBytes?: number;
    /** How long transcript items are kept. */
    retentionMs?: number;
    /** Transcript items kept per generation. */
    maxStoredItems?: number;
};

/** ConversationLimits with every default applied (resolved once, when the capability is built). */
export type ResolvedConversationLimits = {
    readonly [K in keyof ConversationLimits]-?: number;
};

export type ConversationOperationLiteral = `${ConversationOperation}`;

/** The question an authorizer answers before a conversation is dispatched, recalled or its notes touched. */
export type ConversationAccess = {
    /** Actual agent name, independently of the stable identity.agent memory key. */
    agent: string;
    operation: ConversationOperationLiteral;
    identity: ConversationIdentity;
    invoker?: Invoker;
};

/** The engine's conversation capability (`EngineOptions.conversations`). */
export type ConversationOptions = {
    authorize: (access: ConversationAccess) => boolean | Promise<boolean>;
    limits?: ConversationLimits;
};

/** Optional engine capability; no ordinary run calls it. */
export interface IConversations {
    readonly service: IConversationService;
    readonly limits: ResolvedConversationLimits;

    allow(operation: ConversationOperationLiteral, identity: ConversationIdentity, agent: string, invoker?: Invoker): Promise<void>;
    check(run: Run, operation?: `${ConversationOperation.RECALL | ConversationOperation.NOTES}`): Promise<void>;
    admit(run: Run): Promise<Exclude<BeginTurnResult, { kind: `${ConversationTurnKind.STALE}` }>>;
    track(runId: string, work: Promise<void>): Promise<void>;
    idle(runId?: string): Promise<void>;
    reconcile(scope: ConversationScope, runId: string): Promise<void>;
    repair(identity: ConversationIdentity): Promise<void>;
    inspect(identity: ConversationIdentity, query?: { limit?: number; offset?: number }): Promise<ConversationInspection | undefined>;
    prune(): Promise<void>;
}

/** The outcome of a note operation: metadata only, never the note's text. */
export type ConversationNoteResult = {
    kind: 'set';
    key: string;
    updatedAt: Date;
} | {
    kind: 'remove';
    key: string;
    removed: boolean;
};

export type BeginTurnResult = {
    kind: `${ConversationTurnKind.READY}`;
    snapshot: ConversationSnapshot;
} | {
    kind: `${ConversationTurnKind.BUSY}`;
    runId: string;
} | {
    kind: `${ConversationTurnKind.STALE}`;
};

export type ConversationFindOptions = { limit: number; offset: number };

export type ConversationServiceContext = {
    /** The conversations with their items, notes and note operations. */
    repository: IConversationRepository;
    /** Read after the conversation row's locked read: every date, expiry and retention comes from it. */
    clock: IClock;
};

/** Privileged in-process inspection; audit runs/checkpoints are separate retained copies. */
export type ConversationInspection = {
    scope: ConversationScope;
    items: { data: ConversationItem[]; total: number };
    notes: { data: ConversationNote[]; total: number };
};

/**
 * The operations of `ConversationService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IConversationService {
    /**
     * The identity's current scope, created at generation 0 when missing.
     * Insert-if-absent on the identity's key: a concurrent creation is read
     * back, and a deleted generation (a tombstone) is never revived.
     */
    resolve(identity: ConversationIdentity): Promise<ConversationScope>;

    /** The identity's current scope, or undefined; read only. */
    findOne(identity: ConversationIdentity): Promise<ConversationScope | undefined>;

    findOneOrFail(identity: ConversationIdentity): Promise<ConversationScope>;

    /** Read-only owner lookup for terminal repair, never reserves a turn. */
    activeRun(scope: ConversationScope): Promise<string | undefined>;

    /**
     * Admit only a nonterminal run; retries reuse its snapshot while it owns
     * the turn. A stale scope is `stale`, another owner `busy`; a run whose
     * turn already ended is refused, as is a run that does not exist
     * (RunNotFoundError). Trims the transcript (retention, then
     * maxStoredItems) and stores the run's input after the recall.
     */
    beginTurn(
        scope: ConversationScope,
        runId: string,
        text: string,
        limits: ResolvedConversationLimits,
    ): Promise<BeginTurnResult>;

    /** Terminal settlement only: clears the owner and snapshot. Never resume this run afterward. */
    endTurn(scope: ConversationScope, runId: string, confirmedEmitIds: string[]): Promise<void>;

    /** Journal an assistant emit of the active run before it is sent; a repeat of the same emit is a no-op. */
    prepareEmit(scope: ConversationScope, item: ConversationItem): Promise<void>;

    /** pending -> sent, by the active run only. */
    confirmEmit(scope: ConversationScope, itemId: string): Promise<void>;

    /** The run's emits still pending in the scope's generation, in the order they were prepared. */
    pendingEmits(scope: ConversationScope, runId: string): Promise<ConversationItem[]>;

    /** A page of the scope generation's items in transcript order, and their total. */
    findItems(
        scope: ConversationScope,
        query: ConversationFindOptions,
    ): Promise<{ data: ConversationItem[]; total: number }>;

    findItemsOrFail(
        scope: ConversationScope,
        query: ConversationFindOptions,
    ): Promise<{ data: ConversationItem[]; total: number }>;

    /** A page of the current generation's live notes by key (code-point order), and their total. */
    findNotes(
        scope: ConversationScope,
        query: ConversationFindOptions,
    ): Promise<{ data: ConversationNote[]; total: number }>;

    findNotesOrFail(
        scope: ConversationScope,
        query: ConversationFindOptions,
    ): Promise<{ data: ConversationNote[]; total: number }>;

    findOneNote(scope: ConversationScope, key: string): Promise<ConversationNote | undefined>;

    findOneNoteOrFail(scope: ConversationScope, key: string): Promise<ConversationNote>;

    /**
     * Apply a note operation of the active run once: a replay of its id is
     * answered from the recorded operation (another input is refused), a
     * fresh set beyond CONVERSATION_NOTES_MAX live notes is refused.
     */
    applyNote(scope: ConversationScope, operation: ConversationNoteOperation): Promise<ConversationNoteResult>;

    /**
     * Advance the identity to a new generation (creating it when missing),
     * ending no turn: a scope with an active turn is refused. With
     * `keepNotes` its live notes move to the new generation; without, the
     * notes and the note operations are removed. Old transcript items stay
     * under their generation until retention removes them.
     */
    reset(identity: ConversationIdentity, options: { keepNotes: boolean }): Promise<ConversationScope>;

    /**
     * Erase the identity's transcript, notes and note operations; the
     * identity stays as a tombstone at a new generation, so old-generation
     * work never recreates it. An unknown identity is a no-op that creates
     * nothing; a scope with an active turn is refused.
     */
    delete(identity: ConversationIdentity): Promise<void>;

    /**
     * Retention for every conversation, each in a transaction of its own:
     * items past retention (never the active turn's), each generation cut
     * to its newest maxStoredItems, expired notes. With `isSettled`, note
     * operation records past retention of runs it reports settled: the
     * candidates are read without a transaction, `isSettled` is called
     * outside any transaction (once per run), then a transaction per
     * conversation re-reads them under the conversation row's lock and
     * removes those still past retention and not of the active run. A
     * failing `isSettled` keeps that run's records and is rethrown at the
     * end.
     */
    prune(
        limits: ResolvedConversationLimits,
        options?: { isSettled?: (runId: string) => Promise<boolean> },
    ): Promise<void>;
}
