/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';

export type TrackingClock = IClock & {
    advance(ms: number): void;
    /** Timers neither fired nor cleared. */
    active(): number;
};

/** A ControllableClock that counts its pending timers. */
export function createTrackingClock(start = new Date('2026-11-12T10:00:00Z')): TrackingClock {
    const inner = new ControllableClock(start);
    let active = 0;

    return {
        now: () => inner.now(),
        setTimeout(fn, ms) {
            let done = false;
            const settle = () => {
                if (done) {
                    return;
                }

                done = true;
                active--;
            };

            active++;

            const timer = inner.setTimeout(() => {
                settle();
                fn();
            }, ms);

            return {
                clear() {
                    settle();
                    timer.clear();
                },
            };
        },
        advance: (ms) => inner.advance(ms),
        active: () => active,
    };
}
