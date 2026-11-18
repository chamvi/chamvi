/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RequestOptions } from 'hapic';
import { 
    describe, 
    expect, 
    it, 
    vi, 
} from 'vitest';
import { ApiError, BaseAPI, ClientAuthenticationHook } from '@chamvi/http-kit';
import type { APIRequestOptions, Client, ClientAuthenticationHookOptions } from '@chamvi/http-kit';
import { createTestClient } from '../../utils/client.ts';
import { json } from '../../utils/fetch.ts';
import type { FakeAnswer } from '../../utils/fetch.ts';

class TestAPI extends BaseAPI {
    get(url: string, options?: APIRequestOptions) {
        return this.request<unknown>({ url, method: 'GET' } as RequestOptions, options);
    }
}

function setup(answers: FakeAnswer[], options: Partial<ClientAuthenticationHookOptions> = {}) {
    const { client, requests } = createTestClient(answers);
    const hook = new ClientAuthenticationHook({ token: async () => 'a', ...options });

    hook.attach(client);

    return {
        api: new TestAPI({ client }),
        client: client as Client,
        hook,
        requests,
    };
}

const unauthorized = () => json({ code: 'unauthorized', message: 'no' }, 401);

describe('ClientAuthenticationHook', () => {
    it('sends the bearer of token()', async () => {
        const { api, requests } = setup([json({})]);

        await api.get('/me');
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer a');
    });

    it('sends no authorization without a token', async () => {
        const { api, requests } = setup([json({})], { token: async () => undefined });

        await api.get('/me');
        expect(requests[0]!.headers.has('authorization')).toBe(false);
    });

    it('refreshes once on a 401 and retries with the new token', async () => {
        let token = 'a';
        const refresh = vi.fn(async () => {
            token = 'b';

            return true;
        });
        const onUnauthorized = vi.fn();
        const { api, requests } = setup([unauthorized(), json({ ok: true })], {
            token: async () => token, 
            refresh, 
            onUnauthorized, 
        });

        await expect(api.get('/runs')).resolves.toEqual({ ok: true });
        expect(requests.map((request) => request.url)).toEqual(['/api/runs', '/api/runs']);
        expect(requests[1]!.headers.get('authorization')).toBe('Bearer b');
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('calls onUnauthorized once when the 401 stands after the retry', async () => {
        const refresh = vi.fn(async () => true);
        const onUnauthorized = vi.fn();
        const { api, requests } = setup([unauthorized(), unauthorized()], { refresh, onUnauthorized });
        const error = await api.get('/runs').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
        expect(requests).toHaveLength(2);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('calls onUnauthorized when refresh answers false, throws or is missing', async () => {
        for (const refresh of [async () => false, async () => {
            throw new Error('refresh failed');
        }, undefined]) {
            const onUnauthorized = vi.fn();
            const { api, requests } = setup([unauthorized()], { refresh, onUnauthorized });

            await expect(api.get('/runs')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
            expect(requests).toHaveLength(1);
            expect(onUnauthorized).toHaveBeenCalledTimes(1);
        }
    });

    it('leaves a fixed token alone: no refresh, no onUnauthorized', async () => {
        const refresh = vi.fn(async () => true);
        const onUnauthorized = vi.fn();
        const token = vi.fn(async () => 'a');
        const { api, requests } = setup([unauthorized()], {
            token, 
            refresh, 
            onUnauthorized, 
        });

        await expect(api.get('/me', { token: 'pasted' })).rejects.toMatchObject({ status: 401 });
        expect(requests).toHaveLength(1);
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer pasted');
        expect(token).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('does not refresh a 403', async () => {
        const refresh = vi.fn(async () => true);
        const { api } = setup([json({ code: 'forbidden', message: 'no' }, 403)], { refresh });

        await expect(api.get('/runs')).rejects.toMatchObject({ status: 403 });
        expect(refresh).not.toHaveBeenCalled();
    });

    it('attaches once per client and detaches', async () => {
        const token = vi.fn(async () => 'a');
        const {
            api, 
            client, 
            hook, 
            requests, 
        } = setup([json({}), json({})], { token });

        hook.attach(client);
        await api.get('/me');
        expect(token).toHaveBeenCalledTimes(1);
        expect(hook.isAttached(client)).toBe(true);

        hook.detach(client);
        expect(hook.isAttached(client)).toBe(false);
        await api.get('/me');
        expect(requests[1]!.headers.has('authorization')).toBe(false);
    });
});
