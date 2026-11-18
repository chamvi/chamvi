/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineIntervalComponent } from 'hubwire';
import type { IScheduledComponent, IntervalResult } from 'hubwire';
import type { IRetryLoop, RetryEntry, RetryLoopOptions } from './types.ts';

/**
 * Pending retries, keyed by name, each due at `at`, run as a hubwire interval
 * component on poll ticks: a pass retries every entry due at its start (in
 * insertion order, ending early once stopped), then waits for the first poll
 * tick at or after the earliest pending entry (a whole number of `pollMs`
 * from its end, as polling every `pollMs` would), or ends the loop when none
 * is left, so no timer is armed without a retry. `set()` on a started loop
 * starts it again; one during a pass keeps it running. A retry that rejects
 * is logged (`agent reload failed`) and its entry stays due; the pass then
 * throws an AggregateError of the failures, so the component's status
 * records it, and the loop waits `pollMs`, the next tick.
 */
export function createRetryLoop(options: RetryLoopOptions): IRetryLoop {
    const {
        name,
        clock,
        pollMs,
        logger,
        retry,
    } = options;
    const entries = new Map<string, RetryEntry>();
    let started = false;
    let stopped = false;

    const decide = (): IntervalResult => {
        if (entries.size === 0) {
            return { done: true };
        }

        let earliest = Infinity;

        for (const entry of entries.values()) {
            earliest = Math.min(earliest, entry.at);
        }

        const ticks = Math.max(1, Math.ceil((earliest - clock.now()) / pollMs));

        return { delayMs: ticks * pollMs };
    };

    const loop = defineIntervalComponent({
        name,
        clock,
        intervalMs: pollMs,
        runOnStart: false,
        unref: true,
        handler: async ({ signal }) => {
            const now = clock.now();
            const failures: unknown[] = [];

            for (const [key, entry] of [...entries]) {
                if (signal.aborted) {
                    break;
                }

                if (now < entry.at) {
                    continue;
                }

                try {
                    await retry(key);
                } catch (error) {
                    // the store failed: retried on the next poll
                    logger.error('agent reload failed', error, { agent: key });
                    failures.push(error);
                }
            }

            if (failures.length > 0) {
                // each logged above: the component's status records the failed pass, nothing logs it again
                throw new AggregateError(failures, 'Retrying the agent packages failed for some agents.');
            }

            return decide();
        },
    });

    const component: IScheduledComponent = {
        async start() {
            started = true;
            stopped = false;

            if (entries.size > 0) {
                await loop.start();
            }
        },
        async stop() {
            started = false;
            stopped = true;
            await loop.stop();
        },
        settled: () => loop.settled(),
        status: () => loop.status(),
    };

    return {
        component,
        get: (key) => entries.get(key),
        set(key, entry) {
            entries.set(key, entry);

            if (started) {
                // never awaited: a pass that adds a retry must not wait for its own loop
                void loop.start();
            }
        },
        delete: (key) => entries.delete(key),
        stopped: () => stopped,
    };
}
