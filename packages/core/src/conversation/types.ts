/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationOperation, ConversationTurnKind } from './constants.ts';
import type { IClock } from '../clock/index.ts';
import type {
    ConversationIdentity,
    ConversationItem,
    ConversationNote,
    ConversationScope,
    ConversationSnapshot,
    IConversationRepository,
    Invoker,
    Run,
} from '@chamvi/store';
import type { ConversationService } from './service.ts';

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
    readonly service: ConversationService;
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
