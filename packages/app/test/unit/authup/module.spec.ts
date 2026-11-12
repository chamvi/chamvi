/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { Permission } from '@chamvi/access';
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import { http } from '@chamvi/http';
import type { IModule } from 'orkos';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    AUTHENTICATOR_ORDER,
    AppToken,
    configModule,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import { authupModule, oidcModule } from '@chamvi/app/authup';
import type { AuthupModuleOptions } from '@chamvi/app/authup';
import { resolveAuthenticators } from '../../../src/modules/http/helpers.ts';
import {
    TOKEN,
    TOKENS,
} from '../../utils/app.ts';
import {
    AUTHUP_REALM,
    AUTHUP_USER,
    CATALOG,
    createFakeAuthup,
    userTokenData,
} from '../../utils/authup.ts';
import type { FakeAuthup } from '../../utils/authup.ts';
import { createHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import type { RecordingLogger } from '../../utils/logger.ts';
import { textModel } from '@chamvi/test-kit';
import { freePort } from '../../utils/port.ts';

const AUTHUP_ENV = {
    AUTHUP_URL: 'https://auth.example.com/api',
    AUTHUP_CLIENT_ID: 'chamvi',
    AUTHUP_CLIENT_SECRET: 'client-secret-value',
};

/** A verifier answering `authup-token` with a global user token carrying `grants`, and `plain-token` with no grants. */
function fakeVerifier(grants?: unknown[]) {
    const verify = vi.fn<ITokenVerifier['verify']>(async (token) => {
        if (token === 'authup-token') {
            return userTokenData(grants) as Awaited<ReturnType<ITokenVerifier['verify']>>;
        }

        if (token === 'plain-token') {
            return userTokenData([]) as Awaited<ReturnType<ITokenVerifier['verify']>>;
        }

        throw new Error('invalid_token');
    });

    return { verify };
}

const injected = (verifier: ITokenVerifier = fakeVerifier()): AuthupModuleOptions => ({
    verifier,
    catalog: async () => CATALOG,
    realm: AUTHUP_REALM,
});

const ISSUER = {
    id: 'ci',
    issuer: 'https://issuer.test',
    audience: 'chamvi',
};

/** One fake connection with a pairing QR widget and a reset action. */
function connection(name: string): IModule {
    return {
        name: `connection:${name}`,
        async setup(container) {
            container.registerMany(AppToken.CONNECTIONS, {
                useValue: {
                    name,
                    type: 'whatsapp',
                    status: () => 'pairing',
                    widgets: () => [{ kind: 'qr', value: `qr-of-${name}` }],
                    subscribe: () => () => undefined,
                    actions: { reset: async () => undefined },
                },
            });
        },
    };
}

let harnesses: Harness[] = [];
let servers: FakeAuthup[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    await Promise.all(servers.map((server) => server.close()));
    harnesses = [];
    servers = [];
});

async function served(options: AuthupModuleOptions) {
    const port = await freePort();
    const logger = createRecordingLogger();
    const harness = await createHarness({
        env: {
            CHAMVI_TOKENS: TOKENS,
            HOST: '127.0.0.1',
            PORT: String(port),
        },
        agents: [defineModelAgent({
            name: 'triage',
            model: textModel(),
            instructions: 'triage',
            channels: [http.on()],
        })],
        modules: [
            configModule({ logger }),
            // authup contributes first: only the authenticator order puts static tokens ahead
            authupModule(options),
            storeModule(),
            staticTokensModule(),
            engineModule(),
            connection('bot'),
            connection('other'),
            httpModule({ metrics: false, rateLimit: false }),
        ],
    });

    harnesses.push(harness);

    const request = (path: string, token: string, method = 'GET') => fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
    });

    return { request, logger };
}

const authupErrors = (logger: RecordingLogger) => logger.entries.filter((entry) => entry.msg === 'authup error');

