/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/errors';
import type { IPeerTransport } from '@chamvi/core';
import type { PeerStartInput } from '@chamvi/core-kit';
import { ControllableClock } from '@chamvi/test-kit';
import { PEER_REQUEST_ERROR_CODE, PeerRequestError, createPeerResolver } from '@chamvi/peer';
import type { FakeHandler } from '../utils/fetch.ts';
import { createFakeFetch, hangingHandler, json } from '../utils/fetch.ts';

const TOKEN = 'peer-dev-secret-0123456789';
const BASE = 'https://dev.example/api';
const NOW = new Date('2026-11-19T10:00:00Z');

function setup(handler: FakeHandler) {
    const fake = createFakeFetch(handler);
    const clock = new ControllableClock(NOW);
    const resolver = createPeerResolver({
        peers: { dev: { url: `${BASE}/`, outgoing: { token: TOKEN } } },
        clock,
        fetch: fake.fetch,
    });

    return {
        fake,
        clock,
        transport: resolver.transport('dev'),
    };
}

const opts = () => ({ signal: new AbortController().signal });

async function rejection(call: Promise<unknown>): Promise<Error & { retryAfterMs?: number }> {
    try {
        await call;
    } catch (error) {
        return error as Error & { retryAfterMs?: number };
    }

    throw new Error('expected a rejection');
}

const START: PeerStartInput = {
    agent: 'developer',
    role: 'default',
    payload: { task: 'fix it' },
    idempotencyKey: 'stand-in-1',
    peer: {
        standIn: 'stand-in-1',
        parent: {
            runId: 'parent-1',
            agent: 'alfred',
            depth: 1,
        },
        taint: true,
        origin: 'Peter',
    },
};

const VIEW = {
    id: 'remote-1',
    status: 'waiting',
    waiting: 'approval',
    approval: {
        runId: 'remote-1',
        approvalId: '0:call:0',
        title: 'Deploy?',
        url: 'https://dev.example/ui/approvals?run=remote-1',
    },
    tainted: false,
    usage: { inputTokens: 3, outputTokens: 4 },
};

