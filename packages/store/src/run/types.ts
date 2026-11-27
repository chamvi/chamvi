/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import type { Run, WaitPoint } from '@chamvi/core-kit';
import type { EntityFindManyResult, IEntityRepository } from '../entity/types.ts';

/**
 * The run port: the generic entity port on `Run` (key `id`, `parentRunId`
 * referencing another run, labelled `run`) and one finder rapiq cannot
 * express on every driver. Rows are stored as given: lineage, time stamps,
 * guards and leases are the service's rules.
 */
export interface IRunRepository extends IEntityRepository<Run> {
    /**
     * `findMany(query)` restricted to the runs whose wait point
     * (`Run.waiting`) is of `kind`: the filters, sort and pagination of
     * `query` apply as in `findMany`, the total counts the restricted
     * selection. Locks nothing, like `findMany`.
     */
    findByWaitKind(kind: WaitPoint['kind'], query: IQuery): Promise<EntityFindManyResult<Run>>;
}
