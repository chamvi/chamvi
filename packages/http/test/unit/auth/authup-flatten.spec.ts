/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isAuthorizationCatalogStaleError } from '@authup/access';
import type { PermissionIdentity } from '@chamvi/access';
import { describe, expect, it } from 'vitest';
import { flattenGrants } from '../../../src/auth/authup/flatten.ts';

const REALM = 'c641912c-21e5-4cb4-84b6-169e2b2bb023';
const OTHER_REALM = 'c641912c-21e5-4cb4-84b6-169e2b2bb024';
const CLIENT = 'c641912c-21e5-4cb4-84b6-169e2b2bb025';

const identity: PermissionIdentity = {
    type: 'user',
    id: '245e3c5d-5747-4fbd-8554-c33d34780c58',
    realmId: REALM,
    realmName: 'master',
    clientId: null,
};

type Definition = {
    name: string;
    realmId: string | null;
    clientId: string | null;
    decisionStrategy: string | null;
    policies: string[] | null;
};

type Grant = {
    name: string;
    realm_id?: string | null;
    client_id?: string | null;
    realm_scope?: string | null;
    policies?: string[] | null;
};

const POLICIES: Record<string, Record<string, unknown>> = {
    // authup's system.default, bound to every permission it creates
    default: {
        type: 'composite',
        decisionStrategy: 'unanimous',
        children: [{ type: 'identity' }, { type: 'permissionBinding' }],
    },
    triage: { type: 'attributes', query: { name: 'triage' } },
    users: { type: 'identity', types: ['user'] },
    unknown: { type: 'nope' },
    invertedBinding: {
        type: 'composite',
        decisionStrategy: 'unanimous',
        children: [{ type: 'identity' }, { type: 'permissionBinding', invert: true }],
    },
    affirmativeBinding: {
        type: 'composite',
        decisionStrategy: 'affirmative',
        children: [{ type: 'identity' }, { type: 'permissionBinding' }],
    },
    invertedComposite: {
        type: 'composite',
        invert: true,
        children: [{ type: 'permissionBinding' }],
    },
    binding: { type: 'permissionBinding' },
    grantWithBinding: {
        type: 'composite',
        children: [{ type: 'attributes', query: { name: 'triage' } }, { type: 'permissionBinding' }],
    },
};

function definition(name: string, policies: string[] | null = ['default'], overrides: Partial<Definition> = {}): Definition {
    return {
        name,
        realmId: null,
        clientId: null,
        decisionStrategy: null,
        policies,
        ...overrides,
    };
}

function catalog(...permissions: Definition[]) {
    return { policies: POLICIES, permissions };
}

function grant(name: string, overrides: Partial<Grant> = {}): Grant {
    return {
        name,
        realm_id: null,
        client_id: null,
        realm_scope: 'own',
        policies: [],
        ...overrides,
    };
}

const flatten = (permissions: Definition[], grants: Grant[], who: PermissionIdentity = identity) => flattenGrants({
    catalog: catalog(...permissions),
    grants,
    identity: who,
    realm: REALM,
});