describe('peer transport', () => {
    it('starts a run at the peer with the bearer, the lineage and the attachments in base64', async () => {
        const { fake, transport } = setup(() => json({ runId: 'remote-1', deduplicated: false }, { status: 201 }));

        await expect(transport.start({
            ...START,
            attachments: [
                {
                    mediaType: 'text/plain',
                    filename: 'a.txt',
                    data: new TextEncoder().encode('hello'),
                },
                { mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) },
            ],
        }, opts())).resolves.toEqual({ runId: 'remote-1' });

        expect(fake.requests).toHaveLength(1);

        const request = fake.at(0);

        expect(request.method).toBe('POST');
        expect(request.url).toBe(`${BASE}/agents/developer/runs`);
        expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
        expect(request.redirect).toBe('manual');
        expect(JSON.parse(request.body ?? '')).toEqual({
            payload: { task: 'fix it' },
            idempotencyKey: 'stand-in-1',
            role: 'default',
            peer: START.peer,
            attachments: [
                {
                    mediaType: 'text/plain',
                    filename: 'a.txt',
                    data: 'aGVsbG8=',
                },
                { mediaType: 'image/png', data: 'AQID' },
            ],
        });
    });

    it('sends no attachments field without attachments', async () => {
        const { fake, transport } = setup(() => json({ runId: 'remote-1', deduplicated: true }));

        await transport.start(START, opts());

        expect(JSON.parse(fake.at(0).body ?? '')).not.toHaveProperty('attachments');
    });

    it('reads, cancels and wakes runs at the peer', async () => {
        const { fake, transport } = setup((request) => {
            if (request.method === 'GET') {
                return json(VIEW);
            }

            return request.url.endsWith('/wake') ? new Response(null, { status: 202 }) : json({ id: 'remote-1' });
        });

        await expect(transport.read('remote-1', opts())).resolves.toEqual(VIEW);
        await expect(transport.cancel('remote-1', opts())).resolves.toBeUndefined();
        await expect(transport.wake('stand-in-1', opts())).resolves.toBeUndefined();

        expect(fake.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
            `GET ${BASE}/runs/remote-1`,
            `POST ${BASE}/runs/remote-1/cancel`,
            `POST ${BASE}/runs/stand-in-1/wake`,
        ]);
        expect(fake.requests.every((r) => r.headers.get('authorization') === `Bearer ${TOKEN}`)).toBe(true);
    });

    it('refuses a run view that is no object as a ValidationError', async () => {
        const { transport } = setup(() => json('nope'));

        await expect(transport.read('remote-1', opts())).rejects.toBeInstanceOf(ValidationError);
    });

    it.each(['entity_conflict', 'entity_deadlock', 'agent_replaced', 'invalid_run_state'])('maps a 409 %s to a retryable error', async (code) => {
        const { transport } = setup(() => json({ code, message: 'Try again.' }, { status: 409 }));

        const error = await rejection(transport.start(START, opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);
    });

    it.each([400, 401, 403, 404, 409, 413, 415])('maps %i to a permanent ValidationError', async (status) => {
        const { transport } = setup(() => json({ code: 'refused', message: 'Refused.' }, { status }));

        const error = await rejection(transport.start(START, opts()));

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('dev');
    });

    it('keeps a 413 with Retry-After retryable (a temporary size limit)', async () => {
        const { transport } = setup(() => json({ code: 'too_large', message: 'Later.' }, { status: 413, headers: { 'retry-after': '60' } }));

        const error = await rejection(transport.start(START, opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);
    });

    it('maps 429 with Retry-After in seconds to a retryable error with retryAfterMs', async () => {
        const { transport } = setup(() => json({ code: 'rate_limited', message: 'Slow down.' }, { status: 429, headers: { 'retry-after': '120' } }));

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);
        expect((error as PeerRequestError).code).toBe(PEER_REQUEST_ERROR_CODE);
        expect(error.retryAfterMs).toBe(120_000);
    });

    it('maps 503 with Retry-After as an HTTP date to retryAfterMs on the clock', async () => {
        const at = new Date(NOW.getTime() + 90_000).toUTCString();
        const { transport } = setup(() => json({ code: 'peer_start_busy', message: 'Busy.' }, { status: 503, headers: { 'retry-after': at } }));

        const error = await rejection(transport.start(START, opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error.retryAfterMs).toBe(90_000);
    });

    it('maps 429 and 503 without Retry-After to a retryable error without retryAfterMs', async () => {
        const { transport } = setup(() => json({ code: 'busy', message: 'Busy.' }, { status: 503 }));

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error.retryAfterMs).toBeUndefined();

        const limited = setup(() => new Response('', { status: 429 }));
        const second = await rejection(limited.transport.read('remote-1', opts()));

        expect(second).toBeInstanceOf(PeerRequestError);
        expect(second.retryAfterMs).toBeUndefined();
    });

    it.each([500, 502])('maps %i to a plain retryable error', async (status) => {
        const { transport } = setup(() => new Response('oops', { status }));

        const error = await rejection(transport.cancel('remote-1', opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);
        expect(error.retryAfterMs).toBeUndefined();
    });

    it('maps a network error to a plain retryable error', async () => {
        const { transport } = setup(() => {
            throw new TypeError('fetch failed');
        });

        const error = await rejection(transport.wake('stand-in-1', opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error.message).toContain('fetch failed');
    });

    it('never names the token in an error, even when the peer echoes it', async () => {
        const { transport } = setup(() => json({ code: 'bad', message: `bad token ${TOKEN}` }, { status: 500 }));

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error.message).not.toContain(TOKEN);

        const refused = setup(() => json({ code: 'bad', message: `bad token ${TOKEN}` }, { status: 400 }));
        const permanent = await rejection(refused.transport.read('remote-1', opts()));

        expect(permanent.message).not.toContain(TOKEN);
    });

    it('does not follow a redirect to another origin with the token', async () => {
        const { fake, transport } = setup((request) => {
            if (request.url.startsWith('https://evil.example')) {
                return json(VIEW);
            }

            return new Response(null, { status: 302, headers: { location: 'https://evil.example/runs/remote-1' } });
        });

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(ValidationError);
        expect(fake.requests.map((r) => r.url)).toEqual([`${BASE}/runs/remote-1`]);
    });

    it.each([301, 307, 308])('fails a start answered with a %i redirect permanently', async (status) => {
        const { fake, transport } = setup(() => new Response(null, { status, headers: { location: `${BASE}/elsewhere` } }));

        const error = await rejection(transport.start(START, opts()));

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).not.toContain(TOKEN);
        expect(fake.requests).toHaveLength(1);
    });

    it('fails an opaque redirect permanently', async () => {
        const opaque = new Response(null, { status: 200 });

        Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });

        const { transport } = setup(() => opaque);

        await expect(transport.read('remote-1', opts())).rejects.toBeInstanceOf(ValidationError);
    });

    it('fails a static token refused with 401 at once, without a second request', async () => {
        const { fake, transport } = setup(() => json({ code: 'unauthorized', message: 'No.' }, { status: 401 }));

        await expect(transport.start(START, opts())).rejects.toBeInstanceOf(ValidationError);
        expect(fake.requests).toHaveLength(1);
    });

    it.each(['peer_redirect', 'peer_origin'])('keeps a 503 whose body names the code %s retryable', async (code) => {
        const { transport } = setup(() => json({ code, message: 'Busy.' }, { status: 503, headers: { 'retry-after': '45' } }));

        const error = await rejection(transport.start(START, opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);
        expect(error.retryAfterMs).toBe(45_000);
    });

    it('aborts the in-flight request when the caller\'s signal aborts', async () => {
        const { fake, transport } = setup(hangingHandler());
        const controller = new AbortController();
        const reason = new Error('deadline');

        const pending = transport.read('remote-1', { signal: controller.signal });

        await expect.poll(() => fake.requests.length).toBe(1);

        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
        expect(fake.at(0).signal?.aborted).toBe(true);
    });

    it('rejects at once for a signal that is already aborted, sending nothing', async () => {
        const { fake, transport } = setup(() => json(VIEW));
        const controller = new AbortController();

        controller.abort(new Error('gone'));

        await expect((transport as IPeerTransport).read('remote-1', { signal: controller.signal })).rejects.toThrow('gone');
        expect(fake.requests).toHaveLength(0);
    });
});
