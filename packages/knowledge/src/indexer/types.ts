/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ILockRepository } from '@chamvi/core';
import type { ResolvedKnowledgeCollection } from '../collection/types.ts';
import type { KnowledgeErrorContext } from '../knowledge/types.ts';
import type { IKnowledgeRepository, KnowledgeChunkInput } from '../repository/types.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';

/** Embeds texts with the model of a stored identity, one vector per text. */
export type KnowledgeEmbed = (model: string, texts: string[], signal: AbortSignal) => Promise<number[][]>;

/** The held store lock of one sync. */
export type KnowledgeIndexLock = {
    /** Whether the lock is still this owner's (re-acquired once half the TTL passed). */
    renew(): Promise<boolean>;
};

export type SyncCollectionInput = {
    definition: ResolvedKnowledgeCollection;
    repository: IKnowledgeRepository;
    embed: KnowledgeEmbed;
    clock: IClock;
    signal: AbortSignal;
    /** Receives a skipped document's problem; the sync goes on. */
    onError: (error: unknown) => void;
    lock: KnowledgeIndexLock;
};

/** Why a wait of an idle collection loop ended. */
export type KnowledgeWakeReason = 'wake' | 'timeout' | 'abort';

/** Wakes an idle collection loop; requests made while nobody waits coalesce to one. */
export type KnowledgeWake = {
    /** Ends the current wait, or the next one at once when nobody waits. */
    notify(): void;
    /** Drops a kept request (a pass starting now covers it). */
    clear(): void;
    /** Waits for a request, `ms` on the clock (none: no timeout) or the abort. */
    wait(clock: IClock, ms: number | undefined, signal: AbortSignal): Promise<KnowledgeWakeReason>;
};

/** One pass over a collection under its held lock; `report` receives what does not fail it. */
export type KnowledgePass = (lock: KnowledgeIndexLock, report: (error: unknown) => void) => Promise<void>;

export type CollectionLoopInput = {
    /** The collection (the lock `knowledge:<name>`, the error context). */
    name: string;
    repository: IKnowledgeRepository;
    locks: ILockRepository;
    owner: string;
    clock: IClock;
    signal: AbortSignal;
    onError: (error: unknown, context: KnowledgeErrorContext) => void;
    pass: KnowledgePass;
    wake: KnowledgeWake;
    /** The time from the end of a pass (on any replica) to the next one; absent: a wake only. */
    idleMs?: number;
};

export type EmbedDocumentInput = {
    /** Prefixes a vector problem (`Knowledge collection "<name>"`). */
    label: string;
    /** The stored model identity to embed with. */
    model: string;
    document: Pick<KnowledgeDocumentInput, 'content' | 'title' | 'source'>;
    embed: KnowledgeEmbed;
    signal: AbortSignal;
    /** The generation's vector length, once known. */
    dimensions?: number;
    /** Called once with the length the first batch taught. */
    learned?: (dimensions: number) => Promise<void>;
};

export type EmbeddedDocument = {
    chunks: KnowledgeChunkInput[];
    /** The vector length (absent for a document without chunks and no length known before). */
    dimensions?: number;
};
