/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CheckpointRecord } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The checkpoint port: the generic entity port on `CheckpointRecord` (key
 * `id`, `runId` unique and referencing a run: a missing run is
 * `EntityRelationError` naming `run`, labelled `checkpoint`). One row per
 * run; which checkpoint a run keeps is the service's rule.
 */
export interface ICheckpointRepository extends IEntityRepository<CheckpointRecord> {}
