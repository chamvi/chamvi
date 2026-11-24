/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { HttpRoute, RateLimitOptions } from '@chamvi/http';
import type { App, IAppEvent } from 'routup';
import {
    isOperationalPath,
    isStreamRequest,
    isUnlimitedRoute,
} from '../../../src/plugins/helpers.ts';
import {
    ADMIN_TOKEN,
    call,
    createRunTestApp,
    createTestApp,
} from '../../utils/app.ts';
import type { CallOptions, TestAppOverrides } from '../../utils/app.ts';
import { recordLabels, request } from '../../utils/metrics.ts';

type RequestOptions = {
    method?: string;
    ip?: string;
    token?: string;
    headers?: Record<string, string>;
};

/** A request with a socket address (routup reads `request.ip`). */
function send(app: App, path: string, options: RequestOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers);

    if (options.token) {
        headers.set('authorization', `Bearer ${options.token}`);
    }

    const request = new Request(`http://test${path}`, { method: options.method ?? 'GET', headers });

    (request as Request & { ip?: string }).ip = options.ip ?? '10.0.0.1';

    return app.fetch(request);
}

describe('metrics', () => {
    it('serves /metrics by default, one registry per app', async () => {
        const first = createTestApp({ metrics: undefined });
        const second = createTestApp({ metrics: undefined });

        for (const { app } of [first, second]) {
            await send(app, '/healthz');

            const response = await send(app, '/metrics');

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/plain');
            expect(await response.text()).toContain('http_request_duration');
        }
    });

    it('is off with metrics: false', async () => {
        const { app } = createTestApp({ metrics: false });

        expect((await send(app, '/metrics')).status).toBe(404);
    });

    it('does not time sse streams', async () => {
        const { app, engine } = createRunTestApp({ metrics: undefined });
        const started = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN });
        const { runId } = await started.json() as { runId: string };

        await engine.start();
        await engine.idle();

        const stream = await send(app, `/runs/${runId}/stream`, { token: ADMIN_TOKEN });

        await stream.text();
        await send(app, '/agents', { token: ADMIN_TOKEN });

        const metrics = await (await send(app, '/metrics')).text();
        const samples = metrics.split('\n').filter((line) => line.startsWith('http_request_duration'));

        expect(samples.some((line) => line.includes('/agents'))).toBe(true);
        expect(samples.some((line) => line.includes('/stream'))).toBe(false);
        await engine.drain();
    });

    function pathLabels(metrics: string): Set<string> {
        const labels = new Set<string>();

        for (const match of metrics.matchAll(/path="([^"]*)"/g)) {
            labels.add(match[1]!);
        }

        return labels;
    }

    it('labels requests by route template, not by raw path', async () => {
        const { app } = createRunTestApp({ metrics: undefined, basePath: '/api' });

        for (let i = 0; i < 5; i++) {
            await send(app, `/api/runs/${crypto.randomUUID()}`, { token: ADMIN_TOKEN });
            await send(app, `/api/runs/${crypto.randomUUID()}/cancel`, { method: 'POST' });
            await send(app, `/api/runs/${crypto.randomUUID()}/approve`, { method: 'POST' });
            await send(app, `/api/nope/${crypto.randomUUID()}`);
            await send(app, `/api/agents/echo/state/kv/k${i}`, { token: ADMIN_TOKEN });
            await send(app, '/api/agents/echo/state/kv', { token: ADMIN_TOKEN });
            await send(app, '/api/me', { token: ADMIN_TOKEN });
            await send(app, `/api/channels/webhook/hooked/x${i}/y`, { method: 'POST' });
            await send(app, `/api/hooks/hooked/x${i}/y`, { method: 'POST' });
            await send(app, `/api/runs/${crypto.randomUUID()}/artifacts`, { token: ADMIN_TOKEN });
            await send(app, `/api/runs/${crypto.randomUUID()}/artifacts/${crypto.randomUUID()}`, { token: ADMIN_TOKEN });
        }

        const labels = pathLabels(await (await send(app, '/api/metrics')).text());

        expect([...labels].sort()).toEqual([
            '/_unmatched',
            '/agents/:name/state/kv',
            '/agents/:name/state/kv/:key',
            '/channels/webhook/*',
            '/me',
            '/runs/:id',
            '/runs/:id/approve',
            '/runs/:id/artifacts',
            '/runs/:id/artifacts/:artifactId',
            '/runs/:id/cancel',
        ]);
    });

    it('does not time rate-limited requests', async () => {
        const { app } = createTestApp({ metrics: undefined, rateLimit: { max: 1 } });

        await send(app, '/agents');
        expect((await send(app, '/agents')).status).toBe(429);

        const metrics = await (await send(app, '/metrics')).text();

        expect(metrics).not.toContain('status_code="429"');
    });
});

