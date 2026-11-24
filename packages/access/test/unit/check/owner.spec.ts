/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildAuthorizationSnapshot } from '@authup/access';
import type { AuthorizationSnapshot } from '@authup/access';
import { describe, expect, it } from 'vitest';
import type { PermissionHolder } from '@chamvi/access';
import { Permission, can, canSome } from '@chamvi/access';

const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';
const REALM = '0195f2a0-7c3e-7a4b-9c1d-000000000001';
const CLIENT_A = '0195f2a0-7c3e-7a4b-9c1d-00000000000a';
const CLIENT_B = '0195f2a0-7c3e-7a4b-9c1d-00000000000b';

type Owner = { realmId?: string; clientId?: string };

const OWNERS: Record<string, Owner> = {
    global: {},
    realm: { realmId: REALM },
    a: { realmId: REALM, clientId: CLIENT_A },
    b: { realmId: REALM, clientId: CLIENT_B },
};

function definition(name: string, owner: Owner, policies: string[] = ['binding']) {
    return {
        name,
        realmId: owner.realmId ?? null,
        clientId: owner.clientId ?? null,
        decisionStrategy: null,
        policies,
    };
}

/** A catalog as GET /authorization serves it: every definition binds its grants. */
const CATALOG = {
    policies: {
        binding: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
        agent: { type: 'attributes', query: { agent: 'x' } },
    },
    permissions: [
        ...Object.values(OWNERS).map((owner) => definition(Permission.RUN_READ, owner)),
        definition('release_manage', OWNERS.global!),
        definition('release_manage', OWNERS.a!),
        definition('release_global', OWNERS.global!),
        definition(Permission.AGENT_RUN, OWNERS.a!, ['binding', 'agent']),
    ],
};

function grant(name: string, owner: Owner) {
    return {
        name,
        realm_scope: 'any',
        ...(owner.realmId ? { realm_id: owner.realmId } : {}),
        ...(owner.clientId ? { client_id: owner.clientId } : {}),
    };
}

async function snapshot(grants: unknown[]): Promise<AuthorizationSnapshot> {
    return JSON.parse(JSON.stringify(await buildAuthorizationSnapshot({ catalog: CATALOG, grants }))) as AuthorizationSnapshot;
}

async function holderOf(grants: unknown[], client?: string): Promise<PermissionHolder> {
    return {
        bindings: [],
        authorization: {
            snapshot: await snapshot(grants),
            realm: REALM,
            ...(client ? { client } : {}),
        },
        identity: {
            type: 'user',
            id: USER_ID,
            realmId: REALM,
            clientId: CLIENT_A,
        },
    };
}

async function expectBoth(holder: PermissionHolder, name: string, expected: boolean): Promise<void> {
    await expect(can(holder, name)).resolves.toBe(expected);
    await expect(canSome(holder, name)).resolves.toBe(expected);
}

describe('an authorization without an owner client', () => {
    it('grants through a global or a realm-owned definition', async () => {
        await expectBoth(await holderOf([grant(Permission.RUN_READ, OWNERS.global!)]), Permission.RUN_READ, true);
        await expectBoth(await holderOf([grant(Permission.RUN_READ, OWNERS.realm!)]), Permission.RUN_READ, true);
    });

    it('denies through a client-owned definition', async () => {
        await expectBoth(await holderOf([grant(Permission.RUN_READ, OWNERS.a!)]), Permission.RUN_READ, false);
    });
});

describe('an authorization with an owner client', () => {
    it('grants only through a definition of the owner client', async () => {
        await expectBoth(await holderOf([grant(Permission.RUN_READ, OWNERS.a!)], CLIENT_A), Permission.RUN_READ, true);
    });

    it('denies through global, realm-owned and other-client definitions', async () => {
        const grants = [OWNERS.global!, OWNERS.realm!, OWNERS.b!].map((owner) => grant(Permission.RUN_READ, owner));

        await expectBoth(await holderOf(grants.slice(0, 2), CLIENT_A), Permission.RUN_READ, false);
        await expectBoth(await holderOf(grants.slice(2), CLIENT_A), Permission.RUN_READ, false);
        await expectBoth(await holderOf(grants, CLIENT_A), Permission.RUN_READ, false);
    });

    it('checks an app name as a definition of the owner client too', async () => {
        await expectBoth(await holderOf([grant('release_manage', OWNERS.a!)], CLIENT_A), 'release_manage', true);
        await expectBoth(await holderOf([grant('release_manage', OWNERS.global!)], CLIENT_A), 'release_manage', false);
        await expectBoth(await holderOf([grant('release_global', OWNERS.global!)], CLIENT_A), 'release_global', false);
    });

    it('evaluates the attributes policy of an owned definition', async () => {
        const holder = await holderOf([grant(Permission.AGENT_RUN, OWNERS.a!)], CLIENT_A);

        await expect(can(holder, Permission.AGENT_RUN, { attributes: { agent: 'x' } })).resolves.toBe(true);
        await expect(can(holder, Permission.AGENT_RUN, { attributes: { agent: 'y' } })).resolves.toBe(false);
        await expect(canSome(holder, Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('keeps the mode of a stored invoker across a JSON round trip', async () => {
        const owned = JSON.parse(JSON.stringify(await holderOf([grant(Permission.RUN_READ, OWNERS.a!)], CLIENT_A))) as PermissionHolder;
        const realm = JSON.parse(JSON.stringify(await holderOf([grant(Permission.RUN_READ, OWNERS.realm!)]))) as PermissionHolder;

        expect(owned.authorization?.client).toBe(CLIENT_A);
        await expectBoth(owned, Permission.RUN_READ, true);
        expect(realm.authorization).not.toHaveProperty('client');
        await expectBoth(realm, Permission.RUN_READ, true);
    });

    it('grants nothing for a client that is not a non-empty string', async () => {
        for (const client of ['', 42, null]) {
            const holder = await holderOf([grant(Permission.RUN_READ, OWNERS.global!), grant(Permission.RUN_READ, OWNERS.a!)]);

            (holder.authorization as Record<string, unknown>).client = client;
            await expectBoth(holder, Permission.RUN_READ, false);
        }
    });
});
