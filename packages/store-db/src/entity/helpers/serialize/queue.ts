/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource } from 'typeorm';
import { QUEUE_WAIT_TIMEOUT_MS } from '../../constants.ts';
import type {
    Queue,
    QueueClock,
    QueueOptions,
    QueueScope,
    QueueUnit,
} from '../../types.ts';

/*
 * The queue of a data source with one connection (better-sqlite3):
 *
 * - One unit holds the connection at a time; the others wait first in,
 *   first out.
 * - A unit ends when nothing of it is in flight (`holds`) and, when a
 *   query runner is part of it, the connection has no open transaction.
 * - Code joins the open unit instead of waiting when it runs inside the
 *   unit's scope (every await of a callback the unit ran); a unit that
 *   ended is joined by nobody, whatever scope still names it.
 * - A waiter never waits without an end: after `waitTimeoutMs` behind
 *   one and the same holder it is refused with `DatabaseBusyError`, or,
 *   when it is closing the data source, it takes the connection.
 */

const queues = new WeakMap<DataSource, Queue>();

/** The units this code runs inside, through every await of them. */
const scope = new AsyncLocalStorage<QueueScope>();

const systemClock: QueueClock = {
    now: () => Date.now(),
    setTimeout(fn, ms) {
        const timer = setTimeout(fn, ms);

        return {
            clear: () => clearTimeout(timer),
            unref: () => {
                timer.unref();
            },
        };
    },
};

/** The data source's queue; `options` replace its deadline and clock. */
export function queueOf(dataSource: DataSource, options: QueueOptions = {}): Queue {
    let queue = queues.get(dataSource);

    if (!queue) {
        queue = {
            dataSource,
            unit: undefined,
            heldSince: 0,
            waiters: [],
            timer: undefined,
            clock: systemClock,
            waitTimeoutMs: QUEUE_WAIT_TIMEOUT_MS,
        };
        queues.set(dataSource, queue);
    }

    queue.clock = options.clock ?? queue.clock;
    queue.waitTimeoutMs = options.waitTimeoutMs ?? queue.waitTimeoutMs;

    return queue;
}

export function createUnit(): QueueUnit {
    return {
        members: new WeakSet(),
        owned: false,
        holds: 0,
    };
}

/** Whether the data source's connection has an open transaction (the driver's own state, never TypeORM's bookkeeping). */
export function isInTransaction(dataSource: DataSource): boolean {
    const { databaseConnection: connection } = dataSource.driver as { databaseConnection?: { open?: boolean; inTransaction?: boolean } };

    return connection?.open === true && connection.inTransaction === true;
}

/** The unit holding the connection, when this code runs inside its scope. */
export function scopedUnit(queue: Queue): QueueUnit | undefined {
    if (!queue.unit) {
        return undefined;
    }

    for (let frame = scope.getStore(); frame; frame = frame.outer) {
        if (frame.unit === queue.unit) {
            return queue.unit;
        }
    }

    return undefined;
}

/** Runs `fn` inside the unit's scope: what it reaches joins the unit. */
export function runInUnit<R>(unit: QueueUnit, fn: () => R): R {
    return scope.run({ unit, outer: scope.getStore() }, fn);
}
