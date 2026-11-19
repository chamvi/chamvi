/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAppEvent } from 'routup';
import { STREAM_RETRY_AFTER_SECONDS } from '../constants.ts';
import type { HttpContext } from '../types.ts';
import { renderError } from './errors.ts';

/**
 * Takes one of the app's `stream.maxOpen` slots: the release (idempotent,
 * call it on every exit path), or `undefined` when all are taken.
 */
export function acquireStreamSlot(ctx: HttpContext): (() => void) | undefined {
    if (ctx.openStreams >= ctx.maxOpenStreams) {
        return undefined;
    }

    ctx.openStreams++;

    let released = false;

    return () => {
        if (released) {
            return;
        }

        released = true;
        ctx.openStreams--;
    };
}

/**
 * The 503 (with `Retry-After`) of a stream over `stream.maxOpen`. Rendered
 * here, not thrown: an expected refusal is not reported to `onError`.
 */
export function refuseStreamOverCap(event: IAppEvent): Response {
    event.response.headers.set('retry-after', String(STREAM_RETRY_AFTER_SECONDS));

    return renderError(event, {
        status: 503,
        code: 'service_unavailable',
        message: 'Too many open streams, retry later.',
    });
}
