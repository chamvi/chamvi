/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { LessThanOrEqual } from 'typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';

/**
 * Delete the rows whose `expiresAt` is at or before `time` in one
 * statement and return how many it deleted. A row a transaction holds is
 * checked again once that transaction ended (READ COMMITTED), so a row
 * renewed past `time` meanwhile stays.
 */
export async function removeExpiredBy<E extends { expiresAt: Date }>(repository: Repository<E>, time: Date): Promise<number> {
    const result = await repository.delete({ expiresAt: LessThanOrEqual(time) } as FindOptionsWhere<E>);

    return result.affected ?? 0;
}
