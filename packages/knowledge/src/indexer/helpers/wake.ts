/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { KnowledgeWake, KnowledgeWakeReason } from '../types.ts';

/**
 * The wake of one collection loop: a `notify()` ends the current `wait()`,
 * or, while nobody waits, is kept for the next one (any number coalesce to
 * one); `clear()` drops a kept one.
 */
export function createWake(): KnowledgeWake {
    let requested = false;
    let waiter: ((reason: KnowledgeWakeReason) => void) | undefined;

    return {
        notify() {
            if (waiter) {
                waiter('wake');

                return;
            }

            requested = true;
        },
        clear() {
            requested = false;
        },
        wait(clock: IClock, ms: number | undefined, signal: AbortSignal) {
            if (signal.aborted) {
                return Promise.resolve('abort');
            }

            if (requested) {
                requested = false;

                return Promise.resolve('wake');
            }

            return new Promise<KnowledgeWakeReason>((resolve) => {
                const onAbort = () => done('abort');
                const timer = ms === undefined ? undefined : clock.setTimeout(() => done('timeout'), ms);

                timer?.unref?.();

                const done = (reason: KnowledgeWakeReason) => {
                    waiter = undefined;
                    timer?.clear();
                    signal.removeEventListener('abort', onAbort);
                    resolve(reason);
                };

                waiter = done;
                signal.addEventListener('abort', onAbort, { once: true });
            });
        },
    };
}
