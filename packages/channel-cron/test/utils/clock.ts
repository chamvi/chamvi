/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer, IClock } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';

/** Lets the promise chains a fired timer started (lock, dispatch) settle. */
export const flush = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

/**
 * Advances `clock` by `ms` in steps of `stepMs`, flushing after each step,
 * so a tick's pass settles before the next timer fires (as a real event
 * loop would let it).
 */
export async function advance(clock: ControllableClock, ms: number, stepMs = 1_000): Promise<void> {
    let left = ms;

    while (left > 0) {
        const step = Math.min(stepMs, left);

        clock.advance(step);
        left -= step;

        await flush();
    }
}

export type RecordedTimer = {
    ms: number;
    fired: boolean;
    cleared: boolean;
    unrefed: boolean;
};

/**
 * A ControllableClock whose timers carry an `unref()` and are recorded, to
 * tell which timers would hold the process.
 */
export function createRecordingClock(start: Date | number) {
    const inner = new ControllableClock(start);
    const timers: RecordedTimer[] = [];

    const clock: IClock = {
        now: () => inner.now(),
        setTimeout(fn: () => void, ms: number): ClockTimer {
            const record: RecordedTimer = {
                ms,
                fired: false,
                cleared: false,
                unrefed: false,
            };

            timers.push(record);

            const timer = inner.setTimeout(() => {
                record.fired = true;
                fn();
            }, ms);

            return {
                clear: () => {
                    record.cleared = true;
                    timer.clear();
                },
                unref: () => {
                    record.unrefed = true;
                },
            };
        },
    };

    return {
        clock,
        inner,
        timers,
        /** Timers armed and neither fired nor cleared that would hold the process. */
        holding: () => timers.filter((t) => !t.fired && !t.cleared && !t.unrefed),
    };
}
