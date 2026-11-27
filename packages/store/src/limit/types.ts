/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LimitUse } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The limit use port: the generic entity port on `LimitUse` (key `id`,
 * `(scope, key)` unique). A save of a created use whose `(scope, key)` is
 * stored is `EntityConflictError`.
 */
export interface ILimitRepository extends IEntityRepository<LimitUse> {
    /**
     * The sum of the weights of the uses of `scope` whose `createdAt` is
     * strictly after `since`, 0 when there is none.
     */
    sumWeight(scope: string, since: Date): Promise<number>;

    /**
     * Delete every use whose `createdAt` is at or before `time` and
     * resolve how many it deleted. A row a transaction holds is checked
     * once that transaction ended.
     */
    removeCreatedBefore(time: Date): Promise<number>;
}