describe('cors', () => {
    it('answers a preflight when configured', async () => {
        const { app } = createTestApp({ cors: { origin: 'https://ui.test' } });
        const response = await send(app, '/runs', {
            method: 'OPTIONS',
            headers: { origin: 'https://ui.test', 'access-control-request-method': 'GET' },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('https://ui.test');
    });

    it('is off by default', async () => {
        const { app } = createTestApp();
        const response = await send(app, '/agents', { token: ADMIN_TOKEN, headers: { origin: 'https://ui.test' } });

        expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('keeps the cors headers on error responses', async () => {
        const { app } = createTestApp({ cors: { origin: 'https://ui.test' } });
        const headers = { origin: 'https://ui.test' };
        const notFound = await send(app, '/runs/nope', { token: ADMIN_TOKEN, headers });

        expect(notFound.status).toBe(404);
        expect(notFound.headers.get('access-control-allow-origin')).toBe('https://ui.test');
        expect(notFound.headers.get('content-type')).toBe('application/json; charset=utf-8');

        const unauthorized = await send(app, '/agents', { headers });

        expect(unauthorized.status).toBe(401);
        expect(unauthorized.headers.get('access-control-allow-origin')).toBe('https://ui.test');
        expect(unauthorized.headers.get('www-authenticate')).toBe('Bearer');
    });

    it('never rate limits a preflight', async () => {
        const { app } = createTestApp({ cors: { origin: 'https://ui.test' }, rateLimit: { max: 1 } });

        for (let i = 0; i < 3; i++) {
            const response = await send(app, '/runs', {
                method: 'OPTIONS',
                headers: { origin: 'https://ui.test', 'access-control-request-method': 'GET' },
            });

            expect(response.status).toBe(204);
        }

        expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
    });
});

describe('rate limit', () => {
    it('answers 429 JSON over the limit', async () => {
        const { app } = createTestApp({ rateLimit: { max: 2 } });

        expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
        expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);

        const limited = await send(app, '/agents', { token: ADMIN_TOKEN });

        expect(limited.status).toBe(429);
        expect(await limited.json()).toEqual({
            status: 429,
            code: 'too_many_requests',
            message: 'Too many requests, please try again later.',
        });
        expect(limited.headers.get('retry-after')).not.toBeNull();
        expect(limited.headers.get('ratelimit-limit')).toBe('2');
        expect(limited.headers.get('ratelimit-remaining')).toBe('0');
    });

    it('keys by client address', async () => {
        const { app } = createTestApp({ rateLimit: { max: 1 } });

        expect((await send(app, '/agents', { token: ADMIN_TOKEN, ip: '10.0.0.1' })).status).toBe(200);
        expect((await send(app, '/agents', { token: ADMIN_TOKEN, ip: '10.0.0.2' })).status).toBe(200);
        expect((await send(app, '/agents', { token: ADMIN_TOKEN, ip: '10.0.0.1' })).status).toBe(429);
    });

    it('skips health and metrics', async () => {
        const { app } = createTestApp({ rateLimit: { max: 2 }, metrics: undefined });

        for (let i = 0; i < 5; i++) {
            expect((await send(app, '/healthz')).status).toBe(200);
            expect((await send(app, '/readyz')).status).toBe(200);
            expect((await send(app, '/metrics')).status).toBe(200);
        }
    });

    it('skips health under a basePath', async () => {
        const { app } = createTestApp({ rateLimit: { max: 1 }, basePath: '/api' });

        for (let i = 0; i < 3; i++) {
            expect((await send(app, '/api/healthz')).status).toBe(200);
        }
    });

    it('skips health under a basePath given with a trailing slash', async () => {
        const { app } = createTestApp({ rateLimit: { max: 1 }, basePath: '/api/' });

        for (let i = 0; i < 3; i++) {
            expect((await send(app, '/api/healthz')).status).toBe(200);
        }
    });

    it('limits a health path in another case: routup serves it nowhere', async () => {
        const { app } = createTestApp({ rateLimit: { max: 1 } });

        expect((await send(app, '/HEALTHZ')).status).toBe(404);
        expect((await send(app, '/HEALTHZ')).status).toBe(429);
        expect((await send(app, '/healthz')).status).toBe(200);
    });

    it('skips the limiter for every path of an unlimited prefix route', async () => {
        const { app } = createTestApp({
            rateLimit: { max: 1 },
            basePath: '/api',
            routes: [{
                method: 'GET',
                path: '/ui',
                prefix: true,
                rateLimit: false,
                handler: async () => ({ status: 200, body: 'ok' }),
            }],
        });

        for (let i = 0; i < 3; i++) {
            expect((await send(app, '/api/ui')).status).toBe(200);
            expect((await send(app, `/api/ui/assets/a${i}.js`)).status).toBe(200);
        }

        expect((await send(app, '/api/agents', { token: ADMIN_TOKEN })).status).toBe(200);
        expect((await send(app, '/api/agents', { token: ADMIN_TOKEN })).status).toBe(429);
    });

    it('limits a path of an unlimited prefix route in another case', async () => {
        const { app } = createTestApp({
            rateLimit: { max: 1 },
            routes: [{
                method: 'GET',
                path: '/ui',
                prefix: true,
                rateLimit: false,
                handler: async () => ({ status: 200, body: 'ok' }),
            }],
        });

        expect((await send(app, '/UI/assets/a.js')).status).toBe(404);
        expect((await send(app, '/UI/assets/a.js')).status).toBe(429);
        expect((await send(app, '/ui/assets/a.js')).status).toBe(200);
    });

    it('takes the proxy setting from the app\'s trustProxy only', () => {
        // @ts-expect-error the library's own trustProxy is never read: chamvi keys by getRequestIP
        const options: Partial<RateLimitOptions> = { trustProxy: false };

        expect(options).toBeDefined();
    });

    it('is off with rateLimit: false', async () => {
        const { app } = createTestApp({ rateLimit: false });

        for (let i = 0; i < 10; i++) {
            expect((await send(app, '/agents', { token: ADMIN_TOKEN })).status).toBe(200);
        }
    });

    it('ignores a rotating X-Forwarded-For unless trustProxy is set', async () => {
        const spoof = async (app: App) => {
            const statuses: number[] = [];

            for (let n = 1; n <= 3; n++) {
                statuses.push((await send(app, '/agents', {
                    token: ADMIN_TOKEN,
                    headers: { 'x-forwarded-for': `1.2.3.${n}` },
                })).status);
            }

            return statuses;
        };

        expect(await spoof(createTestApp({ rateLimit: { max: 2 } }).app)).toEqual([200, 200, 429]);
        expect(await spoof(createTestApp({ rateLimit: { max: 2 }, trustProxy: true }).app)).toEqual([200, 200, 200]);
    });
});

describe('route labels', () => {
    const extra = (path: string, prefix?: true, method: HttpRoute['method'] = 'POST'): HttpRoute => ({
        method,
        path,
        ...(prefix ? { prefix } : {}),
        handler: async () => ({ status: 204 }),
    });

    /** The `path` label of each request, sent in order to an app with the given options. */
    async function labelsOf(
        overrides: TestAppOverrides,
        requests: ReadonlyArray<readonly [method: string, path: string, options?: CallOptions]>,
    ): Promise<string[]> {
        const recorder = recordLabels();
        const { app } = createTestApp({ ...overrides, metrics: recorder.metrics });

        for (const [method, path, options] of requests) {
            await request(app, method, path, options);
        }

        return recorder.labels;
    }

    it.each([
        ['outer first', ['/ui', '/ui/ext/mail']],
        ['inner first', ['/ui/ext/mail', '/ui']],
    ])('labels a nested prefix route by the most specific one (%s)', async (_order, paths) => {
        const routes = paths.map((path) => extra(path, true));

        expect(await labelsOf({ routes }, [
            ['POST', '/ui/ext/mail/accounts'],
            ['POST', '/ui/agents'],
        ])).toEqual(['/ui/ext/mail/*', '/ui/*']);
    });

    it.each([
        ['outer first', '/ui', ['/ui', '/ui/ext/mail']],
        ['inner first', '/ui', ['/ui/ext/mail', '/ui']],
        ['outer first', '/ui/ext/mail', ['/ui', '/ui/ext/mail']],
        ['inner first', '/ui/ext/mail', ['/ui/ext/mail', '/ui']],
    ])('applies the rate limit choice of the most specific route (%s, %s unlimited)', (_order, free, paths) => {
        const routes = paths.map((path): HttpRoute => ({
            ...extra(path, true),
            ...(path === free ? { rateLimit: false as const } : {}),
        }));
        const unlimited = (path: string) => isUnlimitedRoute({ method: 'POST', path } as IAppEvent, '', routes);

        expect(unlimited('/ui/agents')).toBe(free === '/ui');
        expect(unlimited('/ui/ext/mail/x')).toBe(free === '/ui/ext/mail');
    });

    it('labels an extra route by its path, a path no route serves /_unmatched', async () => {
        expect(await labelsOf({ routes: [extra('/webhooks/github')] }, [['POST', '/webhooks/github']])).toEqual(['/webhooks/github']);
        expect(await labelsOf({}, [['POST', '/webhooks/github']])).toEqual(['/_unmatched']);
    });

    it('labels an extra route under basePath', async () => {
        expect(await labelsOf({ basePath: '/api', routes: [extra('/webhooks/github')] }, [['POST', '/api/webhooks/github']])).toEqual(['/webhooks/github']);
    });

    it('labels a prefix route <path>/*', async () => {
        expect(await labelsOf({ basePath: '/api', routes: [extra('/ui', true, 'GET')] }, [
            ['GET', '/api/ui'],
            ['GET', '/api/ui/'],
            ['GET', '/api/ui/assets/app-1.js'],
            ['GET', '/api/UI/assets/app-1.js'],
            ['GET', '/api/uix'],
        ])).toEqual(['/ui/*', '/ui/*', '/ui/*', '/_unmatched', '/_unmatched']);
        // a plain route matches its path only
        expect(await labelsOf({ basePath: '/api', routes: [extra('/ui', undefined, 'GET')] }, [['GET', '/api/ui/x']])).toEqual(['/_unmatched']);
    });

    it('labels a path in another case /_unmatched: routup matches static segments case-sensitively', async () => {
        expect(await labelsOf({ routes: [extra('/webhooks/github')] }, [
            ['POST', '/Webhooks/GitHub'],
            ['GET', '/RUNS/abc', { token: ADMIN_TOKEN }],
            ['GET', '/HEALTHZ'],
            ['POST', '/authorization/check', { token: ADMIN_TOKEN, body: { permissions: [] } }],
        ])).toEqual(['/_unmatched', '/_unmatched', '/_unmatched', '/authorization/check']);
        expect(await labelsOf({ basePath: '/api', routes: [extra('/webhooks/github')] }, [['POST', '/api/Webhooks/github']])).toEqual(['/_unmatched']);
    });

    it('labels a channel route per channel, its subpaths included', async () => {
        expect(await labelsOf({ basePath: '/api' }, [
            ['POST', '/api/channels/webhook'],
            ['POST', '/api/channels/webhook/'],
            ['POST', '/api/channels/webhook/hooked/x/y'],
            ['POST', '/api/channels/other/x'],
        ])).toEqual(['/channels/webhook/*', '/channels/webhook/*', '/channels/webhook/*', '/_unmatched']);
    });

    it('labels the method-less mounts by a fixed label', async () => {
        expect(await labelsOf({ basePath: '/api' }, [
            ['POST', '/api/mcp'],
            ['GET', '/api/mcp'],
            ['GET', '/api/mcp/x'],
            ['GET', '/api/docs'],
            ['GET', '/api/docs/'],
            ['GET', '/api/docs/a/b'],
        ])).toEqual(['/mcp', '/mcp', '/_unmatched', '/docs', '/docs', '/docs/*']);
    });

    it('labels a method no route of the path is bound to, and OPTIONS, /_unmatched', async () => {
        expect(await labelsOf({ routes: [extra('/hooks/x')] }, [
            ['DELETE', '/runs/abc', { token: ADMIN_TOKEN }],
            ['POST', '/healthz'],
            ['GET', '/hooks/x'],
            ['GET', '/channels/webhook'],
            ['OPTIONS', '/runs/abc'],
            ['HEAD', '/runs/abc', { token: ADMIN_TOKEN }],
        ])).toEqual(['/_unmatched', '/_unmatched', '/_unmatched', '/_unmatched', '/_unmatched', '/runs/:id']);
    });

    it('labels a request refused by a route\'s middleware and a route that throws by that route', async () => {
        expect(await labelsOf({
            basePath: '/api',
            routes: [{
                method: 'GET',
                path: '/boom',
                handler: async () => {
                    throw new Error('boom');
                },
            }],
        }, [
            ['GET', '/api/agents'],
            ['GET', '/api/runs/abc'],
            ['GET', '/api/boom'],
        ])).toEqual(['/agents', '/runs/:id', '/boom']);
    });

    it('labels the run stream by its route when it is timed', async () => {
        const recorder = recordLabels(() => false);
        const { app, engine } = createRunTestApp({ basePath: '/api', metrics: recorder.metrics });
        const { runId } = await engine.dispatch({
            agent: 'echo',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });
        const controller = new AbortController();
        const stream = await call(app, 'GET', `/api/runs/${runId}/stream`, { token: ADMIN_TOKEN, signal: controller.signal });

        expect(stream.status).toBe(200);
        await stream.body?.cancel();
        controller.abort();

        expect(recorder.labels).toEqual(['/runs/:id/stream']);
    });

    it('keeps the metrics path first', async () => {
        const recorder = recordLabels();
        const { app } = createTestApp({ basePath: '/api', metrics: { ...recorder.metrics, metricsPath: '/Stats' } });

        await request(app, 'GET', '/api/stats');
        await request(app, 'GET', '/api/Stats');

        expect(recorder.labels).toEqual(['/_unmatched', '/Stats']);
    });

    it('never labels a request by its raw path', async () => {
        const labels = await labelsOf({ basePath: '/api' }, [
            ['GET', '/api/nope/x7'],
            ['GET', '/api/docs/x7'],
            ['POST', '/api/channels/x7'],
            ['GET', '/api/runs/x7', { token: ADMIN_TOKEN }],
            ['GET', '/x7'],
        ]);

        expect(labels.some((label) => label.includes('x7'))).toBe(false);
    });

    it('matches operational paths and the stream in their own case only, like routup', () => {
        const event = (method: string, path: string) => ({ method, path } as IAppEvent);

        expect(isOperationalPath(event('GET', '/healthz'), '', '/metrics')).toBe(true);
        expect(isOperationalPath(event('GET', '/api/Stats/'), '/api', '/Stats')).toBe(true);
        expect(isOperationalPath(event('GET', '/HEALTHZ'), '', '/metrics')).toBe(false);
        expect(isOperationalPath(event('GET', '/Api/metrics'), '/api', '/metrics')).toBe(false);
        expect(isOperationalPath(event('GET', '/api/stats'), '/api', '/Stats')).toBe(false);
        expect(isStreamRequest(event('GET', '/runs/abc/stream'), '')).toBe(true);
        expect(isStreamRequest(event('GET', '/RUNS/abc/Stream'), '')).toBe(false);
    });
});
