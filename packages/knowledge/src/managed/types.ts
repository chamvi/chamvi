/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { KnowledgeEmbed, KnowledgeIndexLock, KnowledgeWake } from '../indexer/types.ts';
import type { IKnowledgeRepository } from '../repository/types.ts';

export type SyncManagedInput = {
    name: string;
    repository: IKnowledgeRepository;
    embed: KnowledgeEmbed;
    /** Whether `embed` can embed with that stored model identity. */
    hasModel: (model: string) => boolean;
    /** The identity of the default embedding model; absent: none configured (nothing is re-embedded). */
    model?: string;
    /** Whether a re-embed of a stale collection was asked for (`sync()`). */
    reembed: boolean;
    clock: IClock;
    signal: AbortSignal;
    lock: KnowledgeIndexLock;
    /** Receives what does not fail the pass. */
    onError: (error: unknown) => void;
};

/** A managed collection's loop on this instance. */
export type ManagedLoop = {
    controller: AbortController;
    wake: KnowledgeWake;
    task: Promise<void>;
};
