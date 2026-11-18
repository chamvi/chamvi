/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RequestBaseOptions } from 'hapic';
import { FIXED_TOKEN } from './constants.ts';
import type { APIRequestOptions } from './types.ts';

/** The request config a call's options add: a fixed bearer, marked with `FIXED_TOKEN`. */
export function buildRequestConfig(options: APIRequestOptions = {}): RequestBaseOptions {
    if (options.token === undefined) {
        return {};
    }

    return {
        headers: { authorization: `Bearer ${options.token}` },
        [FIXED_TOKEN]: true,
    } as RequestBaseOptions;
}

/**
 * A signal for one request that aborts with the caller's `signal` or after
 * `ms` without an answer. `clear()` ends the deadline once the answer is
 * there, so a stream or a slow body is not cut off, while the caller's abort
 * keeps reaching it; `expired()` tells a timeout from the caller's abort.
 * Composed by hand: the browser target has no `AbortSignal.any()`, which is
 * also why hapic's own `timeout` is not used.
 */
export function withDeadline(signal: AbortSignal | undefined, ms: number) {
    const controller = new AbortController();
    let expired = false;
    const abort = () => controller.abort(signal?.reason);
    const timer = setTimeout(() => {
        expired = true;
        controller.abort();
    }, ms);

    signal?.addEventListener('abort', abort, { once: true });

    return {
        signal: controller.signal,
        expired: () => expired,
        clear: () => clearTimeout(timer),
    };
}
