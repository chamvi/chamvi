/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ApiError, RECONNECT_DELAYS_MS, createClient } from '@chamvi/http-kit';
import type { ConnectionStreamEvent } from '@chamvi/http-kit';
import { FetchTransport } from 'hapic';
import { openConnectionStream } from '../../../src/domains/connection/helpers.ts';
import {
    createFakeFetch,
    json,
    sse,
} from '../../utils/fetch.ts';
import type { FakeAnswer } from '../../utils/fetch.ts';

function setup(answers: FakeAnswer[]) {
    const { fetch, requests } = createFakeFetch(answers);
    const client = createClient({
        baseURL: '/api',
        transport: new FetchTransport({ fetch }),
        token: async () => 't',
    });

    return {
        api: client.connection, 
        client, 
        requests, 
    };
}

const status = (value: string) => `event: status\ndata: ${JSON.stringify({ status: value })}\n\n`;
const widgets = (list: unknown[]) => `event: widgets\ndata: ${JSON.stringify({ widgets: list })}\n\n`;

describe('ConnectionAPI', () => {
    it('lists the connections with the bearer token', async () => {
        const list = [{
            name: 'whatsapp',
            type: 'whatsapp',
            status: 'pairing',
        }];
        const { api, requests } = setup([json({ data: list })]);

        await expect(api.getMany()).resolves.toEqual(list);
        expect(requests[0]!.url).toBe('/api/connections');
        expect(requests[0]!.method).toBe('GET');
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer t');
    });

    it('answers an empty list for a body without data', async () => {
        const { api } = setup([json({})]);

        await expect(api.getMany()).resolves.toEqual([]);
    });

    it('reads one connection with its name encoded', async () => {
        const detail = {
            name: 'a b',
            type: 'whatsapp',
            status: 'pairing',
            widgets: [{ kind: 'qr', value: 'q' }],
        };
        const { api, requests } = setup([json(detail)]);

        await expect(api.getOne('a b')).resolves.toEqual(detail);
        expect(requests[0]!.url).toBe('/api/connections/a%20b');
    });

    it('resets by POST and answers the view', async () => {
        const view = {
            name: 'whatsapp',
            type: 'whatsapp',
            status: 'connecting',
        };
        const { api, requests } = setup([json(view, 202)]);

        await expect(api.reset('whatsapp')).resolves.toEqual(view);
        expect(requests[0]!.url).toBe('/api/connections/whatsapp/reset');
        expect(requests[0]!.method).toBe('POST');
    });

    it('turns a 403 into an ApiError', async () => {
        const { api } = setup([json({
            status: 403,
            code: 'forbidden',
            message: 'no',
        }, 403)]);

        await expect(api.getOne('whatsapp')).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    });

    it('opens the event stream as text/event-stream', async () => {
        const { api, requests } = setup([sse([])]);
        const controller = new AbortController();

        await expect(api.stream('whatsapp', controller.signal)).resolves.toBeInstanceOf(ReadableStream);
        expect(requests[0]!.url).toBe('/api/connections/whatsapp/events');
        expect(requests[0]!.headers.get('accept')).toBe('text/event-stream');
    });

    it('reads, creates, saves, deletes and tests an account\'s configuration', async () => {
        const settings = { type: 'mail', values: { host: 'h' } };
        const { client, requests } = setup([
            json(settings),
            json({ ...settings, name: 'mail-a' }, 201),
            json(settings),
            json({ restartRequired: true }),
            json({ ok: true }),
            json({ data: [{ type: 'mail' }] }),
        ]);
        const api = client.connection;

        await expect(api.getConfig('mail a')).resolves.toEqual(settings);
        await expect(api.create('mail', { values: { host: 'h' }, secrets: { password: 'p' } } as never)).resolves.toMatchObject({ name: 'mail-a' });
        await expect(api.save('mail-a', { values: { host: 'h' } } as never)).resolves.toEqual(settings);
        await expect(api.delete('mail-a')).resolves.toEqual({ restartRequired: true });
        await expect(api.test('mail-a')).resolves.toEqual({ ok: true });
        await expect(client.connectionType.getMany()).resolves.toEqual([{ type: 'mail' }]);

        expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
            'GET /api/connections/mail%20a/config',
            'POST /api/connection-types/mail/connections',
            'PUT /api/connections/mail-a/config',
            'DELETE /api/connections/mail-a',
            'POST /api/connections/mail-a/test',
            'GET /api/connection-types',
        ]);
        expect(JSON.parse(requests[1]!.body!)).toEqual({ values: { host: 'h' }, secrets: { password: 'p' } });
        expect(requests[1]!.headers.get('content-type')).toContain('application/json');
    });
});

describe('openConnectionStream', () => {
    function follow(answers: FakeAnswer[]) {
        const { api, requests } = setup(answers);
        const events: ConnectionStreamEvent[] = [];
        const errors: ApiError[] = [];
        const delays: number[] = [];
        const { promise: finished, resolve: done } = Promise.withResolvers<void>();
        const stream = openConnectionStream({
            api,
            name: 'whatsapp',
            onEvent: (event) => {
                events.push(event);
            },
            onError: (error) => {
                errors.push(error);
                done();
            },
            sleep: async (ms) => {
                delays.push(ms);

                if (answers.length === 0) {
                    done();
                }
            },
        });

        // a fake sleep resolves at once: stop the loop once the test has seen enough
        void finished.then(() => stream.close());

        return {
            stream,
            requests,
            events,
            errors,
            delays,
            finished,
        };
    }

    it('delivers status and widget events and skips pings', async () => {
        const qr = { kind: 'qr', value: 'pairing-material' };
        const { events, finished } = follow([sse([
            status('pairing'),
            widgets([qr]),
            'event: ping\ndata: {}\n\n',
            status('connected'),
            widgets([]),
        ])]);

        await finished;
        expect(events).toEqual([
            { type: 'status', status: 'pairing' },
            { type: 'widgets', widgets: [qr] },
            { type: 'status', status: 'connected' },
            { type: 'widgets', widgets: [] },
        ]);
    });

    it('reconnects after a drop with the backoff', async () => {
        const {
            delays,
            finished,
            requests,
        } = follow([
            sse([]),
            new Response('down', { status: 502 }),
            sse([status('connected')]),
        ]);

        await finished;
        expect(requests).toHaveLength(3);
        expect(delays).toEqual([RECONNECT_DELAYS_MS[0], RECONNECT_DELAYS_MS[1], RECONNECT_DELAYS_MS[0]]);
    });

    it('waits the Retry-After of a 503', async () => {
        const { delays, finished } = follow([json({ status: 503, code: 'unavailable' }, 503, { 'retry-after': '5' })]);

        await finished;
        expect(delays).toEqual([5000]);
    });

    it('stops on a 403 and reports it', async () => {
        const {
            errors,
            finished,
            requests,
        } = follow([json({ status: 403, code: 'forbidden' }, 403)]);

        await finished;
        expect(requests).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(ApiError);
        expect(errors[0]!.status).toBe(403);
    });

    it('close() aborts the open request', async () => {
        const { promise: opened, resolve } = Promise.withResolvers<AbortSignal>();
        const { stream } = follow([(request) => {
            resolve(request.signal!);

            return new Promise<Response>(() => {});
        }]);
        const signal = await opened;

        stream.close();
        expect(signal.aborted).toBe(true);
    });
});
