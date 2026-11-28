/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RequestOptions } from 'hapic';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    ApiError,
    BaseAPI,
    Client,
    FIXED_TOKEN,
    REQUEST_TIMEOUT_MS,
    buildRequestConfig,
} from '@chamvi/http-kit';
import type { APIRequestOptions } from '@chamvi/http-kit';
import { createTestClient } from '../../utils/client.ts';
import { json, sse } from '../../utils/responses.ts';
import { SilentTransport } from '../../utils/silent-transport.ts';

class TestAPI extends BaseAPI {
    get<T>(url: string, options?: APIRequestOptions) {
        return this.request<T>({ url, method: 'GET' }, options);
    }

    raw(config: RequestOptions, options?: APIRequestOptions) {
        return this.requestRaw(config, options);
    }
}

const apiOf = (client: Client) => new TestAPI({ client });

describe('BaseAPI.request', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('decodes a JSON answer under the client base', async () => {
        const { client, requests } = createTestClient([json({ a: 1 })]);

        await expect(apiOf(client).get('/runs')).resolves.toEqual({ a: 1 });
        expect(requests[0]!.url).toBe('/api/runs');
        expect(requests[0]!.headers.get('accept')).toBe('application/json');
    });

    it('maps a JSON error body to ApiError', async () => {
        const { client } = createTestClient([json({ code: 'agent_replaced', message: 'replaced' }, 409)]);
        const error = await apiOf(client).get('/runs').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
            status: 409, 
            code: 'agent_replaced', 
            message: 'replaced', 
        });
    });

    it('maps a non-JSON error body to http_<status>', async () => {
        const { client } = createTestClient([new Response('<html>', {
            status: 502, 
            statusText: 'Bad Gateway', 
            headers: { 'content-type': 'text/html' }, 
        })]);

        await expect(apiOf(client).get('/runs')).rejects.toMatchObject({
            status: 502, 
            code: 'http_502', 
            message: 'Bad Gateway', 
        });
    });

    it('maps a 200 HTML body to invalid_response', async () => {
        const { client } = createTestClient([new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })]);

        await expect(apiOf(client).get('/runs')).rejects.toMatchObject({
            status: 200, 
            code: 'invalid_response', 
            message: 'The API answered no JSON.', 
        });
    });

    it('returns undefined for an empty answer', async () => {
        const { client } = createTestClient([new Response(null, { status: 204 })]);

        await expect(apiOf(client).get('/runs')).resolves.toBeUndefined();
    });

    it('maps a transport failure to network_error', async () => {
        const { client } = createTestClient([() => {
            throw new TypeError('Failed to fetch');
        }]);

        await expect(apiOf(client).get('/runs')).rejects.toMatchObject({
            status: 0, 
            code: 'network_error', 
            message: 'Failed to fetch', 
        });
    });

    it('times out without an answer within the client timeoutMs', async () => {
        vi.useFakeTimers();

        const transport = new SilentTransport();
        const { signals } = transport;
        const client = new Client({ baseURL: '/api', transport });
        const outcome = apiOf(client).get('/me').catch((e: unknown) => e);

        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
        expect(signals[0]!.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        expect(await outcome).toMatchObject({
            status: 0, 
            code: 'timeout', 
            message: 'The API did not answer in time.', 
        });
    });

    it('takes the deadline from timeoutMs and the call option', async () => {
        vi.useFakeTimers();

        const transport = new SilentTransport();
        const client = new Client({
            baseURL: '/api', 
            transport,
            timeoutMs: 50, 
        });
        const first = apiOf(client).get('/me').catch((e: unknown) => e);

        await vi.advanceTimersByTimeAsync(50);
        expect(await first).toMatchObject({ code: 'timeout' });

        const second = apiOf(client).get('/me', { timeout: 10 }).catch((e: unknown) => e);

        await vi.advanceTimersByTimeAsync(10);
        expect(await second).toMatchObject({ code: 'timeout' });
    });

    it('does not cut a stream once the answer is there', async () => {
        vi.useFakeTimers();

        const { client, requests } = createTestClient([sse(['data: 1\n\n'])]);
        const response = await apiOf(client).raw({
            url: '/runs/r1/stream', 
            method: 'GET', 
            responseType: 'stream', 
        });

        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
        expect(requests[0]!.signal?.aborted).toBe(false);
        expect(response.data).toBeInstanceOf(ReadableStream);
    });

    it('passes the caller\'s abort through and never aborts the caller\'s signal on a timeout', async () => {
        vi.useFakeTimers();

        const client = new Client({ baseURL: '/api', transport: new SilentTransport() });
        const aborted = new AbortController();
        const first = apiOf(client).get('/connections', { signal: aborted.signal }).catch((e: unknown) => e);

        aborted.abort();

        const error = await first;

        expect(error).not.toBeInstanceOf(ApiError);
        expect((error as Error).name).toBe('AbortError');
        expect(vi.getTimerCount()).toBe(0);

        const kept = new AbortController();
        const second = apiOf(client).get('/connections', { signal: kept.signal }).catch((e: unknown) => e);

        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
        expect(await second).toMatchObject({ code: 'timeout' });
        expect(kept.signal.aborted).toBe(false);
    });

    it('does not start a request whose signal is already aborted', async () => {
        const transport = new SilentTransport();
        const { signals } = transport;
        const client = new Client({ baseURL: '/api', transport });
        const controller = new AbortController();

        controller.abort();

        const error = await apiOf(client).get('/connections', { signal: controller.signal }).catch((e: unknown) => e);

        expect((error as Error).name).toBe('AbortError');
        expect(signals).toHaveLength(0);
    });
});

