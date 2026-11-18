/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer, IClock } from '@chamvi/core';
import type { Timer } from './types.ts';

/**
 * Manually advanced clock for tests.
 */
export class ControllableClock implements IClock {
    protected current: number;

    protected timers: Timer[] = [];

    protected seq = 0;

    /** `start`: a Date or epoch milliseconds (default 0). */
    constructor(start: Date | number = 0) {
        this.current = typeof start === 'number' ? start : start.getTime();
    }

    /** Epoch milliseconds. */
    now(): number {
        return this.current;
    }

    /** No `unref()`: without a real event loop nothing holds a process. */
    setTimeout(fn: () => void, ms: number): ClockTimer {
        const timer: Timer = {
            at: this.current + ms,
            seq: this.seq++,
            fn,
        };

        this.timers.push(timer);

        return {
            clear: () => {
                this.timers = this.timers.filter((t) => t !== timer);
            },
        };
    }

    /**
     * Move time forward, firing due timers in order (timers scheduled by
     * fired callbacks that fall within the window fire too).
     */
    advance(ms: number): void {
        const target = this.current + ms;

        for (;;) {
            const due = this.timers
                .filter((t) => t.at <= target)
                .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];

            if (!due) {
                break;
            }

            this.timers = this.timers.filter((t) => t !== due);
            this.current = Math.max(this.current, due.at);
            due.fn();
        }

        this.current = target;
    }
}
