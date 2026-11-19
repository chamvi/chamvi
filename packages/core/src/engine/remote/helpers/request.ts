/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { IClock } from '../../../clock/types.ts';
import { TimeoutError } from '../../../errors/index.ts';
import { PEER_REQUEST_TIMEOUT_MS } from '../../../peer/constants.ts';

/** The `retryAfterMs` a peer rejection carries (0 without one). */
export function peerRetryAfterOf(error: unknown): number {
    if (!isObject(error) || typeof error.retryAfterMs !== 'number' || !Number.isFinite(error.retryAfterMs)) {
        return 0;
    }

    return Math.max(0, error.retryAfterMs);
}

/**
 * One request to a peer under `signal` and the request deadline
 * PEER_REQUEST_TIMEOUT_MS on `clock` (a TimeoutError). A transport that
 * ignores the signal does not hold the caller: the request is raced against it.
 */
export async function peerRequest<T>(
    clock: IClock,
    signal: AbortSignal,
    call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const deadline = new AbortController();
    const timer = clock.setTimeout(() => deadline.abort(new TimeoutError(
        PEER_REQUEST_TIMEOUT_MS,
        `The peer did not answer within ${PEER_REQUEST_TIMEOUT_MS}ms.`,
    )), PEER_REQUEST_TIMEOUT_MS);

    timer.unref?.();

    const combined = AbortSignal.any([signal, deadline.signal]);

    try {
        combined.throwIfAborted();

        const aborted = new Promise<never>((_, reject) => {
            combined.addEventListener('abort', () => reject(combined.reason), { once: true });
        });

        // Promise.try: a synchronous throw (a transport() for an unconfigured peer) still subscribes `aborted`
        return await Promise.race([Promise.try(() => call(combined)), aborted]);
    } finally {
        timer.clear();
    }
}
