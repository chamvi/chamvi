/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { WaitPoint } from './types.ts';

/**
 * A stored wait point as it reads today: an approval wait point written
 * without the generic `id` gets `id = approvalId`. The input is not changed;
 * repository implementations call it on every wait point they read back.
 */
export function normalizeWaitPoint(raw: Record<string, unknown>): WaitPoint {
    if (raw.kind === 'approval' && raw.id === undefined && typeof raw.approvalId === 'string') {
        return { ...raw, id: raw.approvalId } as WaitPoint;
    }

    return raw as WaitPoint;
}

/** The wait id of a stored wait point: `id`, else (a legacy approval wait point) `approvalId`. */
export function waitIdOf(waiting: WaitPoint | undefined): string | undefined {
    if (!waiting) {
        return undefined;
    }

    if (typeof waiting.id === 'string') {
        return waiting.id;
    }

    return waiting.kind === 'approval' ? waiting.approvalId : undefined;
}

/** Rejects with the abort reason as soon as `signal` aborts, even if `work` ignores the signal. */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);

        signal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}
