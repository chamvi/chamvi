/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '../entity/types.ts';

export type Step = {
    runId: string;
    index: number;
    kind: 'llm' | 'tool' | 'wait';
    name?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    startedAt: Date;
    finishedAt: Date;
};

/**
 * The step port: the generic entity port on `Step`, `runId` referencing a
 * run (labelled `step`, a missing run is `EntityRelationError` naming
 * `run`). A step has no public key: each row gets a storage key in the
 * order rows are saved (`STEP_STORED_ORDER`), assigned when the row is
 * stored, never returned by a read; a query sorts by `index`, then
 * `STEP_STORED_ORDER` for the order steps were saved in. Steps are
 * appended and listed; a read step cannot be saved again.
 */
export interface IStepRepository extends IEntityRepository<Step> {}
