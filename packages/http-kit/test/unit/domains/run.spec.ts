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
import {
    ApiError,
    Client,
    buildQueryString,
    decodeRunListQuery,
} from '@chamvi/http-kit';
import type { PeerRunViewWire, RunListFields } from '@chamvi/http-kit';
import { json, sse } from '../../utils/responses.ts';
import { createKitClient, linesOf } from '../../utils/kit.ts';
import { SilentTransport } from '../../utils/silent-transport.ts';

describe('RunAPI', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('lists runs newest first unless the query sorts', async () => {
        const page = {
            data: [],
            meta: {
                total: 0, 
                limit: 10, 
                offset: 0, 
            }, 
        };
        const { client, requests } = createKitClient([json(page), json(page), json(page)]);

        await expect(client.run.getMany({ filters: { agent: 'x' } })).resolves.toEqual(page);
        await client.run.getMany({ sorts: 'createdAt' });
        await client.run.getMany();

        expect(requests[0]!.url).toBe(`/api/runs${buildQueryString<RunListFields>({ filters: { agent: 'x' }, sorts: '-createdAt' })}`);
        expect(requests[1]!.url).toBe(`/api/runs${buildQueryString<RunListFields>({ sorts: 'createdAt' })}`);
        expect(requests[2]!.url).toBe(`/api/runs${buildQueryString<RunListFields>({ sorts: '-createdAt' })}`);
    });

    it('reads, cancels and approves a run by its encoded id', async () => {
        const { client, requests } = createKitClient([json({ id: 'a/b', steps: [] }), json({}), new Response(null, { status: 204 })]);
        const body = { approvalId: '0:c:0', approved: true };

        await expect(client.run.getOne('a/b')).resolves.toEqual({ id: 'a/b', steps: [] });
        await expect(client.run.cancel('a/b')).resolves.toBeUndefined();
        await expect(client.run.approve('a/b', body)).resolves.toBeUndefined();

        expect(linesOf(requests)).toEqual(['GET /api/runs/a%2Fb', 'POST /api/runs/a%2Fb/cancel', 'POST /api/runs/a%2Fb/approve']);
        expect(JSON.parse(requests[2]!.body!)).toEqual(body);
    });

    it('refuses a dot segment before any request is sent', async () => {
        const { client, requests } = createKitClient([json({ id: 'x', steps: [] })]);

        await expect(client.run.getOne('..')).rejects.toMatchObject({ status: 0, code: 'path_segment_invalid' });
        await expect(client.run.cancel('.')).rejects.toMatchObject({ code: 'path_segment_invalid' });
        await expect(client.run.getPeerView('')).rejects.toMatchObject({ code: 'path_segment_invalid' });

        expect(requests).toEqual([]);
    });

    it('reads a run as a peer view', async () => {
        const view: PeerRunViewWire = {
            id: 'r1',
            status: 'waiting',
            waiting: 'approval',
            approval: {
                runId: 'r2',
                approvalId: '0:c:0',
                title: 'Deploy?',
                url: 'https://peer.test/approvals?run=r2',
            },
            tainted: false,
            usage: { inputTokens: 1, outputTokens: 2 },
        };
        const { client, requests } = createKitClient([json(view)]);

        const read: PeerRunViewWire = await client.run.getPeerView('a/b');

        expect(read).toEqual(view);
        expect(linesOf(requests)).toEqual(['GET /api/runs/a%2Fb']);
    });

    it('wakes a run with no body', async () => {
        const { client, requests } = createKitClient([new Response(null, { status: 204 })]);

        await expect(client.run.wake('s1')).resolves.toBeUndefined();

        expect(linesOf(requests)).toEqual(['POST /api/runs/s1/wake']);
        expect(requests[0]!.body).toBeUndefined();
    });

    it('opens the run stream with the last event id and the caller\'s signal', async () => {
        const controller = new AbortController();
        const { client, requests } = createKitClient([sse(['data: 1\n\n'])]);
        const body = await client.run.stream('r1', { lastEventId: 3 }, { signal: controller.signal });

        expect(body).toBeInstanceOf(ReadableStream);
        expect(requests[0]!.url).toBe('/api/runs/r1/stream');
        expect(requests[0]!.headers.get('accept')).toBe('text/event-stream');
        expect(requests[0]!.headers.get('last-event-id')).toBe('3');
        expect(requests[0]!.signal!.aborted).toBe(false);

        controller.abort();

        expect(requests[0]!.signal!.aborted).toBe(true);
    });

    it('opens the run stream without a query or options', async () => {
        const { client, requests } = createKitClient([sse([])]);

        await expect(client.run.stream('r1')).resolves.toBeInstanceOf(ReadableStream);
        expect(requests[0]!.headers.has('last-event-id')).toBe(false);
    });

    it('rejects with the caller\'s abort reason before the answer', async () => {
        const controller = new AbortController();
        const transport = new SilentTransport();
        const client = new Client({ baseURL: '/api', transport });
        const outcome = client.run.stream('r1', {}, { signal: controller.signal }).catch((e: unknown) => e);
        const reason = new Error('left');

        await vi.waitFor(() => expect(transport.signals).toHaveLength(1));
        controller.abort(reason);

        expect(await outcome).toBe(reason);
    });

    it('times out the run stream with the timeout option', async () => {
        vi.useFakeTimers();

        const client = new Client({ baseURL: '/api', transport: new SilentTransport() });
        const outcome = client.run.stream('r1', {}, { timeout: 5 }).catch((e: unknown) => e);

        await vi.advanceTimersByTimeAsync(5);

        expect(await outcome).toBeInstanceOf(ApiError);
        expect(await outcome).toMatchObject({ status: 0, code: 'timeout' });
    });

    it('maps a stream refusal to ApiError', async () => {
        const { client } = createKitClient([json({ code: 'forbidden', message: 'no' }, 403)]);

        await expect(client.run.stream('r1')).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    });
});

describe('decodeRunListQuery', () => {
    it('decodes what buildQueryString encodes', () => {
        const text = buildQueryString<RunListFields>({ filters: { agent: 'a', status: ['queued', 'running'] }, pagination: { limit: 25, offset: 50 } });
        const query = decodeRunListQuery(text);

        expect(query.pagination).toMatchObject({ limit: 25, offset: 50 });
        expect(JSON.stringify(query.filters)).toContain('queued');
    });

    it('keeps createdAt bounds', () => {
        const query = decodeRunListQuery('?filter[createdAt]=>=2026-11-01T00:00:00.000Z');

        expect(query.filters).toMatchObject({
            value: [{
                field: 'createdAt', 
                operator: 'gte', 
                value: '2026-11-01T00:00:00.000Z', 
            }], 
        });
    });

    it('reads an empty query as no filter', () => {
        expect(decodeRunListQuery('').filters).toMatchObject({ value: [] });
    });

    it('drops what the schema does not allow and caps the page', () => {
        const query = decodeRunListQuery(new URLSearchParams({
            'filter[secret]': 'x', 
            'filter[agent]': 'a', 
            'page[limit]': '500', 
        }));

        expect(JSON.stringify(query.filters)).not.toContain('secret');
        expect(query.filters).toMatchObject({
            value: [{
                field: 'agent', 
                operator: 'eq', 
                value: 'a', 
            }], 
        });
        expect(query.pagination.limit).toBe(100);
    });
});
