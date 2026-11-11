/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { ApiError } from '../api/error.ts';
import { path } from '../api/helpers.ts';
import { FATAL_STREAM_STATUSES, RECONNECT_DELAYS_MS } from '../sse/constants.ts';
import { sleep as defaultSleep, parseEventStream } from '../sse/helpers.ts';
import type { SseEvent } from '../sse/types.ts';
import type {
    ConnectionDetailWire,
    ConnectionSettingsWire,
    ConnectionStreamEvent,
    ConnectionStreamOptions,
    ConnectionTestWire,
    ConnectionTypeWire,
    ConnectionWidgetWire,
    ConnectionWire,
    ConnectionsTransport,
    IConnectionConfigApi,
    IConnectionStream,
    IConnectionsApi,
} from './types.ts';

async function readJson(response: Response): Promise<unknown> {
    try {
        return JSON.parse(await response.text());
    } catch {
        throw new ApiError(response.status, 'invalid_response', 'The API answered no JSON.');
    }
}

/** The `/connections` routes over the app's API client (bearer, refresh, ApiError). */
export function createConnectionsApi(transport: ConnectionsTransport): IConnectionsApi {
    return {
        list: async () => {
            const body = await readJson(await transport.send('/connections'));

            return isObject(body) && Array.isArray(body.data) ? body.data as ConnectionWire[] : [];
        },
        get: async (name) => await readJson(await transport.send(path('connections', name))) as ConnectionDetailWire,
        reset: async (name) => await readJson(await transport.send(`${path('connections', name)}/reset`, { method: 'POST' })) as ConnectionWire,
        stream: (name, signal) => transport.send(`${path('connections', name)}/events`, {
            headers: { accept: 'text/event-stream' },
            signal,
        }),
    };
}

/** The configuration routes over the app's API client. A secret travels only in a request body. */
export function createConnectionConfigApi(transport: ConnectionsTransport): IConnectionConfigApi {
    const config = (name: string) => `${path('connections', name)}/config`;

    return {
        types: async () => {
            const body = await readJson(await transport.send('/connection-types'));

            return isObject(body) && Array.isArray(body.data) ? body.data as ConnectionTypeWire[] : [];
        },
        read: async (name) => await readJson(await transport.send(config(name))) as ConnectionSettingsWire,
        create: async (type, body) => await readJson(await transport.send(`${path('connection-types', type)}/connections`, {
            method: 'POST',
            body,
        })) as ConnectionSettingsWire & { name: string },
        save: async (name, body) => await readJson(await transport.send(config(name), { method: 'PUT', body })) as ConnectionSettingsWire,
        remove: async (name) => await readJson(await transport.send(path('connections', name), { method: 'DELETE' })) as { restartRequired: boolean },
        test: async (name) => await readJson(await transport.send(`${path('connections', name)}/test`, { method: 'POST' })) as ConnectionTestWire,
    };
}

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
                const response = await options.api.stream(options.name, signal);

                if (!response.body) {
                    throw new ApiError(response.status, 'empty_stream', 'The stream has no body.');
                }

                for await (const event of parseEventStream(response.body)) {
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
