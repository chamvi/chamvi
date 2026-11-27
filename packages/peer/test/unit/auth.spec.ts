/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/errors';
import { ControllableClock } from '@chamvi/test-kit';
import { PEER_TOKEN_REFRESH_MARGIN_MS, PeerRequestError, createPeerResolver } from '@chamvi/peer';
import type { FakeRequest } from '../utils/fetch.ts';
import { createFakeFetch, json } from '../utils/fetch.ts';

const SECRET = 'client-secret-0123456789';
const AUTHUP = 'https://auth.example';
const VIEW = {
    id: 'remote-1',
    status: 'running',
    tainted: false,
    usage: { inputTokens: 0, outputTokens: 0 },
};

type Script = { token: (request: FakeRequest) => Response };

function setup(script: Partial<Script> = {}) {
    let issued = 0;
    const peerStatuses: number[] = [];
    const fake = createFakeFetch((request) => {
        if (request.url === `${AUTHUP}/token`) {
            issued += 1;

            return script.token?.(request) ?? json({
                access_token: `access-${issued}`,
                token_type: 'Bearer',
                expires_in: 3_600,
            });
        }

        const status = peerStatuses.shift() ?? 200;

        return status === 200 ? json(VIEW) : json({ code: 'unauthorized', message: 'No.' }, { status });
    });
    const clock = new ControllableClock(new Date('2026-11-19T10:00:00Z'));
    const resolver = createPeerResolver({
        peers: {
            dev: {
                url: 'https://dev.example',
                outgoing: {
                    authup: {
                        url: `${AUTHUP}/`,
                        clientId: 'chamvi-assistants',
                        clientSecret: SECRET,
                    },
                },
            },
        },
        clock,
        fetch: fake.fetch,
    });

    return {
        fake,
        clock,
        peerStatuses,
        transport: resolver.transport('dev'),
        tokenRequests: () => fake.requests.filter((r) => r.url === `${AUTHUP}/token`),
        bearers: () => fake.requests.filter((r) => r.url !== `${AUTHUP}/token`).map((r) => r.headers.get('authorization')),
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

describe('authup outgoing credential', () => {
    it('fetches a client-credentials token once and reuses it until 30 s before expires_in', async () => {
        const {
            clock,
            transport,
            tokenRequests,
            bearers,
        } = setup();

        await transport.read('remote-1', opts());
        clock.advance(60_000);
        await transport.read('remote-1', opts());

        expect(tokenRequests()).toHaveLength(1);

        const request = tokenRequests().at(0);

        if (!request) {
            throw new Error('expected a token request');
        }

        expect(request.method).toBe('POST');
        expect(request.redirect).toBe('manual');
        expect(request.headers.get('content-type')).toContain('application/x-www-form-urlencoded');
        expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
            grant_type: 'client_credentials',
            client_id: 'chamvi-assistants',
            client_secret: SECRET,
        });

        // the last moment the token is still used: 30 s before it expires
        clock.advance(3_600_000 - PEER_TOKEN_REFRESH_MARGIN_MS - 1 - 60_000);
        await transport.read('remote-1', opts());

        expect(tokenRequests()).toHaveLength(1);

        clock.advance(1);
        await transport.read('remote-1', opts());

        expect(tokenRequests()).toHaveLength(2);
        expect(bearers()).toEqual([
            'Bearer access-1',
            'Bearer access-1',
            'Bearer access-1',
            'Bearer access-2',
        ]);
    });

    it('retries a 401 once inline with a fresh token', async () => {
        const {
            transport,
            tokenRequests,
            peerStatuses,
            bearers,
        } = setup();

        peerStatuses.push(401);

        await expect(transport.read('remote-1', opts())).resolves.toMatchObject({ id: 'remote-1' });
        expect(tokenRequests()).toHaveLength(2);
        expect(bearers()).toEqual(['Bearer access-1', 'Bearer access-2']);

        // the fresh token stays cached
        await transport.read('remote-1', opts());
        expect(tokenRequests()).toHaveLength(2);
    });

    it('fails permanently when the fresh token is refused with 401 too', async () => {
        const {
            transport,
            tokenRequests,
            peerStatuses,
            bearers,
        } = setup();

        peerStatuses.push(401, 401);

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).not.toContain('access-');
        expect(tokenRequests()).toHaveLength(2);
        expect(bearers()).toEqual(['Bearer access-1', 'Bearer access-2']);
    });

    it.each([400, 401, 403])('fails a token request refused with %i permanently, never naming the secret', async (status) => {
        const { transport, fake } = setup({ token: () => json({ error: 'invalid_client', error_description: `bad secret ${SECRET}` }, { status }) });

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).not.toContain(SECRET);
        expect(fake.requests.every((r) => r.url === `${AUTHUP}/token`)).toBe(true);
    });

    it('fails a redirect of the token endpoint permanently, sending the secret nowhere else', async () => {
        const { transport, fake } = setup({ token: () => new Response(null, { status: 302, headers: { location: 'https://evil.example/token' } }) });

        await expect(transport.read('remote-1', opts())).rejects.toBeInstanceOf(ValidationError);
        expect(fake.requests.map((r) => r.url)).toEqual([`${AUTHUP}/token`]);
    });

    it.each([
        ['no access_token', () => json({ token_type: 'Bearer' })],
        ['no JSON', () => new Response('<html>', { status: 200 })],
    ])('fails a token answer with %s permanently', async (_, token) => {
        const { transport } = setup({ token });

        await expect(transport.read('remote-1', opts())).rejects.toBeInstanceOf(ValidationError);
    });

    it.each([
        ['429 with Retry-After', () => json({ error: 'slow_down' }, { status: 429, headers: { 'retry-after': '30' } }), 30_000],
        ['503', () => new Response('', { status: 503 }), undefined],
        ['500', () => new Response('', { status: 500 }), undefined],
    ])('keeps a token request answered with %s retryable', async (_, token, retryAfterMs) => {
        const { transport } = setup({ token });

        const error = await rejection(transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);
        expect(error.retryAfterMs).toBe(retryAfterMs);
    });

    it('keeps a token answer whose body fails in transfer retryable, and refuses one that is no JSON', async () => {
        const broken = setup({
            token: () => new Response(new ReadableStream({
                start(controller) {
                    controller.error(new TypeError('terminated'));
                },
            }), { status: 200, headers: { 'content-type': 'application/json' } }),
        });
        const error = await rejection(broken.transport.read('remote-1', opts()));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect(error).not.toBeInstanceOf(ValidationError);

        const garbled = setup({ token: () => new Response('not json', { status: 200 }) });

        await expect(garbled.transport.read('remote-1', opts())).rejects.toBeInstanceOf(ValidationError);
    });

    it('redacts a token superseded by a refresh, not only the current one', async () => {
        let issued = 0;
        const fake = createFakeFetch((request) => {
            if (request.url === `${AUTHUP}/token`) {
                issued += 1;

                return json({ access_token: `access-token-${issued}`, expires_in: 3_600 });
            }

            // the peer echoes both bearers it saw
            return json({ code: 'unauthorized', message: 'Saw access-token-1 and access-token-2.' }, { status: 401 });
        });
        const resolver = createPeerResolver({
            peers: {
                dev: {
                    url: 'https://dev.example',
                    outgoing: {
                        authup: {
                            url: AUTHUP,
                            clientId: 'chamvi-assistants',
                            clientSecret: SECRET,
                        },
                    },
                },
            },
            clock: new ControllableClock(new Date('2026-11-19T10:00:00Z')),
            fetch: fake.fetch,
        });

        const error = await rejection(resolver.transport('dev').read('remote-1', opts()));

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).not.toContain('access-token-1');
        expect(error.message).not.toContain('access-token-2');
    });

    it('keeps a token request that hit a network error retryable', async () => {
        const { transport } = setup({
            token: () => {
                throw new TypeError('fetch failed');
            },
        });

        await expect(transport.read('remote-1', opts())).rejects.toBeInstanceOf(PeerRequestError);
    });
});