describe('authupModule', () => {
    it('is named chamvi:authup and depends on the config module', () => {
        const module = authupModule({ ...injected(), env: {} });

        expect(module.name).toBe('chamvi:authup');
        expect(module.dependencies).toEqual(['chamvi:config']);
    });

    it.each(Object.keys(AUTHUP_ENV))('requires %s without a verifier', (name) => {
        expect(() => authupModule({ env: { ...AUTHUP_ENV, [name]: '' } }))
            .toThrow(new InvalidAgentDefinitionError(`${name} is required.`));
    });

    it.each(['catalog', 'realm'] as const)('requires the authup env for a missing %s', (name) => {
        const options = injected();

        delete options[name];

        expect(() => authupModule({ ...options, env: {} }))
            .toThrow(new InvalidAgentDefinitionError('AUTHUP_URL is required.'));
    });

    it('refuses an empty realm', () => {
        expect(() => authupModule({
            ...injected(), 
            realm: '', 
            env: {}, 
        }))
            .toThrow(new InvalidAgentDefinitionError('authup: realm must be a non-empty string.'));
    });

    it('builds a verifier from the three variables', () => {
        expect(() => authupModule({ env: AUTHUP_ENV })).not.toThrow();
        expect(() => authupModule({
            env: {},
            url: AUTHUP_ENV.AUTHUP_URL,
            clientId: 'c',
            clientSecret: 's',
        })).not.toThrow();
    });

    it('a given verifier, catalog and realm are used', async () => {
        const verifier = fakeVerifier();
        const { request } = await served(injected(verifier));

        const response = await request('/me', 'authup-token');

        expect(response.status).toBe(200);

        const me = await response.json() as { bindings: { permission: { name: string } }[] };

        expect(me).toMatchObject({
            id: AUTHUP_USER,
            kind: 'authup',
            identity: {
                type: 'user', 
                id: AUTHUP_USER, 
                realmId: AUTHUP_REALM, 
            },
        });
        expect(me.bindings.map((binding) => binding.permission.name)).toEqual([Permission.CONNECTION_WRITE]);
        expect(verifier.verify).toHaveBeenCalledTimes(1);
    });

    it('a restricted grant opens exactly its connection page, with the QR and the reset', async () => {
        const { request } = await served(injected());

        const bot = await request('/connections/bot', 'authup-token');

        expect(bot.status).toBe(200);
        expect(await bot.json()).toMatchObject({
            name: 'bot',
            widgets: [{ kind: 'qr', value: 'qr-of-bot' }],
            canReset: true,
        });
        expect((await request('/connections/bot/reset', 'authup-token', 'POST')).status).toBe(202);
        expect((await request('/connections/other', 'authup-token')).status).toBe(403);
        expect((await request('/connections/other/reset', 'authup-token', 'POST')).status).toBe(403);

        const list = await (await request('/connections', 'authup-token')).json() as { data: { name: string }[] };

        expect(list.data.map((view) => view.name)).toEqual(['bot']);
    });

    it('a login without the grant gets 403', async () => {
        const { request } = await served(injected());

        expect((await request('/connections/bot', 'plain-token')).status).toBe(403);
    });

    it('an unreadable catalog grants the login nothing and is reported, a static token still passes', async () => {
        const { request, logger } = await served({
            ...injected(),
            catalog: async () => {
                throw new Error('permission_read is required.');
            },
        });

        const me = await request('/me', 'authup-token');

        expect(me.status).toBe(200);
        expect(await me.json()).toMatchObject({ id: AUTHUP_USER, bindings: [] });
        expect((await request('/connections/bot', 'authup-token')).status).toBe(403);
        expect(authupErrors(logger).length).toBeGreaterThanOrEqual(1);
        expect((await request('/connections/bot', TOKEN)).status).toBe(200);
    });

    it('static tokens run before authup', async () => {
        const verifier = fakeVerifier();
        const { request } = await served(injected(verifier));

        const response = await request('/me', TOKEN);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ id: 'ops' });
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    it('from env alone it reads the catalog and its own realm from authup', async () => {
        const authup = await createFakeAuthup({ users: { 'user-token': userTokenData() }, catalog: CATALOG });

        servers.push(authup);

        const { request, logger } = await served({
            env: {
                AUTHUP_URL: authup.url,
                AUTHUP_CLIENT_ID: 'chamvi',
                AUTHUP_CLIENT_SECRET: 'client-secret-value',
            },
        });

        expect((await request('/connections/bot', 'user-token')).status).toBe(200);
        expect((await request('/connections/other', 'user-token')).status).toBe(403);
        expect(authupErrors(logger)).toEqual([]);
        expect(authup.requests).toContain('GET /authorization');
        // the realm is introspected once and kept
        expect(authup.requests.filter((line) => line === 'POST /token/introspect').length).toBeLessThanOrEqual(3);
    });

    it('from env without permission_read the login gets 403 and the error is logged', async () => {
        const authup = await createFakeAuthup({ users: { 'user-token': userTokenData() } });

        servers.push(authup);

        const { request, logger } = await served({
            env: {
                AUTHUP_URL: authup.url,
                AUTHUP_CLIENT_ID: 'chamvi',
                AUTHUP_CLIENT_SECRET: 'client-secret-value',
            },
        });

        expect((await request('/connections/bot', 'user-token')).status).toBe(403);
        expect(authupErrors(logger)).toHaveLength(1);
        expect((await request('/connections/bot', TOKEN)).status).toBe(200);
    });
});

describe('oidcModule', () => {
    it('is named chamvi:oidc', () => {
        expect(oidcModule({ issuers: [ISSUER], principal: () => undefined }).name).toBe('chamvi:oidc');
    });

    it('validates its options when called', () => {
        expect(() => oidcModule({ issuers: [], principal: () => undefined })).toThrow(InvalidAgentDefinitionError);
    });

    it('contributes after authup', async () => {
        const harness = await createHarness({
            env: {},
            modules: [
                configModule({ logger: createRecordingLogger() }),
                oidcModule({ issuers: [ISSUER], principal: () => undefined }),
                authupModule(injected()),
            ],
        });

        harnesses.push(harness);

        const entries = harness.container.resolveAll(AppToken.AUTHENTICATORS);

        expect(entries.map((entry) => [entry.name, entry.order])).toEqual([
            ['oidc', AUTHENTICATOR_ORDER.OIDC],
            ['authup', AUTHENTICATOR_ORDER.AUTHUP],
        ]);

        const byName = new Map(entries.map((entry) => [entry.name, entry.authenticator]));

        expect(resolveAuthenticators(harness.container)).toEqual([byName.get('authup'), byName.get('oidc')]);
    });
});
