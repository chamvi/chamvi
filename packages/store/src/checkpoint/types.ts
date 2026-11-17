/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelMessage } from 'ai';
import type { IEntityRepository } from '../entity/types.ts';

export type Checkpoint = {
    runId: string;
    stepIndex: number;
    messages: ModelMessage[];
    /** AI SDK finish reason of the step this checkpoint was taken after. */
    finishReason?: string;
    /** Provenance of a conversation run's recalled context (not an authorization). */
    conversation?: {
        scopeId: string;
        generation: number;
    };
    createdAt: Date;
};

/** A stored checkpoint: the checkpoint and the row's storage id (a uuid). */
export type CheckpointRecord = Checkpoint & {
    id: string;
};

/**
 * The checkpoint port: the generic entity port on `CheckpointRecord` (key
 * `id`, `runId` unique and referencing a run: a missing run is
 * `EntityRelationError` naming `run`, labelled `checkpoint`). One row per
 * run; which checkpoint a run keeps is the service's rule.
 */
export interface ICheckpointRepository extends IEntityRepository<CheckpointRecord> {}
