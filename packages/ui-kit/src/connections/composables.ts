/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { onScopeDispose, shallowRef } from 'vue';
import type { ApiError } from '../api/error.ts';
import { asApiError, retryDelayOf } from '../api/helpers.ts';
import { createPoller } from '../polling/module.ts';
import { openConnectionStream } from './api.ts';
import { CONNECTIONS_POLL_MS } from './constants.ts';
import type {
    ConnectionDetailWire,
    ConnectionWidgetWire,
    ConnectionWire,
    IConnectionStream,
    IConnectionsApi,
    UseConnectionOptions,
} from './types.ts';

/** `GET /connections`, refreshed every `CONNECTIONS_POLL_MS` while the scope lives. */
export function useConnections(api: IConnectionsApi) {
    const connections = shallowRef<ConnectionWire[]>([]);
    const error = shallowRef<ApiError>();
    const loaded = shallowRef(false);
    const poller = createPoller(async () => {
        try {
            connections.value = await api.list();
            error.value = undefined;

            return undefined;
        } catch (e) {
            error.value = asApiError(e);

            return retryDelayOf(error.value);
        } finally {
            loaded.value = true;
        }
    }, CONNECTIONS_POLL_MS);

    poller.start();
    onScopeDispose(() => poller.stop());

    return {
        connections,
        error,
        loaded,
        refresh: () => poller.refresh(),
    };
}

/**
 * One connection: a writer loads it and then follows its event stream
 * (status and widgets live, the QR included); a reader, who gets no
 * widgets and may not open the stream, polls the status. `write` is the
 * name-level verdict, an upper bound: the caller writes this connection
 * (`writable`) only when the server also sent the writer-only `widgets`.
 * The reset asks for a confirmation in the page (`askReset`, then
 * `confirmReset`).
 */
export function useConnection(api: IConnectionsApi, name: string, options: UseConnectionOptions) {
    const connection = shallowRef<ConnectionDetailWire>();
    const widgets = shallowRef<ConnectionWidgetWire[]>([]);
    const writable = shallowRef(false);
    const error = shallowRef<ApiError>();
    const confirming = shallowRef(false);
    const resetting = shallowRef(false);
    const resetError = shallowRef<ApiError>();
    let stream: IConnectionStream | undefined;
    let disposed = false;
    // counts the statuses the stream delivered: a reset response is older than any received since its request
    let statusRevision = 0;

    function follow(): void {
        stream = openConnectionStream({
            api,
            name,
            sleep: options.sleep,
            onEvent: (event) => {
                if (!connection.value) {
                    return;
                }

                if (event.type === 'status') {
                    statusRevision++;
                    connection.value = { ...connection.value, status: event.status };
                } else {
                    widgets.value = event.widgets;
                }
            },
            onError: (e) => {
                // the stream stopped for good: a QR fetched before it would stay on the page, stale
                widgets.value = [];
                error.value = e;
            },
        });
    }

    const poller = createPoller(async () => {
        try {
            const detail = await api.get(name);

            connection.value = detail;
            // write may be held for another connection only: the server sends widgets to a writer of this one
            writable.value = options.write && detail.widgets !== undefined;
            widgets.value = writable.value ? detail.widgets ?? [] : [];
            error.value = undefined;

            // no handle in this process means no stream: keep polling until one runs
            if (writable.value && !disposed && detail.live !== false) {
                // the stream carries every change from here on
                poller.stop();
                follow();
            }

            return undefined;
        } catch (e) {
            error.value = asApiError(e);

            return retryDelayOf(error.value);
        }
    }, CONNECTIONS_POLL_MS);

    poller.start();
    onScopeDispose(() => {
        disposed = true;
        poller.stop();
        stream?.close();
    });

    return {
        connection,
        widgets,
        writable,
        error,
        confirming,
        resetting,
        resetError,
        askReset(): void {
            resetError.value = undefined;
            confirming.value = true;
        },
        cancelReset(): void {
            confirming.value = false;
        },
        async confirmReset(): Promise<void> {
            if (!confirming.value || resetting.value) {
                return;
            }

            resetting.value = true;

            const revision = statusRevision;

            try {
                const view = await api.reset(name);

                // the stream stays authoritative: keep a status it delivered while the request was in flight
                const live = revision === statusRevision ? undefined : connection.value?.status;

                connection.value = { ...connection.value, ...view };

                if (live) {
                    connection.value = { ...connection.value, status: live };
                }

                confirming.value = false;
            } catch (e) {
                resetError.value = asApiError(e);
            } finally {
                resetting.value = false;
            }
        },
    };
}
