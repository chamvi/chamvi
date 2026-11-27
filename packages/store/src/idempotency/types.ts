/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IdempotencyKey } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The idempotency key port: the generic entity port on `IdempotencyKey`
 * (key `id`, `(scope, key)` unique). A save of a created key whose
 * `(scope, key)` is stored is `EntityConflictError`.
 */
export interface IIdempotencyRepository extends IEntityRepository<IdempotencyKey> {
    /**
     * Delete every key whose `expiresAt` is at or before `time` and
     * resolve how many it deleted. A row a transaction holds is checked
     * once that transaction ended, so a key taken over past `time`
     * meanwhile stays.
     */
    removeExpiredBy(time: Date): Promise<number>;
}
