/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer, IClock } from '@chamvi/core';
import { WHATSAPP_RECONNECT } from '../constants.ts';

/** The wait before reconnect attempt `n` (0-based), see WHATSAPP_RECONNECT. */
export function backoff(n: number): number {
    const base = Math.min(WHATSAPP_RECONNECT.maxMs, WHATSAPP_RECONNECT.initialMs * WHATSAPP_RECONNECT.factor ** n);
    const scaled = base * (1 + WHATSAPP_RECONNECT.jitter * (2 * Math.random() - 1));

    return Math.max(1, Math.min(WHATSAPP_RECONNECT.maxMs, Math.round(scaled)));
}

/** `promise`, or the signal's reason once it aborts first. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);

        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

/** Whether `work` settled within `ms` on the clock; its rejection rethrown. */
export async function within(clock: IClock, ms: number, work: Promise<void>): Promise<boolean> {
    let timer: ClockTimer | undefined;
    const timeout = new Promise<false>((resolve) => {
        timer = clock.setTimeout(() => resolve(false), ms);
        timer.unref?.();
    });

    try {
        return await Promise.race([work.then(() => true as const), timeout]);
    } finally {
        timer?.clear();
    }
}

export const noop = () => undefined;
