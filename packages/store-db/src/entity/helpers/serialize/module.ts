/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import type { SerializeOptions } from '../../types.ts';
import { acquireQueue, dropQueueHold } from './handoff.ts';
import {
    createUnit,
    queueOf,
    runInUnit,
    scopedUnit,
} from './queue.ts';

/**
 * Run `work` as one unit of the data source's queue, after every
 * earlier unit ended. better-sqlite3 has one connection, and TypeORM
 * neither serializes nor nests overlapping transactions on it (the
 * second BEGIN fails, its ROLLBACK ends the first), so every use of
 * such a data source goes through its queue. Work called from inside a
 * unit (through any await of it) joins it and runs at once.
 */
export async function serialize<R>(dataSource: DataSource, work: () => Promise<R>, options: SerializeOptions = {}): Promise<R> {
    const queue = queueOf(dataSource);
    const joined = scopedUnit(queue);
    const unit = joined ?? createUnit();

    if (!joined) {
        await acquireQueue(queue, unit, options.takeover);
    }

    unit.holds += 1;

    try {
        return await (joined ? work() : runInUnit(unit, work));
    } finally {
        dropQueueHold(queue, unit);
    }
}
