/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';

/** Waits `ms` on the clock; rejects with the signal's reason once it aborts. */
export function waitOn(clock: IClock, ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }

    return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            timer.clear();
            reject(signal.reason);
        };
        const timer = clock.setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        timer.unref?.();

        signal.addEventListener('abort', onAbort, { once: true });
    });
}
