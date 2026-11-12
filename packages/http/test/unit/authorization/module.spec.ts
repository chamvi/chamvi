/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildAuthorizationSnapshot } from '@authup/access';
import { describe, expect, it } from 'vitest';
import { PERMISSION_NAMES, Permission } from '@chamvi/access';
import type { PermissionAuthorization } from '@chamvi/access';
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { http } from '@chamvi/http';
import type { Principal } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';

const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';
const REALM_ID = '0195f2a0-7c3e-7a4b-9c1d-000000000001';

/** A catalog as authup's `GET /authorization` serves it: every definition binds its grants. */
const CATALOG = {
    policies: {
        binding: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
    },
    permissions: [Permission.RUN_READ, Permission.AGENT_RUN].map((name) => ({
        name,
        realmId: null,
        clientId: null,
        decisionStrategy: null,
        policies: ['binding'],
    })),
};

/** An authup login granted `chamvi_run_read` only, `chamvi_agent_run` defined but not granted. */
async function authupPrincipal(): Promise<Principal> {
    const snapshot = await buildAuthorizationSnapshot({
        catalog: CATALOG,
        grants: [{ name: Permission.RUN_READ, realm_scope: 'any' }],
    });

    return {
        id: USER_ID,
        kind: 'authup',
        bindings: [],
        identity: {
            type: 'user',
            id: USER_ID,
            realmId: REALM_ID,
        },
        authorization: { realm: REALM_ID, snapshot: JSON.parse(JSON.stringify(snapshot)) } as PermissionAuthorization,
    };
}

async function check(app: ReturnType<typeof createTestApp>['app'], token: string, body?: unknown) {
    const response = await call(app, 'POST', '/authorization/check', { token, body });

    return { response, body: await response.json() as Record<string, unknown> };
}

describe('POST /authorization/check', () => {
    it('answers every permission name for a \'*\' token without a body', async () => {
        const { app } = createTestApp();
        const result = await check(app, ADMIN_TOKEN);

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({ permissions: [...PERMISSION_NAMES] });
    });

    it('answers no name for a token without bindings', async () => {
        const { app } = createTestApp();
        const result = await check(app, tokenFor());

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({ permissions: [] });
    });

    it('answers a name an attribute policy restricts, while the resource route still refuses', async () => {
        const { app } = createTestApp({
            agents: [defineModelAgent({
                name: 'y',
                model: textModel(),
                instructions: 'Y.',
                channels: [http.on()],
            })],
        });
        const token = tokenFor(restricted(Permission.AGENT_RUN, { name: 'x' }));
        const result = await check(app, token);

        expect(result.body).toEqual({ permissions: [Permission.AGENT_RUN] });
        expect((await call(app, 'POST', '/agents/y/runs', { token, body: {} })).status).toBe(403);
    });

    it('follows a time policy as the clock advances', async () => {
        const clock = new ControllableClock(new Date(2026, 10, 11, 8, 0));
        const { app } = createTestApp({ clock });
        const token = tokenFor({
            permission: { name: Permission.RUN_READ },
            policies: [{
                type: 'time',
                start: '09:00',
                end: '11:00',
            } as never],
        });

        expect((await check(app, token)).body).toEqual({ permissions: [] });

        clock.advance(2 * 60 * 60 * 1000);

        expect((await check(app, token)).body).toEqual({ permissions: [Permission.RUN_READ] });
    });

    it('answers an authup login from its snapshot without echoing it', async () => {
        const { app } = createTestApp({ auth: [authupPrincipal] });
        const result = await check(app, 'anything');
        const permissions = result.body.permissions as string[];

        expect(result.response.status).toBe(200);
        expect(permissions).toContain(Permission.RUN_READ);
        expect(permissions).not.toContain(Permission.AGENT_RUN);

        const text = JSON.stringify(result.body);

        for (const key of ['policies', 'definitions', 'grants', 'snapshot']) {
            expect(text).not.toContain(key);
        }
    });

    it('answers no name for a login whose authorization failed to load', async () => {
        const { app } = createTestApp({
            auth: [async () => ({
                id: USER_ID,
                kind: 'authup',
                bindings: [],
            })],
        });
        const result = await check(app, 'anything');

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({ permissions: [] });
    });

    it('answers the requested names deduplicated, in request order, unknown ones absent', async () => {
        const { app } = createTestApp();
        const result = await check(app, ADMIN_TOKEN, { names: [Permission.RUN_READ, 'nope', Permission.RUN_READ, Permission.AGENT_READ] });

        expect(result.body).toEqual({ permissions: [Permission.RUN_READ, Permission.AGENT_READ] });
    });

    it('answers no name for an empty names list', async () => {
        const { app } = createTestApp();

        expect((await check(app, ADMIN_TOKEN, { names: [] })).body).toEqual({ permissions: [] });
    });

    it('answers every name for an empty object, an empty body and no body', async () => {
        const { app } = createTestApp();
        const all = { permissions: [...PERMISSION_NAMES] };

        expect((await check(app, ADMIN_TOKEN, {})).body).toEqual(all);
        expect((await check(app, ADMIN_TOKEN)).body).toEqual(all);

        const empty = await app.fetch(new Request('http://test/authorization/check', {
            method: 'POST',
            headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
            body: '',
        }));

        expect(empty.status).toBe(200);
        expect(await empty.json()).toEqual(all);
    });

    it('refuses more than 64 names', async () => {
        const { app } = createTestApp();
        const names = Array.from({ length: 65 }, (_, index) => `name_${index}`);
        const result = await check(app, ADMIN_TOKEN, { names });

        expect(result.response.status).toBe(400);
        expect(result.body).toMatchObject({ code: 'validation_error' });
    });

    it('accepts 64 names', async () => {
        const { app } = createTestApp();
        const names = Array.from({ length: 64 }, (_, index) => `name_${index}`);
        const result = await check(app, ADMIN_TOKEN, { names });

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({ permissions: [] });
    });

    it('refuses a name that is no string', async () => {
        const { app } = createTestApp();
        const result = await check(app, ADMIN_TOKEN, { names: [Permission.RUN_READ, 42] });

        expect(result.response.status).toBe(400);
        expect(result.body).toMatchObject({ code: 'validation_error' });
    });

    it('refuses an empty name and a name above 255 characters', async () => {
        const { app } = createTestApp();

        expect((await check(app, ADMIN_TOKEN, { names: [''] })).response.status).toBe(400);
        expect((await check(app, ADMIN_TOKEN, { names: ['a'.repeat(255)] })).response.status).toBe(200);
        expect((await check(app, ADMIN_TOKEN, { names: ['a'.repeat(256)] })).response.status).toBe(400);
    });

    it('refuses a body that is no JSON object', async () => {
        const { app } = createTestApp();

        expect((await check(app, ADMIN_TOKEN, [])).response.status).toBe(400);
    });

    it('401 without credentials, before the body is read', async () => {
        const { app } = createTestApp();
        let pulled = false;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulled = true;
                controller.enqueue(new TextEncoder().encode('{}'));
                controller.close();
            },
        }, { highWaterMark: 0 });
        const response = await app.fetch(new Request('http://test/authorization/check', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            duplex: 'half',
        } as RequestInit));

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
        expect(pulled).toBe(false);
    });

    it('a route registered under /authorization is refused', () => {
        expect(() => createTestApp({
            routes: [{
                method: 'GET',
                path: '/authorization/other',
                handler: async () => ({ status: 200 }),
            }],
        })).toThrow(InvalidAgentDefinitionError);
    });
});
