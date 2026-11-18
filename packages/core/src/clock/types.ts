/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type ClockTimer = {
    clear(): void;
    /**
     * Lets the process exit while the timer is pending; a fake clock
     * leaves it out.
     */
    unref?(): void;
};

export interface IClock {
    /** Epoch milliseconds, wall time. */
    now(): number;
    setTimeout(fn: () => void, ms: number): ClockTimer;
}
