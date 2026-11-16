/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { App, defineCoreHandler } from 'routup';
import { describe, expect, it } from 'vitest';
import { authorizeRequest, staticTokens } from '@chamvi/http';
import type { Authenticator } from '@chamvi/http';
import { HTTP_CONTEXT } from '../../../src/app/constants.ts';
import { buildContext, createErrorHandler } from '../../../src/app/helpers.ts';
import { createTestApp } from '../../utils/app.ts';

const GRANTED_TOKEN = 'granted-token-0123456789';
const DENIED_TOKEN = 'denied-token-0123456789';

const tokens = staticTokens({
    tokens: [
        {
            value: GRANTED_TOKEN,
            id: 'granted',
            permissions: [{ permission: { name: 'x_read' } }],
        },
        {
            value: DENIED_TOKEN,
            id: 'denied',
            permissions: [],
        },
    ],
});

function probeApp() {
    const counter = { calls: 0 };
    const counting: Authenticator = async (request) => {
        counter.calls++;

        return tokens(request);
    };
    const { engine } = createTestApp();
    const ctx = buildContext({ engine, auth: [counting] });
    const app = new App();

    app.use(defineCoreHandler((event) => {
        event.store[HTTP_CONTEXT] = ctx;

        return event.next();
    }));
    app.get('/probe', defineCoreHandler(async (event) => {
        await authorizeRequest(event, 'x_read', { name: 'a' });

        const principal = await authorizeRequest(event, 'x_read', { name: 'a' });

        return { id: principal.id };
    }));
    app.use(createErrorHandler(ctx));

    return { app, counter };
}

const probe = (app: App, token?: string) => app.fetch(new Request(
    'http://test/probe',
    { headers: token ? { authorization: `Bearer ${token}` } : {} },
));

describe('authorizeRequest', () => {
    it('answers 401 with WWW-Authenticate without a token', async () => {
        const { app } = probeApp();
        const response = await probe(app);

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
    });

    it('answers 403 for a principal without the permission', async () => {
        const { app } = probeApp();
        const response = await probe(app, DENIED_TOKEN);

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ message: 'Missing permission "x_read".' });
    });

    it('answers the id of a granted principal, authenticating once for both calls', async () => {
        const { app, counter } = probeApp();
        const response = await probe(app, GRANTED_TOKEN);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: 'granted' });
        expect(counter.calls).toBe(1);
    });
});
