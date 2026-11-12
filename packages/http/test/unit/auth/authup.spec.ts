/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier, TokenVerificationData } from '@authup/server-adapter-kit';
import { Permission, can } from '@chamvi/access';
import { ControllableClock } from '@chamvi/test-kit';
import { describe, expect, it } from 'vitest';
import { authup } from '@chamvi/http';
import type { AuthupOptions } from '@chamvi/http';

const REALM = 'c641912c-21e5-4cb4-84b6-169e2b2bb023';
const USER = '245e3c5d-5747-4fbd-8554-c33d34780c58';

const POLICIES = {
    default: {
        type: 'composite',
        decisionStrategy: 'unanimous',
        children: [{ type: 'identity' }, { type: 'permissionBinding' }],
    },
    triage: { type: 'attributes', query: { name: 'triage' } },
};

const definition = (name: string) => ({
    name,
    realmId: null,
    clientId: null,
    decisionStrategy: null,
    policies: ['default'],
});

const CATALOG = {
    policies: POLICIES,
    permissions: [definition(Permission.AGENT_RUN), definition(Permission.RUN_READ)],
};

const GRANTS = [
    {
        name: Permission.AGENT_RUN, 
        realm_scope: 'own' as const, 
        policies: ['triage'], 
    },
    {
        name: Permission.RUN_READ, 
        realm_scope: 'own' as const, 
        policies: [], 
    },
];

function verifierFor(data: TokenVerificationData): ITokenVerifier {
    return {
        verify: async (token) => {
            if (token === 'good') {
                return data;
            }

            throw new Error('invalid_token');
        },
    };
}

function tokenData(overrides: Partial<TokenVerificationData> = {}): TokenVerificationData {
    return {
        sub: USER,
        sub_kind: 'user',
        realm_id: REALM,
        realm_name: 'master',
        scope: 'global',
        permissions: GRANTS,
        ...overrides,
    } as TokenVerificationData;
}

type Setup = {
    data?: TokenVerificationData;
    catalogs?: unknown[];
    realm?: () => Promise<string>;
    clock?: ControllableClock;
    catalogMaxAgeMs?: number;
};

function setup(input: Setup = {}) {
    const catalogs = input.catalogs ?? [CATALOG];
    const errors: unknown[] = [];
    let loads = 0;

    const options: AuthupOptions = {
        verifier: verifierFor(input.data ?? tokenData()),
        catalog: async () => {
            const next = catalogs[Math.min(loads, catalogs.length - 1)];

            loads++;

            if (Error.isError(next)) {
                throw next;
            }

            return next;
        },
        realm: input.realm ?? (async () => REALM),
        ...(input.clock ? { clock: input.clock } : {}),
        ...(typeof input.catalogMaxAgeMs === 'undefined' ? {} : { catalogMaxAgeMs: input.catalogMaxAgeMs }),
        onError: (error) => {
            errors.push(error);
        },
    };

    return {
        authenticate: authup(options),
        errors,
        loads: () => loads,
    };
}

const request = (authorization?: string) => new Request('http://test', { headers: authorization ? { authorization } : {} });

