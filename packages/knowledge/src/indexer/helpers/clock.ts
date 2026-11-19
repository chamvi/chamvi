/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';

/** Resolves after `ms` on the clock, or at once when `signal` aborts (the timer cleared). */
export function wait(clock: IClock, ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const done = () => {
            timer.clear();
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = clock.setTimeout(done, ms);

        timer.unref?.();

        signal.addEventListener('abort', done, { once: true });
    });
}
