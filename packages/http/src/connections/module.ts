/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionHandle } from '@chamvi/core';
import { NotFoundError } from '@ebec/http';
import { createEventStream, defineCoreHandler } from 'routup';
import type { App, IAppEvent } from 'routup';
import { acquireStreamSlot, refuseStreamOverCap, refuseWhenClosed } from '../app/helpers.ts';
import type { HttpContext } from '../app/types.ts';
import { authenticate } from '../auth/helpers.ts';
import {
    canRead,
    canWrite,
    requireHandle,
    serializeConnection,
} from './helpers.ts';
import type { ConnectionDetailView, ConnectionView } from './types.ts';

function param(event: IAppEvent, name: string): string {
    return event.params[name] ?? '';
}

/**
 * Streams a connection as SSE: `status` (`{ status }`) and `widgets`
 * (`{ widgets }`) now, then each time the handle reports a change that
 * changed either (only the one that changed), and a `ping` every
 * `streamPollMs`. Ends on shutdown or when the client goes away (a failed
 * write or the request signal). After shutdown ran the closers it is 503,
 * with all `stream.maxOpen` slots taken a 503 with `Retry-After`; the stream
 * holds one slot until it ends. The caller checks the principal may write.
 */
function streamConnection(event: IAppEvent, ctx: HttpContext, handle: IConnectionHandle): Response {
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

/**
 * `GET /connections`, `GET /connections/:name`, `GET /connections/:name/events`,
 * `POST /connections/:name/reset` over the app's connection handles.
 * `connection:<name>:read` lists and shows a connection, `:write` (which
 * implies read) also sees its widgets (a pairing QR), streams it and resets
 * it. Widgets never appear in the list.
 */
export function registerConnectionRoutes(app: App, ctx: HttpContext): void {
    app.get('/connections', defineCoreHandler(async (event): Promise<{ data: ConnectionView[] }> => {
        const principal = await authenticate(event, ctx);

        return {
            data: ctx.connections()
                .filter((handle) => canRead(principal, handle.name))
                .map(serializeConnection),
        };
    }));

    app.get('/connections/:name', defineCoreHandler(async (event): Promise<ConnectionDetailView> => {
        const principal = await authenticate(event, ctx);
        const name = param(event, 'name');
        const handle = requireHandle(ctx, principal, name);

        // a writer's response can carry a pairing QR
        event.response.headers.set('cache-control', 'private, no-store');

        return canWrite(principal, name) ? { ...serializeConnection(handle), widgets: handle.widgets() } : serializeConnection(handle);
    }));

    app.get('/connections/:name/events', defineCoreHandler(async (event) => {
        const handle = requireHandle(ctx, await authenticate(event, ctx), param(event, 'name'), true);

        return streamConnection(event, ctx, handle);
    }));

    app.post('/connections/:name/reset', defineCoreHandler(async (event): Promise<ConnectionView> => {
        const handle = requireHandle(ctx, await authenticate(event, ctx), param(event, 'name'), true);
        const { reset } = handle.actions;

        if (!reset) {
            throw new NotFoundError({ message: `The connection "${handle.name}" offers no reset.` });
        }

        await reset.call(handle.actions);
        event.response.status = 202;

        return serializeConnection(handle);
    }));
}
