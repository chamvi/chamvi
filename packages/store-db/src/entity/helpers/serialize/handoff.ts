/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { DatabaseBusyError } from '../../../error/busy.ts';
import type { Queue, QueueUnit } from '../../types.ts';
import { isInTransaction } from './queue.ts';

function queueNow(queue: Queue): number {
    return queue.clock.now();
}

function grantQueue(queue: Queue, unit: QueueUnit): void {
    queue.unit = unit;
    queue.heldSince = queueNow(queue);
}

/** Refuses the waiters that waited the whole deadline behind the current holder; one that closes takes the connection. */
function expireQueueWaiters(queue: Queue): void {
    const time = queueNow(queue);

    queue.timer = undefined;

    for (let waiter = queue.waiters[0]; waiter; waiter = queue.waiters[0]) {
        const waited = time - Math.max(waiter.since, queue.heldSince);

        if (waited < queue.waitTimeoutMs) {
            break;
        }

        queue.waiters.shift();

        if (waiter.takeover) {
            grantQueue(queue, waiter.unit);
            waiter.grant();
        } else {
            waiter.refuse(new DatabaseBusyError(waited, isInTransaction(queue.dataSource) ? 'transaction' : 'operation'));
        }
    }

    watchQueue(queue);
}

/** Keeps one timer for the waiter that reaches its deadline first. */
function watchQueue(queue: Queue): void {
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

    const timer = queue.clock.setTimeout(() => expireQueueWaiters(queue), Math.max(0, due - queueNow(queue)));

    timer.unref?.();
    queue.timer = timer;
}

/** Resolves once `unit` holds the connection. */
export function acquireQueue(queue: Queue, unit: QueueUnit, takeover = false): Promise<void> {
    if (!queue.unit) {
        grantQueue(queue, unit);

        return Promise.resolve();
    }

    const {
        promise,
        resolve,
        reject,
    } = Promise.withResolvers<void>();

    queue.waiters.push({
        unit,
        since: queueNow(queue),
        takeover,
        grant: resolve,
        refuse: reject,
    });
    watchQueue(queue);

    return promise;
}

/** Ends one call or callback of `unit`; the unit ends with its last one, unless a query runner of it has a transaction open. */
export function dropQueueHold(queue: Queue, unit: QueueUnit): void {
    unit.holds -= 1;

    if (queue.unit !== unit || unit.holds > 0 || (unit.owned && isInTransaction(queue.dataSource))) {
        return;
    }

    passQueue(queue);
}

/** Hands the connection on to the first waiter, or leaves it free. */
export function passQueue(queue: Queue): void {
    const next = queue.waiters.shift();

    queue.unit = undefined;

    if (next) {
        grantQueue(queue, next.unit);
        next.grant();
    }

    watchQueue(queue);
}
