/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier, TokenVerificationData } from '@authup/server-adapter-kit';
import { PERMISSION_NAMES, Permission, can } from '@chamvi/access';
import { describe, expect, it } from 'vitest';
import { authup } from '@chamvi/http';
import type { AuthupOptions, Principal } from '@chamvi/http';

const REALM = 'c641912c-21e5-4cb4-84b6-169e2b2bb023';
const USER = '245e3c5d-5747-4fbd-8554-c33d34780c58';
const CLIENT_A = 'c641912c-21e5-4cb4-84b6-169e2b2bb0aa';
const CLIENT_B = 'c641912c-21e5-4cb4-84b6-169e2b2bb0bb';

type Owner = { realmId?: string; clientId?: string };

const GLOBAL: Owner = {};
const REALM_OWNED: Owner = { realmId: REALM };
const OWNED_A: Owner = { realmId: REALM, clientId: CLIENT_A };
const OWNED_B: Owner = { realmId: REALM, clientId: CLIENT_B };

const definition = (name: string, owner: Owner) => ({
    name,
    realmId: owner.realmId ?? null,
    clientId: owner.clientId ?? null,
    decisionStrategy: null,
    policies: ['default'],
});

const CATALOG = {
    policies: {
        default: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
    },
    permissions: [
        ...[GLOBAL, REALM_OWNED, OWNED_A, OWNED_B].flatMap((owner) => [
            definition(Permission.RUN_READ, owner),
            definition(Permission.AGENT_READ, owner),
        ]),
        definition('release_manage', OWNED_A),
        definition('release_manage', GLOBAL),
        definition('user_read', OWNED_A),
    ],
};

const grant = (name: string, owner: Owner) => ({
    name,
    realm_scope: 'any',
    ...(owner.realmId ? { realm_id: owner.realmId } : {}),
    ...(owner.clientId ? { client_id: owner.clientId } : {}),
});

function verifierFor(data: TokenVerificationData): ITokenVerifier {
    return { verify: async () => data };
}

type Setup = {
    grants: unknown[];
    client?: AuthupOptions['client'];
    data?: Partial<TokenVerificationData>;
};

function setup(input: Setup) {
    const errors: unknown[] = [];
    const options: AuthupOptions = {
        verifier: verifierFor({
            sub: USER,
            sub_kind: 'user',
            realm_id: REALM,
            realm_name: 'master',
            client_id: CLIENT_A,
            scope: 'global',
            permissions: input.grants,
            ...input.data,
        } as TokenVerificationData),
        catalog: async () => CATALOG,
        realm: async () => REALM,
        ...(input.client ? { client: input.client } : {}),
        onError: (error) => {
            errors.push(error);
        },
    };

    return { authenticate: authup(options), errors };
}

const request = () => new Request('http://test', { headers: { authorization: 'Bearer good' } });

async function principalFor(input: Setup): Promise<Principal> {
    return (await setup(input).authenticate(request()))!;
}

const owners = (principal: Principal) => principal.authorization!.snapshot.definitions
    .map((entry) => [entry.permission.realmId ?? null, entry.permission.clientId ?? null]);

describe('authup with an owner client', () => {
    it('keeps only the definitions of the owner client in chamvi\'s realm', async () => {
        const principal = await principalFor({
            grants: [grant(Permission.RUN_READ, OWNED_A), grant('release_manage', OWNED_A)],
            client: async () => CLIENT_A,
        });
        const names = principal.authorization!.snapshot.definitions.map((entry) => entry.permission.name);

        expect(principal.authorization?.client).toBe(CLIENT_A);
        expect(owners(principal).every(([realmId, clientId]) => realmId === REALM && clientId === CLIENT_A)).toBe(true);
        expect(names).toEqual([Permission.RUN_READ, Permission.AGENT_READ, 'release_manage']);
        expect(names.every((name) => (PERMISSION_NAMES as readonly string[]).includes(name) || name === 'release_manage')).toBe(true);
        expect(await can(principal, Permission.RUN_READ)).toBe(true);
        expect(await can(principal, 'release_manage')).toBe(true);
        expect(await can(principal, Permission.AGENT_READ)).toBe(false);
    });

    it('denies a login whose grants are global, realm-owned or of another client', async () => {
        const principal = await principalFor({
            grants: [GLOBAL, REALM_OWNED, OWNED_B].map((owner) => grant(Permission.RUN_READ, owner)),
            client: async () => CLIENT_A,
        });

        expect(principal.authorization?.snapshot.grants).toEqual([]);
        expect(await can(principal, Permission.RUN_READ)).toBe(false);
    });

    it('drops a user grant of a definition owned by a client other than the token\'s', async () => {
        const principal = await principalFor({
            grants: [grant(Permission.RUN_READ, OWNED_A)],
            client: async () => CLIENT_A,
            data: { client_id: CLIENT_B },
        });

        expect(principal.authorization?.snapshot.grants).toEqual([]);
        expect(await can(principal, Permission.RUN_READ)).toBe(false);
    });

    it('keeps a user grant of the owner client through a token issued to no client, as authup does', async () => {
        const principal = await principalFor({
            grants: [grant(Permission.RUN_READ, OWNED_A)],
            client: async () => CLIENT_A,
            data: { client_id: undefined },
        });

        expect(await can(principal, Permission.RUN_READ)).toBe(true);
    });

    it('keeps the owner client grants of a client identity', async () => {
        const principal = await principalFor({
            grants: [grant(Permission.RUN_READ, OWNED_A)],
            client: async () => CLIENT_A,
            data: {
                sub: CLIENT_A,
                sub_kind: 'client',
                client_id: CLIENT_B,
            },
        });

        expect(await can(principal, Permission.RUN_READ)).toBe(true);
    });

    it('grants nothing and reports once for concurrent logins when the owner cannot be resolved', async () => {
        const failure = new Error('no client');
        let calls = 0;
        const { authenticate, errors } = setup({
            grants: [grant(Permission.RUN_READ, OWNED_A)],
            client: async () => {
                calls++;
                await Promise.resolve();

                throw failure;
            },
        });

        const principals = await Promise.all([1, 2, 3].map(() => authenticate(request())));

        expect(principals.every((principal) => principal?.authorization === undefined)).toBe(true);
        expect(calls).toBe(1);
        expect(errors).toEqual([failure]);
    });

    it('grants nothing and reports when the owner resolves to an empty string', async () => {
        const { authenticate, errors } = setup({ grants: [grant(Permission.RUN_READ, OWNED_A)], client: async () => '' });

        expect((await authenticate(request()))?.authorization).toBeUndefined();
        expect(errors).toHaveLength(1);
    });
});

describe('authup without an owner client', () => {
    it('keeps global and realm-owned definitions and sets no client', async () => {
        const principal = await principalFor({ grants: [grant(Permission.RUN_READ, REALM_OWNED), grant(Permission.RUN_READ, OWNED_A)] });

        expect(principal.authorization).not.toHaveProperty('client');
        expect(owners(principal).every(([realmId, clientId]) => clientId === null && (realmId === null || realmId === REALM))).toBe(true);
        expect(await can(principal, Permission.RUN_READ)).toBe(true);
    });
});
