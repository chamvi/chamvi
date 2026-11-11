/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Principal } from '@chamvi/http';
import {
    READER_TOKEN,
    call,
    createTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';

const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';

describe('GET /me', () => {
    it('answers the principal\'s own id, kind and permissions', async () => {
        const { app } = createTestApp();
        const response = await call(app, 'GET', '/me', { token: READER_TOKEN });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: 'reader',
            kind: 'token',
            permissions: [{ permission: { name: Permission.RUN_READ } }],
        });
    });

    it('round-trips a binding with a policy', async () => {
        const binding = restricted(Permission.AGENT_RUN, { name: 'triage' });
        const { app } = createTestApp();
        const response = await call(app, 'GET', '/me', { token: tokenFor(binding) });

        expect(await response.json()).toEqual({
            id: 'p:chamvi_agent_run',
            kind: 'token',
            permissions: [binding],
        });
    });

    it('answers the identity an authenticator set', async () => {
        const identity = { type: 'user' as const, id: USER_ID };
        const principal: Principal = {
            id: USER_ID,
            kind: 'authup',
            permissions: [],
            identity,
        };
        const { app } = createTestApp({ auth: [async () => principal] });
        const response = await call(app, 'GET', '/me', { token: 'anything' });

        expect(await response.json()).toEqual({
            id: USER_ID,
            kind: 'authup',
            permissions: [],
            identity,
        });
    });

    it('needs no permission', async () => {
        const { app } = createTestApp();
        const response = await call(app, 'GET', '/me', { token: tokenFor() });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: 'p:',
            kind: 'token',
            permissions: [],
        });
    });

    it('401 without credentials', async () => {
        const { app } = createTestApp();
        const response = await call(app, 'GET', '/me');

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
    });

    it('a route registered at /me is refused', () => {
        expect(() => createTestApp({
            routes: [{
                method: 'GET',
                path: '/me',
                handler: async () => ({ status: 200 }),
            }],
        })).toThrow(InvalidAgentDefinitionError);
    });
});