describe('buildRequestConfig', () => {
    it('fixes the bearer of a call and marks it', () => {
        const config = buildRequestConfig({ token: 't' });

        expect(new Headers(config.headers).get('authorization')).toBe('Bearer t');
        expect(FIXED_TOKEN in config).toBe(true);
        expect(FIXED_TOKEN in buildRequestConfig({})).toBe(false);
    });
});

describe('domain APIs', () => {
    const { client } = createTestClient([]);

    // the documented arguments, `options?: APIRequestOptions` last: `fn.length` counts every declared parameter
    it.each([
        ['account.getMe', client.account.getMe, 1],
        ['agent.getMany', client.agent.getMany, 1],
        ['agent.startRun', client.agent.startRun, 3],
        ['artifact.getMany', client.artifact.getMany, 2],
        ['artifact.read', client.artifact.read, 3],
        ['authorization.check', client.authorization.check, 2],
        ['component.getMany', client.component.getMany, 1],
        ['connection.getMany', client.connection.getMany, 1],
        ['connection.getOne', client.connection.getOne, 2],
        ['connection.reset', client.connection.reset, 2],
        ['connection.stream', client.connection.stream, 2],
        ['connection.getConfig', client.connection.getConfig, 2],
        ['connection.create', client.connection.create, 3],
        ['connection.save', client.connection.save, 3],
        ['connection.delete', client.connection.delete, 2],
        ['connection.test', client.connection.test, 2],
        ['connectionType.getMany', client.connectionType.getMany, 1],
        ['run.getMany', client.run.getMany, 2],
        ['run.getOne', client.run.getOne, 2],
        ['run.getPeerView', client.run.getPeerView, 2],
        ['run.cancel', client.run.cancel, 2],
        ['run.wake', client.run.wake, 2],
        ['run.approve', client.run.approve, 3],
        ['run.stream', client.run.stream, 3],
        ['schedule.getMany', client.schedule.getMany, 1],
        ['state.getKv', client.state.getKv, 3],
        ['state.getDocs', client.state.getDocs, 4],
        ['uiPage.getMany', client.uiPage.getMany, 1],
    ] as const)('%s ends with the request options', (_name, fn, arity) => {
        expect(fn.length).toBe(arity);
    });
});
