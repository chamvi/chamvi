/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { gzipSync } from 'node:zlib';
import {
    DBody,
    DController,
    DPost,
    decorators,
} from '@routup/decorators';
import { App, defineCoreHandler } from 'routup';
import { describe, expect, it } from 'vitest';
import { HTTP_CONTEXT } from '../../../src/app/constants.ts';
import { buildContext, createErrorHandler } from '../../../src/app/helpers.ts';
import {
    ForceLoggedInMiddleware,
    JsonBodyMiddleware,
    RequiredJsonBodyMiddleware,
} from '../../../src/middleware/index.ts';
import { ADMIN_TOKEN, createTestApp, testAuth } from '../../utils/app.ts';

const LIMIT = 64;

@DController('/probe')
class ProbeController {
    @DPost('/optional', [ForceLoggedInMiddleware, JsonBodyMiddleware])
    async optional(@DBody() body: unknown): Promise<{ body: unknown }> {
        return { body };
    }

    @DPost('/required', [ForceLoggedInMiddleware, RequiredJsonBodyMiddleware])
    async required(@DBody() body: unknown): Promise<{ body: unknown }> {
        return { body };
    }
}

function probeApp(): App {
    const { engine } = createTestApp();
    const ctx = buildContext({
        engine, 
        auth: testAuth, 
        bodyLimit: LIMIT, 
    });
    const app = new App();

    app.use(defineCoreHandler((event) => {
        event.store[HTTP_CONTEXT] = ctx;

        return event.next();
    }));
    app.use(decorators({ controllers: [new ProbeController()] }));
    app.use(createErrorHandler(ctx));

    return app;
}

type PostOptions = {
    body?: BodyInit;
    token?: string;
    headers?: Record<string, string>;
};

function post(app: App, path: string, options: PostOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers };

    if (options.token !== undefined) {
        headers.authorization = `Bearer ${options.token}`;
    }

    return app.fetch(new Request(`http://test/probe${path}`, {
        method: 'POST',
        headers,
        body: options.body,
        // a streamed body needs half duplex
        ...(options.body instanceof ReadableStream ? { duplex: 'half' } : {}),
    } as RequestInit));
}

function streamOf(sizes: number[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            for (const size of sizes) {
                controller.enqueue(new Uint8Array(size).fill(0x20));
            }

            controller.close();
        },
    });
}

const JSON_HEADERS = { 'content-type': 'application/json' };

describe('the JSON body middleware behind @DBody()', () => {
    it.each(['/optional', '/required'])('hands %s the parsed body', async (path) => {
        const app = probeApp();
        const response = await post(app, path, {
            token: ADMIN_TOKEN, 
            body: '{"a":1}', 
            headers: JSON_HEADERS, 
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ body: { a: 1 } });

        const patch = await post(app, path, {
            token: ADMIN_TOKEN,
            body: '{"a":1}',
            headers: { 'content-type': 'application/merge-patch+json' },
        });

        expect(patch.status).toBe(200);
        expect(await patch.json()).toEqual({ body: { a: 1 } });
    });

    it('reads an empty body as {} on an optional route', async () => {
        const response = await post(probeApp(), '/optional', { token: ADMIN_TOKEN });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ body: {} });
    });

    it('refuses an empty body on a required route', async () => {
        const response = await post(probeApp(), '/required', { token: ADMIN_TOKEN });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ message: 'The request needs a JSON body.' });
    });

    it('refuses a non-empty body without a JSON media type with 415', async () => {
        const app = probeApp();
        const untyped = await post(app, '/optional', { token: ADMIN_TOKEN, body: new Uint8Array([0x7B, 0x7D]) });

        expect(untyped.status).toBe(415);

        const text = await post(app, '/optional', {
            token: ADMIN_TOKEN, 
            body: '{}', 
            headers: { 'content-type': 'text/plain' }, 
        });

        expect(text.status).toBe(415);
    });

    it('refuses invalid JSON with 400', async () => {
        const response = await post(probeApp(), '/optional', {
            token: ADMIN_TOKEN, 
            body: '{', 
            headers: JSON_HEADERS, 
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ message: 'The request body is not valid JSON.' });
    });

    it('refuses a body over the limit with 413 and closes a connection with more left', async () => {
        const response = await post(probeApp(), '/optional', {
            token: ADMIN_TOKEN, 
            body: streamOf([40, 40, 40, 40]), 
            headers: JSON_HEADERS, 
        });

        expect(response.status).toBe(413);
        expect(response.headers.get('connection')).toBe('close');
    });

    it('answers 401 without a token before reading a body over the limit', async () => {
        let reads = 0;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                reads++;
                controller.enqueue(new Uint8Array(LIMIT * 4).fill(0x20));
            },
        }, { highWaterMark: 0 });
        const response = await post(probeApp(), '/optional', { body, headers: JSON_HEADERS });

        expect(response.status).toBe(401);
        expect(reads).toBe(0);
    });

    it('never decompresses a body, so @routup/body did not read it', async () => {
        const response = await post(probeApp(), '/optional', {
            token: ADMIN_TOKEN,
            body: gzipSync('{"a":1}'),
            headers: { ...JSON_HEADERS, 'content-encoding': 'gzip' },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ message: 'The request body is not valid JSON.' });
    });
});
