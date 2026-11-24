/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

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
import { CATALOG, createFakeAuthup, userTokenData } from '../../utils/authup.ts';
import type { FakeAuthup } from '../../utils/authup.ts';
import { buildHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { createTrackingClock } from '../../utils/clock.ts';
import { createRecordingLogger } from '../../utils/logger.ts';

let harnesses: Harness[] = [];
let servers: FakeAuthup[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    await Promise.all(servers.map((server) => server.close()));
    harnesses = [];
    servers = [];
});

/** Logs a user in through the authup module of `options` against a fake authup; returns that server's token requests. */
async function login(options: (url: string) => AuthupModuleOptions) {
    const authup = await createFakeAuthup({ users: { 'user-token': userTokenData() }, catalog: CATALOG });

    servers.push(authup);

    const harness = buildHarness({
        env: {},
        mode: 'job',
        modules: [
            configModule({ logger: createRecordingLogger(), clock: createTrackingClock() }),
            authupModule(options(authup.url)),
        ],
    });

    harnesses.push(harness);
    await harness.setup();

    const entry = harness.container.resolveAll(AppToken.AUTHENTICATORS).find((item) => item.name === 'authup')!;
    const principal = await entry.authenticator(new Request('http://test', { headers: { authorization: 'Bearer user-token' } }));

    expect(principal).toBeDefined();

    return authup.tokenRequests;
}

describe('authupModule client credentials', () => {
    it('defaults the client to chamvi-server in the realm master', async () => {
        const requests = await login((url) => ({ env: { AUTHUP_URL: url, AUTHUP_CLIENT_SECRET: 'secret' } }));

        expect(requests.length).toBeGreaterThan(0);

        for (const request of requests) {
            expect(request).toMatchObject({
                grant_type: 'client_credentials',
                client_id: 'chamvi-server',
                client_secret: 'secret',
                realm_id: 'master',
            });
        }
    });

    it('reads AUTHUP_CLIENT_ID and AUTHUP_REALM', async () => {
        const requests = await login((url) => ({
            env: {
                AUTHUP_URL: url,
                AUTHUP_CLIENT_ID: 'agents',
                AUTHUP_CLIENT_SECRET: 'secret',
                AUTHUP_REALM: 'tenant',
            },
        }));

        expect(requests[0]).toMatchObject({ client_id: 'agents', realm_id: 'tenant' });
    });

    it('lets clientId and clientRealm win over the env', async () => {
        const requests = await login((url) => ({
            clientId: 'code-client',
            clientRealm: 'code-realm',
            env: {
                AUTHUP_URL: url,
                AUTHUP_CLIENT_ID: 'agents',
                AUTHUP_CLIENT_SECRET: 'secret',
                AUTHUP_REALM: 'tenant',
            },
        }));

        expect(requests[0]).toMatchObject({ client_id: 'code-client', realm_id: 'code-realm' });
    });

    it('sends everything given explicitly as is', async () => {
        const requests = await login((url) => ({
            url,
            clientId: 'explicit',
            clientSecret: 'explicit-secret',
            clientRealm: 'explicit-realm',
            env: {},
        }));

        expect(requests[0]).toMatchObject({
            client_id: 'explicit',
            client_secret: 'explicit-secret',
            realm_id: 'explicit-realm',
        });
    });

    it('refuses an empty clientRealm', () => {
        expect(() => authupModule({ clientRealm: '', env: { AUTHUP_URL: 'https://auth.example', AUTHUP_CLIENT_SECRET: 's' } }))
            .toThrow(new InvalidAgentDefinitionError('authup: clientRealm must be a non-empty string.'));
    });
});
