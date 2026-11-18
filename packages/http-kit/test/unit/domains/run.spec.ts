/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { buildQueryString, decodeRunListQuery } from '@chamvi/http-kit';
import type { RunListFields } from '@chamvi/http-kit';
import { json, sse } from '../../utils/fetch.ts';
import { createKitClient, linesOf } from '../../utils/kit.ts';

describe('RunAPI', () => {
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

    it('opens the run stream with the last event id', async () => {
        const { client, requests } = createKitClient([sse(['data: 1\n\n'])]);
        const body = await client.run.stream('r1', { lastEventId: 4, signal: new AbortController().signal });

        expect(body).toBeInstanceOf(ReadableStream);
        expect(requests[0]!.url).toBe('/api/runs/r1/stream');
        expect(requests[0]!.headers.get('accept')).toBe('text/event-stream');
        expect(requests[0]!.headers.get('last-event-id')).toBe('4');
    });

    it('maps a stream refusal to ApiError', async () => {
        const { client } = createKitClient([json({ code: 'forbidden', message: 'no' }, 403)]);

        await expect(client.run.stream('r1', { signal: new AbortController().signal })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    });
});

describe('decodeRunListQuery', () => {
    it('decodes what buildQueryString encodes', () => {
        const text = buildQueryString<RunListFields>({ filters: { agent: 'a', status: ['queued', 'running'] }, pagination: { limit: 25, offset: 50 } });
        const query = decodeRunListQuery(text);

        expect(query.pagination).toMatchObject({ limit: 25, offset: 50 });
        expect(JSON.stringify(query.filters)).toContain('queued');
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
