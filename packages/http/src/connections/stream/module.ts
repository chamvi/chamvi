/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionHandle } from '@chamvi/core';
import { createEventStream } from 'routup';
import type { IAppEvent } from 'routup';
import { acquireStreamSlot, refuseStreamOverCap, refuseWhenClosed } from '../../app/helpers.ts';
import type { HttpContext } from '../../app/types.ts';

/**
 * Streams a connection as SSE: `status` (`{ status }`) and `widgets`
 * (`{ widgets }`) now, then each time the handle reports a change that
 * changed either (only the one that changed), and a `ping` every
 * `streamPollMs`. Ends on shutdown or when the client goes away (a failed
 * write or the request signal). After shutdown ran the closers it is 503,
 * with all `stream.maxOpen` slots taken a 503 with `Retry-After`; the stream
 * holds one slot until it ends. The caller checks the principal may write.
 */
export function streamConnection(event: IAppEvent, ctx: HttpContext, handle: IConnectionHandle): Response {
    const refused = refuseWhenClosed(event, ctx);

    if (refused) {
        return refused;
    }

    const slot = acquireStreamSlot(ctx);

    if (!slot) {
        return refuseStreamOverCap(event);
    }

    const release: () => void = slot;
    const stream = createEventStream(event);
    const { signal } = event.request;
    let ended = false;
    let lastStatus: string | undefined;
    let lastWidgets: string | undefined;
    let timer: { clear(): void } | undefined;
    let unsubscribe: (() => void) | undefined;

    function cleanup(): void {
        if (ended) {
            return;
        }

        ended = true;

        try {
            unsubscribe?.();
        } catch (error) {
            // a provider's failure must not keep the stream's slot
            ctx.onError(error);
        }

        timer?.clear();
        signal.removeEventListener('abort', cleanup);
        ctx.closers.delete(cleanup);
        stream.end();
        release();
    }

    function write(message: { event: string; data: string }): void {
        if (!ended && !stream.write(message)) {
            // the client went away
            cleanup();
        }
    }

    function send(): void {
        const status = JSON.stringify({ status: handle.status() });
        const widgets = JSON.stringify({ widgets: handle.widgets() });

        if (status !== lastStatus) {
            lastStatus = status;
            write({ event: 'status', data: status });
        }

        if (!(widgets !== lastWidgets)) {
            return;
        }

        lastWidgets = widgets;
        write({ event: 'widgets', data: widgets });
    }

    function arm(): void {
        if (ended) {
            return;
        }

        timer = ctx.clock.setTimeout(() => {
            write({ event: 'ping', data: '' });
            arm();
        }, ctx.streamPollMs);
    }

    ctx.closers.add(cleanup);

    if (signal.aborted) {
        cleanup();

        return stream.response;
    }

    signal.addEventListener('abort', cleanup, { once: true });

    try {
        unsubscribe = handle.subscribe(() => {
            if (!ended) {
                send();
            }
        });
        send();
        arm();
    } catch (error) {
        cleanup();

        throw error;
    }

    return stream.response;
}
