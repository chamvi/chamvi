/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { effectScope } from 'vue';
import { useConnection, useConnections } from '../../../../app/connections/composables.ts';
import type { ConnectionDetailWire, IConnectionsApi } from '../../../../app/connections/types.ts';
import { ApiError } from '../../../../app/api/error.ts';
import { apiError } from '../../../utils/client.ts';
import { sse } from '../../../utils/fetch.ts';
import { flush } from '../../../utils/timers.ts';

const DETAIL: ConnectionDetailWire = {
    name: 'whatsapp',
    type: 'whatsapp',
    status: 'pairing',
    widgets: [{ kind: 'qr', value: 'first' }],
};

function fakeApi(overrides: Partial<IConnectionsApi> = {}): IConnectionsApi {
    const missing = (name: string) => () => {
        throw new Error(`${name} not faked`);
    };

    return {
        list: missing('list'),
        get: missing('get'),
        reset: missing('reset'),
        stream: missing('stream'),
        ...overrides,
    };
}

/** A stream body the test feeds event by event. */
function liveStream() {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
    });

    return {
        response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        send(event: string, data: unknown) {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        },
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useConnections', () => {
    it('lists the connections', async () => {
        const list = [{
            name: 'whatsapp',
            type: 'whatsapp',
            status: 'connected' as const,
        }];
        const scope = effectScope();
        const state = scope.run(() => useConnections(fakeApi({ list: async () => list })))!;

        await flush();
        expect(state.connections.value).toEqual(list);
        expect(state.loaded.value).toBe(true);
        scope.stop();
    });

    it('keeps an error without throwing', async () => {
        const scope = effectScope();
        const state = scope.run(() => useConnections(fakeApi({
            list: async () => {
                throw apiError(503);
            },
        })))!;

        await flush();
        expect(state.error.value?.status).toBe(503);
        expect(state.connections.value).toEqual([]);
        scope.stop();
    });
});

describe('useConnection', () => {
    it('a reader gets the status, no widgets and no stream', async () => {
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => ({
                name: 'whatsapp',
                type: 'whatsapp',
                status: 'pairing',
            }),
        }), 'whatsapp', { write: false }))!;

        await flush();
        expect(state.connection.value?.status).toBe('pairing');
        expect(state.widgets.value).toEqual([]);
        scope.stop();
    });

    it('a writer follows status and widgets live, the QR gone once connected', async () => {
        const live = liveStream();
        let signal: AbortSignal | undefined;
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => DETAIL,
            stream: async (_name, s) => {
                signal = s;

                return live.response;
            },
        }), 'whatsapp', { write: true }))!;

        await flush();
        expect(state.widgets.value).toEqual(DETAIL.widgets);

        live.send('widgets', { widgets: [{ kind: 'qr', value: 'second' }] });
        await flush();
        expect(state.widgets.value).toEqual([{ kind: 'qr', value: 'second' }]);

        live.send('status', { status: 'connected' });
        live.send('widgets', { widgets: [] });
        await flush();
        expect(state.connection.value?.status).toBe('connected');
        expect(state.widgets.value).toEqual([]);

        scope.stop();
        expect(signal?.aborted).toBe(true);
    });

    it('a stream refused with 403 shows the error', async () => {
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => DETAIL,
            stream: async () => {
                throw apiError(403, 'forbidden');
            },
        }), 'whatsapp', { write: true }))!;

        await flush();
        await flush();
        expect(state.error.value?.status).toBe(403);
        scope.stop();
    });

    it('a missing connection is a 404 error', async () => {
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => {
                throw apiError(404, 'not_found');
            },
        }), 'gone', { write: true }))!;

        await flush();
        expect(state.error.value?.status).toBe(404);
        expect(state.connection.value).toBeUndefined();
        scope.stop();
    });

    it('reset asks in the page, never through a browser dialog', async () => {
        vi.stubGlobal('confirm', () => {
            throw new Error('browser dialog');
        });

        const resets: string[] = [];
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => ({
                ...DETAIL, 
                status: 'logged_out', 
                widgets: [], 
            }),
            stream: async () => sse([]),
            reset: async (name) => {
                resets.push(name);

                return {
                    name,
                    type: 'whatsapp',
                    status: 'connecting',
                };
            },
        }), 'whatsapp', { write: true, sleep: () => new Promise(() => {}) }))!;

        await flush();
        state.askReset();
        expect(state.confirming.value).toBe(true);
        expect(resets).toEqual([]);

        state.cancelReset();
        expect(state.confirming.value).toBe(false);

        state.askReset();
        await state.confirmReset();
        expect(resets).toEqual(['whatsapp']);
        expect(state.confirming.value).toBe(false);
        expect(state.connection.value?.status).toBe('connecting');
        scope.stop();
    });

    it('a delayed reset response does not replace a newer status from the stream', async () => {
        const live = liveStream();
        const answer = Promise.withResolvers<Awaited<ReturnType<IConnectionsApi['reset']>>>();
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => ({
                ...DETAIL,
                status: 'logged_out',
                widgets: [],
            }),
            stream: async () => live.response,
            reset: () => answer.promise,
        }), 'whatsapp', { write: true, sleep: () => new Promise(() => {}) }))!;

        await flush();
        state.askReset();

        const resetting = state.confirmReset();

        await flush();
        live.send('status', { status: 'pairing' });
        await flush();
        expect(state.connection.value?.status).toBe('pairing');
        answer.resolve({
            name: 'whatsapp',
            type: 'whatsapp',
            status: 'connecting',
        });
        await resetting;
        expect(state.connection.value?.status).toBe('pairing');
        expect(state.confirming.value).toBe(false);
        scope.stop();
    });

    it('a failed reset keeps the error and the status', async () => {
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => DETAIL,
            stream: async () => sse([]),
            reset: async () => {
                throw apiError(403, 'forbidden');
            },
        }), 'whatsapp', { write: true, sleep: () => new Promise(() => {}) }))!;

        await flush();
        state.askReset();
        await state.confirmReset();
        expect(state.resetError.value?.status).toBe(403);
        expect(state.connection.value?.status).toBe('pairing');
        scope.stop();
    });

    it('a reset refused while held elsewhere keeps the server\'s message for the page', async () => {
        const message = 'The connection "whatsapp" is held by another process; reset it where it is held, or once it is no longer held elsewhere.';
        const scope = effectScope();
        const state = scope.run(() => useConnection(fakeApi({
            get: async () => ({
                ...DETAIL,
                status: 'held_elsewhere',
                widgets: [],
            }),
            stream: async () => sse([]),
            reset: async () => {
                throw new ApiError(409, 'conflict', message);
            },
        }), 'whatsapp', { write: true, sleep: () => new Promise(() => {}) }))!;

        await flush();
        state.askReset();
        await state.confirmReset();
        expect(state.resetError.value?.status).toBe(409);
        expect(state.resetError.value?.message).toBe(message);
        expect(state.connection.value?.status).toBe('held_elsewhere');
        scope.stop();
    });
});
