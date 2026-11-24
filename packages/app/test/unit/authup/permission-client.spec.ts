/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { Permission, can } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { AppToken, configModule } from '@chamvi/app';
import { authupModule } from '@chamvi/app/authup';
import type { AuthupModuleOptions } from '@chamvi/app/authup';
import {
    AUTHUP_REALM,
    createFakeAuthup,
    userTokenData,
} from '../../utils/authup.ts';
import type { FakeAuthup, FakeAuthupClient } from '../../utils/authup.ts';
import { buildHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { createTrackingClock } from '../../utils/clock.ts';
import { createRecordingLogger } from '../../utils/logger.ts';

const OWNER = '7d1f2c3b-4a5e-4f60-8b71-9c0d1e2f3a4b';
const OTHER = '7d1f2c3b-4a5e-4f60-8b71-9c0d1e2f3a4c';

const DASHBOARD: FakeAuthupClient = {
    id: OWNER,
    name: 'dashboard',
    realmId: AUTHUP_REALM,
};

const definition = (clientId: string | null) => ({
    name: Permission.RUN_READ,
    realmId: clientId ? AUTHUP_REALM : null,
    clientId,
    decisionStrategy: null,
    policies: ['default'],
});

/** `chamvi_run_read` global and owned by OWNER. */
const CATALOG = {
    policies: {
        default: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
    },
    permissions: [definition(null), definition(OWNER)],
};

/** A user token issued to OWNER with a grant of OWNER's `chamvi_run_read`. */
const verifier: ITokenVerifier = {
    verify: async () => ({
        ...userTokenData([{
            name: Permission.RUN_READ,
            realm_id: AUTHUP_REALM,
            client_id: OWNER,
            realm_scope: 'own',
        }]),
        client_id: OWNER,
    }) as Awaited<ReturnType<ITokenVerifier['verify']>>,
};

const injected: AuthupModuleOptions = {
    verifier,
    catalog: async () => CATALOG,
    realm: AUTHUP_REALM,
};

let harnesses: Harness[] = [];
let servers: FakeAuthup[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    await Promise.all(servers.map((server) => server.close()));
    harnesses = [];
    servers = [];
});

async function fakeAuthup(clients: FakeAuthupClient[] | undefined, hold?: (route: string) => boolean) {
    const authup = await createFakeAuthup({
        users: {},
        ...(clients ? { clients } : {}),
        ...(hold ? { hold } : {}),
    });

    servers.push(authup);

    return {
        authup,
        env: {
            AUTHUP_URL: authup.url,
            AUTHUP_CLIENT_ID: 'chamvi',
            AUTHUP_CLIENT_SECRET: 'client-secret-value',
        },
        lookups: () => authup.requests.filter((route) => route === 'GET /clients').length,
    };
}

function harnessOf(options: AuthupModuleOptions, clock = createTrackingClock()) {
    const harness = buildHarness({
        env: {},
        modules: [configModule({ logger: createRecordingLogger(), clock }), authupModule({ env: {}, ...options })],
    });

    harnesses.push(harness);

    const login = () => {
        const entry = harness.container.resolveAll(AppToken.AUTHENTICATORS).find((item) => item.name === 'authup')!;

        return entry.authenticator(new Request('http://test', { headers: { authorization: 'Bearer authup-token' } }));
    };

    return { harness, login };
}

describe('authupModule permission client', () => {
    it('checks through the definition of a client given by id, without a lookup', async () => {
        const { harness, login } = harnessOf({ ...injected, permissionClient: OWNER });

        await harness.setup();

        const principal = (await login())!;

        expect(principal.authorization?.client).toBe(OWNER);
        expect(await can(principal, Permission.RUN_READ)).toBe(true);
    });

    it('reads AUTHUP_PERMISSION_CLIENT', async () => {
        const { harness, login } = harnessOf({ ...injected, env: { AUTHUP_PERMISSION_CLIENT: OWNER } });

        await harness.setup();

        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    it('lets the option win over AUTHUP_PERMISSION_CLIENT', async () => {
        const { harness, login } = harnessOf({
            ...injected,
            permissionClient: OWNER,
            env: { AUTHUP_PERMISSION_CLIENT: OTHER },
        });

        await harness.setup();

        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    it('resolves a name once, in chamvi\'s realm', async () => {
        const { env, lookups } = await fakeAuthup([
            DASHBOARD,
            {
                id: OTHER,
                name: 'dashboard',
                realmId: '7d1f2c3b-4a5e-4f60-8b71-000000000000',
            },
        ]);
        const { harness, login } = harnessOf({
            verifier,
            catalog: async () => CATALOG,
            permissionClient: 'dashboard',
            env,
        });

        await harness.setup();

        expect(lookups()).toBe(1);

        for (let i = 0; i < 2; i++) {
            const principal = (await login())!;

            expect(principal.authorization?.client).toBe(OWNER);
            expect(await can(principal, Permission.RUN_READ)).toBe(true);
        }

        expect(lookups()).toBe(1);
    });

    it.each([
        ['matches no client', []],
        ['matches two clients', [DASHBOARD, { ...DASHBOARD, id: OTHER }]],
    ])('fails the start for a name that %s', async (_label, clients) => {
        const { env } = await fakeAuthup(clients);
        const { harness } = harnessOf({
            verifier,
            catalog: async () => CATALOG,
            permissionClient: 'dashboard',
            env,
        });

        await expect(harness.setup()).rejects.toThrow(new InvalidAgentDefinitionError(
            `authup: the permission client "dashboard" does not resolve to one client of realm ${AUTHUP_REALM}.`,
        ));
    });

    it('fails the start when the lookup does not answer within timeoutMs', async () => {
        const clock = createTrackingClock();
        const { env, lookups } = await fakeAuthup([DASHBOARD], (route) => route === 'GET /clients');
        const { harness } = harnessOf({
            verifier,
            catalog: async () => CATALOG,
            permissionClient: 'dashboard',
            timeoutMs: 1000,
            env,
        }, clock);
        const setup = harness.setup();

        setup.catch(() => undefined);

        for (let i = 0; i < 500 && lookups() === 0; i++) {
            await new Promise((resolve) => {
                setTimeout(resolve, 2);
            });
        }

        expect(lookups()).toBe(1);
        clock.advance(1000);

        await expect(setup).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(setup).rejects.toThrow(/permission client "dashboard".*1000ms/);
    });

    it('fails the start when the lookup is refused', async () => {
        const { env } = await fakeAuthup(undefined);
        const { harness } = harnessOf({
            verifier,
            catalog: async () => CATALOG,
            permissionClient: 'dashboard',
            env,
        });

        await expect(harness.setup()).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(harness.setup()).rejects.toThrow(/permission client "dashboard"/);
    });

    it('without an owner looks nothing up and sets no client', async () => {
        const { env, lookups } = await fakeAuthup([DASHBOARD]);
        const { harness, login } = harnessOf({
            verifier,
            catalog: async () => CATALOG,
            env,
        });

        await harness.setup();

        const principal = (await login())!;

        expect(lookups()).toBe(0);
        expect(principal.authorization).not.toHaveProperty('client');
        // the user's only grant is of a client-owned definition: realm mode denies it
        expect(await can(principal, Permission.RUN_READ)).toBe(false);
    });

    it('refuses an empty permissionClient', () => {
        expect(() => authupModule({
            ...injected, 
            permissionClient: '', 
            env: {}, 
        }))
            .toThrow(new InvalidAgentDefinitionError('authup: permissionClient must be a non-empty string.'));
    });
});