describe('authup', () => {
    it('grants the flattened bindings of a global token, with the identity', async () => {
        const { authenticate } = setup();
        const principal = await authenticate(request('Bearer good'));

        expect(principal).toMatchObject({
            id: USER,
            kind: 'authup',
            identity: {
                type: 'user',
                id: USER,
                realmId: REALM,
                realmName: 'master',
            },
        });
        expect(principal?.permissions.map((binding) => binding.permission.name)).toEqual([
            Permission.AGENT_RUN,
            Permission.RUN_READ,
        ]);
        expect(principal?.claims?.sub).toBe(USER);
    });

    it('honors the policy of a restricted grant end to end', async () => {
        const principal = (await setup().authenticate(request('Bearer good')))!;
        const now = new Date('2026-11-11T10:00:00Z');

        expect(await can(principal, Permission.AGENT_RUN, { attributes: { name: 'triage', private: false }, now })).toBe(true);
        expect(await can(principal, Permission.AGENT_RUN, { attributes: { name: 'other', private: false }, now })).toBe(false);
        expect(await can(principal, Permission.RUN_READ, { attributes: { agent: 'other' }, now })).toBe(true);
    });

    it('refreshes a stale catalog once and flattens against the fresh one', async () => {
        const stale = { policies: POLICIES, permissions: [definition(Permission.RUN_READ)] };
        const {
            authenticate, 
            errors, 
            loads, 
        } = setup({ catalogs: [stale, CATALOG] });
        const principal = await authenticate(request('Bearer good'));

        expect(loads()).toBe(2);
        expect(errors).toEqual([]);
        expect(principal?.permissions).toHaveLength(2);
    });

    it('grants nothing and reports once when the refreshed catalog is still stale', async () => {
        const stale = { policies: POLICIES, permissions: [definition(Permission.RUN_READ)] };
        const {
            authenticate, 
            errors, 
            loads, 
        } = setup({ catalogs: [stale] });
        const principal = await authenticate(request('Bearer good'));

        expect(principal).toMatchObject({ id: USER, permissions: [] });
        expect(loads()).toBe(2);
        expect(errors).toHaveLength(1);
    });

    it('grants nothing and reports the error once when the catalog cannot be read', async () => {
        const failure = new Error('403 permission_read');
        const { authenticate, errors } = setup({ catalogs: [failure, CATALOG] });

        expect(await authenticate(request('Bearer good'))).toMatchObject({ id: USER, permissions: [] });
        expect(errors).toEqual([failure]);

        // the next request fetches again
        expect((await authenticate(request('Bearer good')))?.permissions).toHaveLength(2);
        expect(errors).toEqual([failure]);
    });

    it('reports a failed catalog fetch once for concurrent requests', async () => {
        const failure = new Error('down');
        const {
            authenticate, 
            errors, 
            loads, 
        } = setup({ catalogs: [failure] });

        await Promise.all([1, 2, 3].map(() => authenticate(request('Bearer good'))));

        expect(loads()).toBe(1);
        expect(errors).toEqual([failure]);
    });

    it('reports once per load when global definitions arrive out of the client\'s reach', async () => {
        const unreachable = {
            policies: POLICIES,
            permissions: [
                { ...definition(Permission.AGENT_RUN), policies: null },
                { ...definition(Permission.RUN_READ), policies: null },
                // a foreign realm's definition out of reach is expected, not reported
                {
                    ...definition('foreign_read'),
                    realmId: '0b6b5a8e-6d0a-4f4f-9d43-9f1f5a4b7c11',
                    policies: null,
                },
                { ...definition('own_read'), realmId: REALM },
            ],
        };
        const { authenticate, errors } = setup({ catalogs: [unreachable] });

        await Promise.all([1, 2].map(() => authenticate(request('Bearer good'))));

        expect((await authenticate(request('Bearer good')))?.permissions).toEqual([]);
        expect(errors).toHaveLength(1);

        const { message } = errors[0] as Error;

        expect(message).toContain('ownOrNull');
        expect(message).toContain(Permission.AGENT_RUN);
        expect(message).not.toContain('foreign_read');
    });

    it('treats a body that is not a catalog as a failed load, reported once and read again', async () => {
        const {
            authenticate,
            errors,
            loads,
        } = setup({ catalogs: [{ message: 'maintenance' }, CATALOG] });

        await Promise.all([1, 2].map(() => authenticate(request('Bearer good'))));

        expect(loads()).toBe(1);
        expect(errors).toHaveLength(1);

        expect((await authenticate(request('Bearer good')))?.permissions).toHaveLength(2);
        expect(loads()).toBe(2);
        expect(errors).toHaveLength(1);
    });

    it('reads the catalog again once it is older than catalogMaxAgeMs', async () => {
        const clock = new ControllableClock(new Date('2026-11-11T10:00:00Z'));
        const tightened = {
            policies: { ...POLICIES, triage: { type: 'attributes', query: { name: 'nothing' } } },
            permissions: CATALOG.permissions,
        };
        const { authenticate, loads } = setup({
            catalogs: [CATALOG, tightened],
            clock,
            catalogMaxAgeMs: 30_000,
        });
        const now = clock.now();
        const attributes = { name: 'triage', private: false };

        expect(await can((await authenticate(request('Bearer good')))!, Permission.AGENT_RUN, { attributes, now })).toBe(true);

        clock.advance(29_999);
        expect(await can((await authenticate(request('Bearer good')))!, Permission.AGENT_RUN, { attributes, now })).toBe(true);
        expect(loads()).toBe(1);

        clock.advance(1);
        expect(await can((await authenticate(request('Bearer good')))!, Permission.AGENT_RUN, { attributes, now })).toBe(false);
        expect(loads()).toBe(2);
    });

    it('flattens against the updated content when the loader returns the same object again', async () => {
        const clock = new ControllableClock(new Date('2026-11-11T10:00:00Z'));
        const shared = {
            policies: { ...POLICIES } as Record<string, unknown>,
            permissions: CATALOG.permissions,
        };
        const { authenticate, loads } = setup({
            catalogs: [shared],
            clock,
            catalogMaxAgeMs: 30_000,
        });
        const now = clock.now();
        const attributes = { name: 'triage', private: false };

        expect(await can((await authenticate(request('Bearer good')))!, Permission.AGENT_RUN, { attributes, now })).toBe(true);

        shared.policies.triage = { type: 'attributes', query: { name: 'nothing' } };
        clock.advance(30_000);

        expect(await can((await authenticate(request('Bearer good')))!, Permission.AGENT_RUN, { attributes, now })).toBe(false);
        expect(loads()).toBe(2);
    });

    it('reads the catalog again after a minute by default', async () => {
        const clock = new ControllableClock(new Date('2026-11-11T10:00:00Z'));
        const { authenticate, loads } = setup({ clock });

        await authenticate(request('Bearer good'));
        clock.advance(59_999);
        await authenticate(request('Bearer good'));
        expect(loads()).toBe(1);

        clock.advance(1);
        await authenticate(request('Bearer good'));
        expect(loads()).toBe(2);
    });

    it.each([[0], [-1], [NaN], [Infinity]])('rejects catalogMaxAgeMs %s', (catalogMaxAgeMs) => {
        expect(() => setup({ catalogMaxAgeMs })).toThrow('authup: catalogMaxAgeMs must be a positive finite number.');
    });

    it('grants nothing and reports when the realm cannot be resolved', async () => {
        const failure = new Error('no realm');
        const { authenticate, errors } = setup({
            realm: async () => {
                throw failure;
            },
        });

        expect(await authenticate(request('Bearer good'))).toMatchObject({ permissions: [] });
        expect(errors).toEqual([failure]);
    });

    it('shares one catalog load between concurrent requests and later ones', async () => {
        const { authenticate, loads } = setup();

        await Promise.all([1, 2, 3].map(() => authenticate(request('Bearer good'))));
        await authenticate(request('Bearer good'));

        expect(loads()).toBe(1);
    });

    it.each([['openid email'], [undefined], ['globally']])('keeps the identity but grants nothing for scope %j', async (scope) => {
        const data = tokenData();

        if (scope === undefined) {
            delete data.scope;
        } else {
            data.scope = scope;
        }

        const { authenticate, loads } = setup({ data });

        expect(await authenticate(request('Bearer good'))).toMatchObject({
            id: USER, 
            identity: { id: USER }, 
            permissions: [], 
        });
        expect(loads()).toBe(0);
    });

    it('grants nothing to a subject of an unknown kind', async () => {
        const { authenticate, loads } = setup({ data: tokenData({ sub_kind: 'robot' as never }) });
        const principal = await authenticate(request('Bearer good'));

        expect(principal).toMatchObject({ id: USER, permissions: [] });
        expect(principal?.identity).toBeUndefined();
        expect(loads()).toBe(0);
    });

    it('reads a client identity', async () => {
        const client = 'c641912c-21e5-4cb4-84b6-169e2b2bb025';
        const { authenticate } = setup({
            data: tokenData({
                sub: client, 
                sub_kind: 'client', 
                client_id: client, 
            }), 
        });

        expect((await authenticate(request('Bearer good')))?.identity).toEqual({
            type: 'client',
            id: client,
            realmId: REALM,
            realmName: 'master',
            clientId: client,
        });
    });

    it('resolves undefined without a header', async () => {
        expect(await setup().authenticate(request())).toBeUndefined();
    });

    it('rejects a token the verifier rejects with 401', async () => {
        await expect(setup().authenticate(request('Bearer bad'))).rejects.toMatchObject({
            status: 401,
            message: 'The access token is invalid.',
        });
    });

    it.each([[undefined], ['']])('rejects a verified token with sub %j with 401', async (sub) => {
        const data = tokenData();

        if (sub === undefined) {
            delete data.sub;
        } else {
            data.sub = sub;
        }

        await expect(setup({ data }).authenticate(request('Bearer good'))).rejects.toMatchObject({
            status: 401,
            message: 'The access token names no subject.',
        });
    });

    it('rejects a malformed header with 401', async () => {
        await expect(setup().authenticate(request('Bearer'))).rejects.toMatchObject({ status: 401 });
    });
});
