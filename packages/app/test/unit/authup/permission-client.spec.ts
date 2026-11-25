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
import { AppToken, ModuleName, configModule } from '@chamvi/app';
import type { IModule } from '@chamvi/app';
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

/** The env of a dashboard client `client` signing in at `url`. */
const dashboardEnv = (client: string, url = 'https://auth.example.com/api') => ({ AUTHUP_URL: url, UI_AUTHUP_CLIENT_ID: client });

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
            ...dashboardEnv('dashboard', authup.url),
            AUTHUP_CLIENT_ID: 'chamvi',
            AUTHUP_CLIENT_SECRET: 'client-secret-value',
        },
        lookups: () => authup.requests.filter((route) => route === 'GET /clients').length,
    };
}

type HarnessInput = {
    clock?: ReturnType<typeof createTrackingClock>;
    mode?: 'start' | 'job';
    /** Modules set up with authup, listed after it. */
    modules?: IModule[];
};

function harnessOf(options: AuthupModuleOptions, input: HarnessInput = {}) {
    const harness = buildHarness({
        env: {},
        mode: input.mode ?? 'start',
        modules: [
            configModule({ logger: createRecordingLogger(), clock: input.clock ?? createTrackingClock() }),
            authupModule({ env: {}, ...options }),
            ...input.modules ?? [],
        ],
    });

    harnesses.push(harness);

    const login = () => {
        const entry = harness.container.resolveAll(AppToken.AUTHENTICATORS).find((item) => item.name === 'authup')!;

        return entry.authenticator(new Request('http://test', { headers: { authorization: 'Bearer authup-token' } }));
    };

    return { harness, login };
}

/** A stand-in for the dashboard module: it registers UI_AUTH with an authup client. */
function dashboard(clientId: string): IModule {
    return {
        name: ModuleName.UI,
        async setup(container) {
            container.register(AppToken.UI_AUTH, {
                useValue: {
                    tokens: true,
                    authup: { url: 'https://auth.example.com/api', clientId },
                },
            });
        },
    };
}

const byName = (env: Record<string, string>): AuthupModuleOptions => ({
    verifier,
    catalog: async () => CATALOG,
    permissionOwner: 'client',
    env,
});

describe('authupModule permission owner', () => {
    it('checks through the definition of the dashboard client given by id, without a lookup', async () => {
        const { harness, login } = harnessOf({
            ...injected,
            permissionOwner: 'client',
            env: dashboardEnv(OWNER),
        });

        await harness.setup();

        const principal = (await login())!;

        expect(principal.authorization?.client).toBe(OWNER);
        expect(await can(principal, Permission.RUN_READ)).toBe(true);
    });

    it('reads the dashboard client from the env without the dashboard\'s AUTHUP_URL', async () => {
        const { harness, login } = harnessOf({
            ...injected,
            permissionOwner: 'client',
            env: { UI_AUTHUP_CLIENT_ID: OWNER },
        });

        await harness.setup();

        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    it('reads AUTHUP_PERMISSION_OWNER', async () => {
        const { harness, login } = harnessOf({ ...injected, env: { ...dashboardEnv(OWNER), AUTHUP_PERMISSION_OWNER: 'client' } });

        await harness.setup();

        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    it('lets the option win over AUTHUP_PERMISSION_OWNER', async () => {
        const { harness, login } = harnessOf({
            ...injected,
            permissionOwner: 'realm',
            env: { ...dashboardEnv(OWNER), AUTHUP_PERMISSION_OWNER: 'client' },
        });

        await harness.setup();

        expect((await login())?.authorization).not.toHaveProperty('client');
    });

    it('prefers the dashboard module\'s client over the env', async () => {
        const { harness, login } = harnessOf({
            ...injected,
            permissionOwner: 'client',
            env: dashboardEnv(OTHER),
        }, { modules: [dashboard(OWNER)] });

        await harness.setup();

        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    it('resolves a dashboard client name once, in chamvi\'s realm', async () => {
        const { env, lookups } = await fakeAuthup([
            DASHBOARD,
            {
                id: OTHER,
                name: 'dashboard',
                realmId: '7d1f2c3b-4a5e-4f60-8b71-000000000000',
            },
        ]);
        const { harness, login } = harnessOf(byName(env));

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
        const { harness } = harnessOf(byName(env));

        await expect(harness.setup()).rejects.toThrow(new InvalidAgentDefinitionError(
            `authup: the permission client "dashboard" does not resolve to one client of realm ${AUTHUP_REALM}.`,
        ));
    });

    it('fails the start when the lookup does not answer within timeoutMs', async () => {
        const clock = createTrackingClock();
        const { env, lookups } = await fakeAuthup([DASHBOARD], (route) => route === 'GET /clients');
        const { harness } = harnessOf({ ...byName(env), timeoutMs: 1000 }, { clock });
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
        const { harness } = harnessOf(byName(env));

        await expect(harness.setup()).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(harness.setup()).rejects.toThrow(/permission client "dashboard"/);
    });

    it('defaults the owner to the dashboard client chamvi, resolved in chamvi\'s realm', async () => {
        const { authup, lookups } = await fakeAuthup([{ ...DASHBOARD, name: 'chamvi' }]);
        const { harness, login } = harnessOf(byName({
            AUTHUP_URL: authup.url,
            AUTHUP_CLIENT_SECRET: 'client-secret-value',
        }));

        await harness.setup();

        expect(lookups()).toBe(1);
        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    it('defaults the owner to chamvi when the dashboard module signs in without authup', async () => {
        const { authup } = await fakeAuthup([{ ...DASHBOARD, name: 'chamvi' }]);
        const tokensOnly: IModule = {
            name: ModuleName.UI,
            async setup(container) {
                container.register(AppToken.UI_AUTH, { useValue: { tokens: true } });
            },
        };
        const { harness, login } = harnessOf(byName({
            AUTHUP_URL: authup.url,
            AUTHUP_CLIENT_SECRET: 'client-secret-value',
        }), { modules: [tokensOnly] });

        await harness.setup();

        expect((await login())?.authorization?.client).toBe(OWNER);
    });

    // a migrate run takes the same path (any mode but a serving start), and needs no authup at setup
    it('in job mode resolves a name at the first login with grants, not at setup', async () => {
        const { env, lookups } = await fakeAuthup([]);
        const { harness, login } = harnessOf(byName(env), { mode: 'job' });

        await harness.setup();

        expect(lookups()).toBe(0);
        expect((await login())?.authorization).toBeUndefined();
        expect(lookups()).toBe(1);
    });

    it('in realm mode, the default, looks nothing up and sets no client', async () => {
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

    it('refuses any other permission owner, from the option or the env', () => {
        const error = new InvalidAgentDefinitionError('authup: the permission owner (AUTHUP_PERMISSION_OWNER) must be realm or client.');

        expect(() => authupModule({
            ...injected, 
            permissionOwner: 'scope' as never, 
            env: {}, 
        })).toThrow(error);
        expect(() => authupModule({ ...injected, env: { AUTHUP_PERMISSION_OWNER: 'Client' } })).toThrow(error);
    });
});
