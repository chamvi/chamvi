/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '../entity/types.ts';

/** One counted use of a rate limit: the row a limited tool call stores. */
export type LimitUse = {
    /** The row's storage id (a uuid). */
    id: string;
    /** The limit the use counts against, e.g. `<agent>:<bucket>`. */
    scope: string;
    /** The call the use belongs to, unique within its scope. */
    key: string;
    /**
     * How much of the limit the use takes: a whole number from 1 to
     * 2147483647 (the database column is an `integer`). Repositories store it
     * as given; the limit service refuses any other value before a write.
     */
    weight: number;
    /** When the use happened: a window counts it while it starts before this time. */
    createdAt: Date;
};

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
