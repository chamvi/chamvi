/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityManager } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { LockEntity, LockTokenEntity } from '../../entities/index.ts';

/** The key of the counter row in `chamvi_lock_tokens`. */
const LOCK_TOKEN_KEY = 'lock';

/**
 * One atomic `UPDATE ... SET value = GREATEST(value + 1, floor) RETURNING
 * value` of the counter row: concurrent callers serialize on the row, so a
 * token is never issued twice. The floor is this process's wall clock in
 * microseconds (`Date.now() * 1000`, as the memory store issues), not the
 * database's: storage numbering, never compared with domain time, and no
 * query calls the database's clock. A missing row (a truncated or
 * synchronized table) is inserted first at the floor or the highest token
 * a stored lease holds, whichever is greater, so the next token is above
 * every surviving lease, under a new uuid v7 `id` (a concurrent insert
 * that lost on the key leaves the winner's row).
 */
export async function issueLockToken(manager: EntityManager): Promise<number> {
    for (;;) {
        const floor = Date.now() * 1000;
        const result = await manager.createQueryBuilder()
            .update(LockTokenEntity)
            .set({ value: () => 'GREATEST("value" + 1, :floor)' })
            .setParameters({ floor })
            .where({ key: LOCK_TOKEN_KEY })
            .returning(['value'])
            .execute();
        const [row] = result.raw as { value: string | number }[];

        if (row) {
            return Number(row.value);
        }

        const stored = await manager.createQueryBuilder(LockEntity, 'lock')
            .select('MAX(lock.token)', 'value')
            .getRawOne<{ value: string | number | null }>();
        const highest = stored?.value === null || stored?.value === undefined ? 0 : Number(stored.value);

        await manager.createQueryBuilder()
            .insert()
            .into(LockTokenEntity)
            .values({
                id: uuidv7(),
                key: LOCK_TOKEN_KEY,
                value: Math.max(floor, highest),
            })
            .orIgnore()
            .execute();
    }
}
