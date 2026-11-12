/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { UnauthorizedError } from '@ebec/http';
import { App, defineCoreHandler } from 'routup';
import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { ControllableClock } from '@chamvi/test-kit';
import { staticTokens } from '@chamvi/http';
import type { Authenticator, Principal } from '@chamvi/http';
import { buildContext, createErrorHandler } from '../../../src/app/helpers.ts';
import { authorize } from '../../../src/auth/helpers.ts';
import {
    READER_TOKEN,
    createTestApp,
    permissionsAuth,
    restricted,
    tokenFor,
} from '../../utils/app.ts';

const reader = staticTokens({
    tokens: [{
        value: READER_TOKEN,
        id: 'reader',
        permissions: [{ permission: { name: Permission.RUN_READ } }],
    }],
});

const throwing: Authenticator = async () => {
    throw new UnauthorizedError({ message: 'rejected by the first authenticator' });
};

function probeApp(auth: Authenticator[], clock?: ControllableClock) {
    const { engine } = createTestApp(clock ? { clock } : {});
    const ctx = buildContext({ engine, auth });
    const app = new App();

    app.get('/probe', defineCoreHandler(async (event) => {
        const permission = event.searchParams.get('p') ?? undefined;
        const attributes = event.searchParams.get('a');
        const resource = attributes === null ? undefined : JSON.parse(attributes) as Record<string, unknown>;

        await authorize(event, ctx, permission, resource);

        const principal = await authorize(event, ctx, permission, resource);

        return { id: principal.id };
    }));
    app.use(createErrorHandler(ctx));

    return app;
}

const probe = (app: App, token?: string, permission?: string, attributes?: Record<string, unknown>) => {
    const query = new URLSearchParams();

    if (permission) {
        query.set('p', permission);
    }

    if (attributes) {
        query.set('a', JSON.stringify(attributes));
    }

    return app.fetch(new Request(
        `http://test/probe${query.size > 0 ? `?${query.toString()}` : ''}`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} },
    ));
};

describe('authorize', () => {
    it('answers 401 with WWW-Authenticate without a token', async () => {
        const response = await probe(probeApp([reader]));

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
        expect(await response.json()).toMatchObject({ message: 'Authentication required.' });
    });

    it('lets a known token through', async () => {
        const response = await probe(probeApp([reader]), READER_TOKEN, Permission.RUN_READ);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: 'reader' });
    });

    it('answers 403 for a missing permission', async () => {
        const response = await probe(probeApp([reader]), READER_TOKEN, Permission.RUN_CANCEL);

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ message: 'Missing permission "chamvi_run_cancel".' });
    });

    it('lets a restricted binding through a check without attributes (some resource)', async () => {
        const token = tokenFor(restricted(Permission.AGENT_RUN, { name: 'triage' }));
        const response = await probe(probeApp([permissionsAuth]), token, Permission.AGENT_RUN);

        expect(response.status).toBe(200);
    });

    it('checks a restricted binding against the resource attributes', async () => {
        const token = tokenFor(restricted(Permission.AGENT_RUN, { name: 'triage' }));
        const app = probeApp([permissionsAuth]);
        const allowed = await probe(app, token, Permission.AGENT_RUN, { name: 'triage', private: false });
        const refused = await probe(app, token, Permission.AGENT_RUN, { name: 'other', private: false });

        expect(allowed.status).toBe(200);
        expect(refused.status).toBe(403);
        expect(await refused.json()).toMatchObject({ message: 'Missing permission "chamvi_agent_run".' });
    });

    it('evaluates a time policy with the engine clock', async () => {
        const token = tokenFor({
            permission: { name: Permission.RUN_READ },
            policies: [{
                type: 'time',
                start: '09:00',
                end: '11:00',
            } as never],
        });
        const inside = probeApp([permissionsAuth], new ControllableClock(new Date(2026, 10, 11, 10, 0)));
        const outside = probeApp([permissionsAuth], new ControllableClock(new Date(2026, 10, 11, 12, 0)));

        expect((await probe(inside, token, Permission.RUN_READ, { agent: 'echo' })).status).toBe(200);
        expect((await probe(outside, token, Permission.RUN_READ, { agent: 'echo' })).status).toBe(403);
    });

    it('skips an authenticator that throws when a later one resolves', async () => {
        const response = await probe(probeApp([throwing, reader]), READER_TOKEN);

        expect(response.status).toBe(200);
    });

    it('answers the remembered error when nothing resolves', async () => {
        const response = await probe(probeApp([throwing]), READER_TOKEN);

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
        expect(await response.json()).toMatchObject({ message: 'rejected by the first authenticator' });
    });

    it.each([
        ['an empty id', {
            id: '',
            kind: 'custom',
            bindings: [],
        }],
        ['no kind', { id: 'x', bindings: [] }],
        ['an empty kind', {
            id: 'x',
            kind: '',
            bindings: [],
        }],
        ['bindings that are no array', {
            id: 'x',
            kind: 'custom',
            bindings: 'chamvi_run_read',
        }],
        ['a permission that is no binding', {
            id: 'x',
            kind: 'custom',
            bindings: [42],
        }],
        ['an old string permission', {
            id: 'x',
            kind: 'custom',
            bindings: ['run:read'],
        }],
        ['an authorization without a realm', {
            id: 'x',
            kind: 'custom',
            bindings: [],
            authorization: { realm: '', snapshot: { definitions: [] } },
        }],
        ['an authorization whose snapshot holds no binding list', {
            id: 'x',
            kind: 'custom',
            bindings: [],
            authorization: { realm: 'r', snapshot: { definitions: 'x' } },
        }],
        ['an identity of another type', {
            id: 'x',
            kind: 'custom',
            bindings: [],
            identity: { type: 'robot', id: 'x' },
        }],
    ])('answers 500 for an authenticator resolving a principal with %s, without trying the next one', async (_name, principal) => {
        let later = 0;
        const malformed: Authenticator = async () => principal as unknown as Principal;
        const next: Authenticator = async (request) => {
            later++;

            return reader(request);
        };
        const response = await probe(probeApp([malformed, next]), READER_TOKEN);

        expect(response.status).toBe(500);
        expect(later).toBe(0);
    });

    it('runs the chain once per request', async () => {
        let calls = 0;
        const counting: Authenticator = async (request) => {
            calls++;

            return reader(request);
        };
        const response = await probe(probeApp([counting]), READER_TOKEN);

        expect(response.status).toBe(200);
        expect(calls).toBe(1);
    });
});
