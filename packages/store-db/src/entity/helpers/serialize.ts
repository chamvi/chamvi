/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource } from 'typeorm';
import { DatabaseBusyError } from '../../error/busy.ts';
import { QUEUE_WAIT_TIMEOUT_MS } from '../constants.ts';
import type {
    Queue,
    QueueClock,
    QueueOptions,
    QueueScope,
    QueueUnit,
    SerializeOptions,
} from '../types.ts';

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
    now: () => new Date(),
    setTimeout(fn, ms) {
        const timer = setTimeout(fn, ms);

        timer.unref();

        return { clear: () => clearTimeout(timer) };
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

function now(queue: Queue): number {
    return queue.clock.now().getTime();
}

function grant(queue: Queue, unit: QueueUnit): void {
    queue.unit = unit;
    queue.heldSince = now(queue);
}

/** Refuses the waiters that waited the whole deadline behind the current holder; one that closes takes the connection. */
function expire(queue: Queue): void {
    const time = now(queue);

    queue.timer = undefined;

    for (let waiter = queue.waiters[0]; waiter; waiter = queue.waiters[0]) {
        const waited = time - Math.max(waiter.since, queue.heldSince);

        if (waited < queue.waitTimeoutMs) {
            break;
        }

        queue.waiters.shift();

        if (waiter.takeover) {
            grant(queue, waiter.unit);
            waiter.grant();
        } else {
            waiter.refuse(new DatabaseBusyError(waited, isInTransaction(queue.dataSource) ? 'transaction' : 'operation'));
        }
    }

    watch(queue);
}

/** Keeps one timer for the waiter that reaches its deadline first. */
function watch(queue: Queue): void {
    const [first] = queue.waiters;

    if (!first) {
        queue.timer?.clear();
        queue.timer = undefined;

        return;
    }

    if (queue.timer) {
        return;
    }

    const due = Math.max(first.since, queue.heldSince) + queue.waitTimeoutMs;

    queue.timer = queue.clock.setTimeout(() => expire(queue), Math.max(0, due - now(queue)));
}

/** Resolves once `unit` holds the connection. */
export function acquire(queue: Queue, unit: QueueUnit, takeover = false): Promise<void> {
    if (!queue.unit) {
        grant(queue, unit);

        return Promise.resolve();
    }

    const {
        promise,
        resolve,
        reject,
    } = Promise.withResolvers<void>();

    queue.waiters.push({
        unit,
        since: now(queue),
        takeover,
        grant: resolve,
        refuse: reject,
    });
    watch(queue);

    return promise;
}

/** Ends one call or callback of `unit`; the unit ends with its last one, unless a query runner of it has a transaction open. */
export function drop(queue: Queue, unit: QueueUnit): void {
    unit.holds -= 1;

    if (queue.unit !== unit || unit.holds > 0 || (unit.owned && isInTransaction(queue.dataSource))) {
        return;
    }

    pass(queue);
}

/** Hands the connection on to the first waiter, or leaves it free. */
export function pass(queue: Queue): void {
    const next = queue.waiters.shift();

    queue.unit = undefined;

    if (next) {
        grant(queue, next.unit);
        next.grant();
    }

    watch(queue);
}

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
        await acquire(queue, unit, options.takeover);
    }

    unit.holds += 1;

    try {
        return await (joined ? work() : runInUnit(unit, work));
    } finally {
        drop(queue, unit);
    }
}
