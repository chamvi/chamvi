/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { ApiError } from '../../error/module.ts';
import { FATAL_STREAM_STATUSES, RECONNECT_DELAYS_MS } from '../../sse/constants.ts';
import { sleep as defaultSleep, parseEventStream } from '../../sse/module.ts';
import type { SseEvent } from '../../sse/types.ts';
import type {
    ConnectionStreamEvent,
    ConnectionStreamOptions,
    ConnectionWidgetWire,
    ConnectionWire,
    IConnectionStream,
} from './types.ts';

function toConnectionEvent(event: SseEvent): ConnectionStreamEvent | undefined {
    if (event.event !== 'status' && event.event !== 'widgets') {
        return undefined;
    }

    const data: unknown = JSON.parse(event.data);

    if (!isObject(data)) {
        return undefined;
    }

    if (event.event === 'status') {
        return typeof data.status === 'string' ? { type: 'status', status: data.status as ConnectionWire['status'] } : undefined;
    }

    return Array.isArray(data.widgets) ? { type: 'widgets', widgets: data.widgets as ConnectionWidgetWire[] } : undefined;
}

/**
 * Follows `GET /connections/:name/events` with the bearer header: `status`
 * and `widgets` events go to `onEvent` (pings are skipped), a drop
 * reconnects with `RECONNECT_DELAYS_MS` (a 503 or 429 waits its
 * `Retry-After`); the stream opens with the current state, so nothing is
 * missed. 400, 401, 403 and 404 stop and go to `onError`. `close()` aborts.
 */
export function openConnectionStream(options: ConnectionStreamOptions): IConnectionStream {
    const controller = new AbortController();
    const { signal } = controller;
    const wait = options.sleep ?? defaultSleep;

    void (async () => {
        let attempt = 0;

        while (!signal.aborted) {
            let delay: number | undefined;

            try {
                const body = await options.api.stream(options.name, signal);

                for await (const event of parseEventStream(body)) {
                    if (signal.aborted) {
                        return;
                    }

                    const connectionEvent = toConnectionEvent(event);

                    if (connectionEvent) {
                        attempt = 0;
                        options.onEvent(connectionEvent);
                    }
                }
            } catch (error) {
                if (signal.aborted) {
                    return;
                }

                if (error instanceof ApiError) {
                    if (FATAL_STREAM_STATUSES.includes(error.status)) {
                        options.onError?.(error);

                        return;
                    }

                    if ((error.status === 503 || error.status === 429) && error.retryAfter !== undefined) {
                        delay = error.retryAfter * 1000;
                    }
                }
            }

            if (signal.aborted) {
                return;
            }

            delay ??= RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!;
            attempt++;
            await wait(delay, signal);
        }
    })();

    return { close: () => controller.abort() };
}