describe('flattenGrants', () => {
    it('reduces system.default to its identity node for a plain grant', async () => {
        const bindings = await flatten([definition('chamvi_agent_run')], [grant('chamvi_agent_run')]);

        expect(bindings).toEqual([{
            permission: { name: 'chamvi_agent_run' },
            policies: [{ type: 'identity' }],
        }]);
    });

    it('appends the junction policy of the grant after the definition layer', async () => {
        const bindings = await flatten(
            [definition('chamvi_agent_run')],
            [grant('chamvi_agent_run', { policies: ['triage'] })],
        );

        expect(bindings).toEqual([{
            permission: { name: 'chamvi_agent_run' },
            policies: [{ type: 'identity' }, { type: 'attributes', query: { name: 'triage' } }],
        }]);
    });

    it('keeps a definition without policies unrestricted for the grant holder', async () => {
        const bindings = await flatten([definition('chamvi_agent_run', [])], [grant('chamvi_agent_run')]);

        expect(bindings).toEqual([{ permission: { name: 'chamvi_agent_run' } }]);
    });

    it('drops an own grant of an identity from another realm and keeps an any grant', async () => {
        const foreign = {
            ...identity, 
            realmId: OTHER_REALM, 
            realmName: 'other', 
        };

        expect(await flatten([definition('chamvi_agent_run')], [grant('chamvi_agent_run')], foreign)).toEqual([]);
        expect(await flatten(
            [definition('chamvi_agent_run')],
            [grant('chamvi_agent_run', { realm_scope: 'any' })],
            foreign,
        )).toHaveLength(1);
    });

    it('drops a grant with reach none and keeps one with reach ownOrNull', async () => {
        expect(await flatten(
            [definition('chamvi_agent_run')],
            [grant('chamvi_agent_run', { realm_scope: 'none' })],
        )).toEqual([]);
        expect(await flatten(
            [definition('chamvi_agent_run')],
            [grant('chamvi_agent_run', { realm_scope: 'ownOrNull' })],
        )).toHaveLength(1);
    });

    it('reads a missing reach as own', async () => {
        const foreign = {
            ...identity, 
            realmId: OTHER_REALM, 
            realmName: 'other', 
        };

        expect(await flatten([definition('chamvi_agent_run')], [grant('chamvi_agent_run', { realm_scope: null })])).toHaveLength(1);
        expect(await flatten([definition('chamvi_agent_run')], [grant('chamvi_agent_run', { realm_scope: null })], foreign)).toEqual([]);
    });

    it('drops a grant whose definition has policies null and keeps the others', async () => {
        const bindings = await flatten(
            [definition('chamvi_agent_read', null), definition('chamvi_agent_run')],
            [grant('chamvi_agent_read'), grant('chamvi_agent_run')],
        );

        expect(bindings.map((binding) => binding.permission.name)).toEqual(['chamvi_agent_run']);
    });

    it('drops a grant of an unevaluable definition before its junction policies can read as stale', async () => {
        const bindings = await flatten(
            [definition('chamvi_agent_read', null), definition('chamvi_agent_run')],
            [grant('chamvi_agent_read', { policies: ['later'] }), grant('chamvi_agent_run', { policies: ['unknown', 'later'] }), grant('chamvi_agent_run')],
        );

        expect(bindings.map((binding) => binding.permission.name)).toEqual(['chamvi_agent_run']);
    });

    it('drops a grant naming a policy of an unknown type, and a grant of a definition using one', async () => {
        const bindings = await flatten(
            [
                definition('chamvi_agent_read', ['unknown']),
                definition('chamvi_agent_run'),
                definition('chamvi_run_read'),
            ],
            [
                grant('chamvi_agent_read'),
                grant('chamvi_agent_run', { policies: ['unknown'] }),
                grant('chamvi_run_read'),
            ],
        );

        expect(bindings.map((binding) => binding.permission.name)).toEqual(['chamvi_run_read']);
    });

    it('throws the stale error for a grant whose definition the catalog lacks', async () => {
        const outcome = flatten([definition('chamvi_agent_run')], [grant('chamvi_agent_read')]);

        await expect(outcome).rejects.toSatisfy(isAuthorizationCatalogStaleError);
    });

    it('throws the stale error for a grant naming a policy the catalog lacks', async () => {
        const outcome = flatten([definition('chamvi_agent_run')], [grant('chamvi_agent_run', { policies: ['later'] })]);

        await expect(outcome).rejects.toSatisfy(isAuthorizationCatalogStaleError);
    });

    it('matches the definition by realm and client of the grant', async () => {
        const owned = definition('chamvi_agent_run', ['default'], { realmId: REALM });

        expect(await flatten([owned], [grant('chamvi_agent_run', { realm_id: REALM })])).toHaveLength(1);
        await expect(flatten([owned], [grant('chamvi_agent_run')])).rejects.toSatisfy(isAuthorizationCatalogStaleError);
    });

    it('drops a grant of a definition owned by another realm or by a client', async () => {
        const bindings = await flatten(
            [
                definition('chamvi_agent_run', ['default'], { realmId: OTHER_REALM }),
                definition('chamvi_agent_read', ['default'], { clientId: CLIENT }),
            ],
            [
                grant('chamvi_agent_run', { realm_id: OTHER_REALM, realm_scope: 'any' }),
                grant('chamvi_agent_read', { client_id: CLIENT }),
            ],
        );

        expect(bindings).toEqual([]);
    });

    it('drops a grant whose definition inverts the permission binding', async () => {
        expect(await flatten([definition('chamvi_agent_run', ['invertedBinding'])], [grant('chamvi_agent_run')])).toEqual([]);
    });

    it('drops a grant whose binding node sits below an inverted composite', async () => {
        expect(await flatten([definition('chamvi_agent_run', ['invertedComposite'])], [grant('chamvi_agent_run')])).toEqual([]);
    });

    it('drops a grant whose binding node sits below an affirmative composite', async () => {
        expect(await flatten([definition('chamvi_agent_run', ['affirmativeBinding'])], [grant('chamvi_agent_run')])).toEqual([]);
    });

    it('drops a grant whose binding node sits beside another tree under a non-unanimous definition', async () => {
        const affirmative = definition('chamvi_agent_run', ['users', 'default'], { decisionStrategy: 'affirmative' });

        expect(await flatten([affirmative], [grant('chamvi_agent_run')])).toEqual([]);
    });

    it('removes a top-level binding tree', async () => {
        const bindings = await flatten([definition('chamvi_agent_run', ['binding', 'users'])], [grant('chamvi_agent_run')]);

        expect(bindings).toEqual([{
            permission: { name: 'chamvi_agent_run' },
            policies: [{ type: 'identity', types: ['user'] }],
        }]);
    });

    it('drops a grant whose own policy evaluates the permission binding', async () => {
        expect(await flatten(
            [definition('chamvi_agent_run')],
            [grant('chamvi_agent_run', { policies: ['grantWithBinding'] })],
        )).toEqual([]);
    });

    it('carries the decision strategy and keeps both layers conjunctive', async () => {
        const affirmative = definition('chamvi_agent_run', ['default'], { decisionStrategy: 'affirmative' });
        const bindings = await flatten([affirmative], [grant('chamvi_agent_run', { policies: ['triage', 'users'] })]);

        expect(bindings).toEqual([{
            permission: { name: 'chamvi_agent_run', decisionStrategy: 'affirmative' },
            policies: [{
                type: 'composite',
                decisionStrategy: 'unanimous',
                children: [
                    { type: 'identity' },
                    {
                        type: 'composite',
                        decisionStrategy: 'affirmative',
                        children: [
                            { type: 'attributes', query: { name: 'triage' } },
                            { type: 'identity', types: ['user'] },
                        ],
                    },
                ],
            }],
        }]);
    });

    it('carries a unanimous decision strategy over the flat list', async () => {
        const unanimous = definition('chamvi_agent_run', ['default'], { decisionStrategy: 'unanimous' });
        const bindings = await flatten([unanimous], [grant('chamvi_agent_run', { policies: ['triage'] })]);

        expect(bindings).toEqual([{
            permission: { name: 'chamvi_agent_run', decisionStrategy: 'unanimous' },
            policies: [{ type: 'identity' }, { type: 'attributes', query: { name: 'triage' } }],
        }]);
    });

    it('passes grants of names outside chamvi through', async () => {
        const bindings = await flatten([definition('release_manage')], [grant('release_manage', { policies: ['triage'] })]);

        expect(bindings).toEqual([{
            permission: { name: 'release_manage' },
            policies: [{ type: 'identity' }, { type: 'attributes', query: { name: 'triage' } }],
        }]);
    });

    it('returns bindings that share no objects with the catalog', async () => {
        const document = catalog(definition('chamvi_agent_run'));
        const [binding] = await flattenGrants({
            catalog: document,
            grants: [grant('chamvi_agent_run', { policies: ['triage'] })],
            identity,
            realm: REALM,
        });

        (binding!.policies![1] as { query: { name: string } }).query.name = 'other';

        expect(POLICIES.triage).toEqual({ type: 'attributes', query: { name: 'triage' } });
    });

    it('drops a malformed grant and keeps the well-formed ones', async () => {
        const bindings = await flatten(
            [definition('chamvi_agent_run')],
            [{ name: '' } as Grant, grant('chamvi_agent_run')],
        );

        expect(bindings).toHaveLength(1);
    });

    it('rejects a malformed catalog', async () => {
        await expect(flattenGrants({
            catalog: { permissions: 'nope' },
            grants: [grant('chamvi_agent_run')],
            identity,
            realm: REALM,
        })).rejects.toBeDefined();
    });
});
