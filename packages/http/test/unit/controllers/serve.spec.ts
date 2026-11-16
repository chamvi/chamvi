/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ControllableClock } from '@chamvi/test-kit';
import type { App } from 'routup';
import type { TestAppOverrides } from '../../utils/app.ts';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    tokenFor,
} from '../../utils/app.ts';
import { NOTE_PERMISSION, NoteController, NoteService } from '../../utils/controllers.ts';

function noteApp(overrides: TestAppOverrides = {}) {
    const clock = new ControllableClock(new Date(1_000_000));

    return createTestApp({
        clock,
        ...overrides,
        controllers: [new NoteController({ service: new NoteService({ clock }) })],
    });
}

function post(app: App, body: BodyInit | undefined, headers: Record<string, string> = {}): Promise<Response> {
    return app.fetch(new Request('http://test/notes', {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}`, ...headers },
        body,
    }));
}

describe('contributed controllers', () => {
    it('serves a logged-in route behind authentication', async () => {
        const { app } = noteApp();
        const response = await call(app, 'GET', '/notes/7', { token: ADMIN_TOKEN });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: '7' });

        const anonymous = await call(app, 'GET', '/notes/7');

        expect(anonymous.status).toBe(401);
        expect(anonymous.headers.get('www-authenticate')).toBe('Bearer');
    });

    it('serves a route without middleware to anyone', async () => {
        const { app } = noteApp();
        const response = await call(app, 'GET', '/notes/public');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ public: true });
    });

    it('reads a required JSON body with chamvi\'s reader', async () => {
        const { app } = noteApp({ bodyLimit: 64 });
        const created = await post(app, JSON.stringify({ text: 'hi' }), { 'content-type': 'application/json' });

        expect(created.status).toBe(201);
        expect(await created.json()).toEqual({ text: 'hi' });

        const large = await post(app, JSON.stringify({ text: 'x'.repeat(100) }), { 'content-type': 'application/json' });

        expect(large.status).toBe(413);

        const plain = await post(app, 'hi', { 'content-type': 'text/plain' });

        expect(plain.status).toBe(415);

        const empty = await post(app, undefined);

        expect(empty.status).toBe(400);
        expect(await empty.json()).toMatchObject({ status: 400, message: 'The request needs a JSON body.' });
    });

    it('answers 403 for a principal without the permission the service checks', async () => {
        const { app } = noteApp();
        const denied = await call(app, 'GET', '/notes/guarded', { token: tokenFor('other') });

        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ status: 403, message: `Missing permission "${NOTE_PERMISSION}".` });

        const granted = await call(app, 'GET', '/notes/guarded', { token: tokenFor(NOTE_PERMISSION) });

        expect(granted.status).toBe(200);
        expect(await granted.json()).toEqual({ ok: true });
    });

    it('maps an http error through the error handler', async () => {
        const { app } = noteApp();
        const response = await call(app, 'GET', '/notes/stale');

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            status: 409,
            code: 'stale_lock',
            message: 'x',
        });
    });

    it('hides a plain error behind a 500 and reports it', async () => {
        const errors: unknown[] = [];
        const { app } = noteApp({
            onError: (error) => {
                errors.push(error);
            },
        });
        const response = await call(app, 'GET', '/notes/boom');
        const text = await response.text();

        expect(response.status).toBe(500);
        expect(JSON.parse(text)).toMatchObject({ code: 'internal_error', message: 'Internal Server Error' });
        expect(text).not.toContain('secret');
        expect(errors).toHaveLength(1);
        expect((errors[0] as Error).message).toBe('secret');
    });

    it('serves under basePath', async () => {
        const { app } = noteApp({ basePath: '/api' });
        const response = await call(app, 'GET', '/api/notes/7', { token: ADMIN_TOKEN });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: '7' });
    });

    it('rate-limits a contributed route', async () => {
        const { app } = noteApp({ rateLimit: { max: 1 } });

        expect((await call(app, 'GET', '/notes/public')).status).toBe(200);
        expect((await call(app, 'GET', '/notes/public')).status).toBe(429);
    });

    it('keeps the built-in routes, the extra routes and the 404', async () => {
        const { app } = noteApp({
            routes: [{
                method: 'POST',
                path: '/extra',
                handler: async () => ({ status: 202, body: { ok: true } }),
            }],
        });

        expect((await call(app, 'GET', '/me', { token: ADMIN_TOKEN })).status).toBe(200);

        const extra = await call(app, 'POST', '/extra');

        expect(extra.status).toBe(202);
        expect(await extra.json()).toEqual({ ok: true });

        const missing = await call(app, 'GET', '/notes/7/missing', { token: ADMIN_TOKEN });

        expect(missing.status).toBe(404);
        expect(missing.headers.get('content-type')).toMatch(/application\/json/);
        expect(await missing.json()).toMatchObject({ status: 404, message: 'The requested route does not exist.' });
    });
});
