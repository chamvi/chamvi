/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StepRecord } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The step port: the generic entity port on `StepRecord` (key `id`, stored as
 * given), `runId` referencing a run (labelled `step`, a missing run is
 * `EntityRelationError` naming `run`). Each row also gets a sequence in
 * the order rows are saved (`STEP_STORED_ORDER`), assigned when the row is
 * stored, never returned by a read; a query sorts by `index`, then
 * `STEP_STORED_ORDER` for the order steps were saved in. Steps are
 * appended and listed; a read step cannot be saved again.
 */
export interface IStepRepository extends IEntityRepository<StepRecord> {}
