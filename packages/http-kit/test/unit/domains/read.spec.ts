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
import { Client, REQUEST_TIMEOUT_MS } from '@chamvi/http-kit';
import { FakeTransport } from '../../utils/transport.ts';
import { json } from '../../utils/responses.ts';
import { createKitClient, linesOf } from '../../utils/kit.ts';

describe('the list and account domains', () => {
    it('read their routes and unwrap data', async () => {
        const { client, requests } = createKitClient([
            json({ id: 'admin', kind: 'token' }),
            json({ allowed: [] }),
            json({ allowed: [] }),
            json({ data: [{ name: 'a' }] }),
            json({ data: [{ name: 's' }] }),
            json({ data: [{ name: 'c' }] }),
            json({ data: [{ id: 'f' }] }),
            json({ data: [{ path: '/ui/ext/x' }] }),
            json({}),
        ]);

        await expect(client.account.getMe()).resolves.toEqual({ id: 'admin', kind: 'token' });
        await client.authorization.check(['chamvi_run_read']);
        await client.authorization.check();
        await expect(client.agent.getMany()).resolves.toEqual({ data: [{ name: 'a' }], issues: [] });
        await expect(client.schedule.getMany()).resolves.toEqual([{ name: 's' }]);
        await expect(client.component.getMany()).resolves.toEqual([{ name: 'c' }]);
        await expect(client.artifact.getMany('r 1')).resolves.toEqual([{ id: 'f' }]);
        await expect(client.uiPage.getMany()).resolves.toEqual([{ path: '/ui/ext/x' }]);
        await expect(client.schedule.getMany()).resolves.toEqual([]);

        expect(linesOf(requests)).toEqual([
            'GET /api/me',
            'POST /api/authorization/check',
            'POST /api/authorization/check',
            'GET /api/agents',
            'GET /api/schedules',
            'GET /api/components',
            'GET /api/runs/r%201/artifacts',
            'GET /api/ui-pages',
            'GET /api/schedules',
        ]);
        expect(JSON.parse(requests[1]!.body!)).toEqual({ names: ['chamvi_run_read'] });
        expect(JSON.parse(requests[2]!.body!)).toEqual({});
    });

    it('reads the agent load issues', async () => {
        const issue = { file: 'x.ts', message: 'm' };
        const { client } = createKitClient([json({ data: [], issues: [issue] })]);

        await expect(client.agent.getMany()).resolves.toEqual({ data: [], issues: [issue] });
    });

    it('starts a run through the agent', async () => {
        const { client, requests } = createKitClient([json({ runId: 'r', deduplicated: false }, 202)]);

        await expect(client.agent.startRun('triage', { payload: { a: 1 }, idempotencyKey: 'k' })).resolves.toEqual({ runId: 'r', deduplicated: false });
        expect(linesOf(requests)).toEqual(['POST /api/agents/triage/runs']);
        expect(JSON.parse(requests[0]!.body!)).toEqual({ payload: { a: 1 }, idempotencyKey: 'k' });
    });

    it('reads an artifact as a Blob with the bearer', async () => {
        const { client, requests } = createKitClient([new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })]);
        const blob = await client.artifact.read('r', 'a/b');

        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('image/png');
        expect(blob.size).toBe(2);
        expect(requests[0]!.url).toBe('/api/runs/r/artifacts/a%2Fb');
        expect(requests[0]!.headers.get('accept')).toBe('*/*');
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer t');
    });

    it('pages agent state through rapiq', async () => {
        const { client, requests } = createKitClient([json({ data: [{ key: 'k', value: 1 }] }), json({ data: [{ id: 'd' }] })]);

        await expect(client.state.getKv('a', { pagination: { limit: 10 } })).resolves.toEqual([{ key: 'k', value: 1 }]);
        await expect(client.state.getDocs('a', 'notes x')).resolves.toEqual([{ id: 'd' }]);

        const kv = new URL(requests[0]!.url, 'http://x');

        expect(kv.pathname).toBe('/api/agents/a/state/kv');
        expect(kv.searchParams.get('page[limit]')).toBe('10');
        expect(requests[1]!.url).toBe('/api/agents/a/state/collections/notes%20x');
    });

    it('checks a credential with a fixed token', async () => {
        const { client, requests } = createKitClient([json({ id: 'admin', kind: 'token' })]);

        await client.account.getMe({ token: 'pasted' });
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer pasted');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not cut an artifact download once the answer is there', async () => {
        vi.useFakeTimers();

        // as fetch does, the request's signal aborts the body
        const { client } = createKitClient([(request) => new Response(new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1]));
                request.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
                setTimeout(() => {
                    if (request.signal?.aborted) {
                        return;
                    }

                    controller.enqueue(new Uint8Array([2]));
                    controller.close();
                }, REQUEST_TIMEOUT_MS * 2);
            },
        }), { headers: { 'content-type': 'image/png' } })]);
        const read = client.artifact.read('r', 'a');

        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 3);

        const blob = await read;

        expect(blob.size).toBe(2);
        expect(blob.type).toBe('image/png');
    });

    it('prefixes the base even when a path starts with it', async () => {
        const transport = new FakeTransport([json({ data: [] })]);
        const client = new Client({ baseURL: '/agents', transport });

        await client.agent.getMany();
        expect(transport.requests[0]!.url).toBe('/agents/agents');
    });
});
