/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildAuthorizationSnapshot } from '@authup/access';
import type { AuthorizationSnapshot } from '@authup/access';
import { describe, expect, it } from 'vitest';
import type { PermissionBinding, PermissionHolder, PermissionIdentity } from '@chamvi/access';
import {
    PERMISSION_NAMES,
    Permission,
    can,
    canSome,
} from '@chamvi/access';

const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';

const triageOnly: PermissionBinding = {
    permission: { name: Permission.AGENT_RUN },
    policies: [{ type: 'attributes', query: { name: 'triage' } } as never],
};

function holder(...bindings: PermissionBinding[]): PermissionHolder {
    return { bindings };
}

describe('can', () => {
    it('passes an unrestricted binding with and without attributes', async () => {
        const subject = holder({ permission: { name: Permission.AGENT_RUN } });

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(true);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'triage', private: false } })).resolves.toBe(true);
    });

    it('answers false for a name the holder has no binding for', async () => {
        const subject = holder({ permission: { name: Permission.AGENT_RUN } });

        await expect(can(subject, Permission.AGENT_READ)).resolves.toBe(false);
        await expect(canSome(subject, Permission.AGENT_READ)).resolves.toBe(false);
    });

    it('checks an app-defined name', async () => {
        const subject = holder({ permission: { name: 'release_manage' } });

        await expect(can(subject, 'release_manage')).resolves.toBe(true);
        await expect(can(subject, 'release_read')).resolves.toBe(false);
    });

    it('passes an attributes policy for a matching resource', async () => {
        await expect(can(holder(triageOnly), Permission.AGENT_RUN, { attributes: { name: 'triage' } })).resolves.toBe(true);
    });

    it('fails an attributes policy for another resource', async () => {
        await expect(can(holder(triageOnly), Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(false);
        await expect(canSome(holder(triageOnly), Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(false);
    });

    it('fails an attributes policy without attributes under can', async () => {
        await expect(can(holder(triageOnly), Permission.AGENT_RUN)).resolves.toBe(false);
    });

    it('passes an attributes policy without attributes under canSome', async () => {
        await expect(canSome(holder(triageOnly), Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('treats two bindings of one name as a disjunction', async () => {
        const subject = holder(triageOnly, {
            permission: { name: Permission.AGENT_RUN },
            policies: [{ type: 'attributes', query: { name: 'review' } } as never],
        });

        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'triage' } })).resolves.toBe(true);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'review' } })).resolves.toBe(true);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(false);
    });

    it('treats two policies in one binding as a conjunction', async () => {
        const subject = holder({
            permission: { name: Permission.AGENT_RUN },
            policies: [
                { type: 'attributes', query: { name: 'triage' } } as never,
                { type: 'attributes', query: { private: false } } as never,
            ],
        });

        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'triage', private: false } })).resolves.toBe(true);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'triage', private: true } })).resolves.toBe(false);
    });

    it('honors a decision strategy on the permission', async () => {
        const subject = holder({
            permission: { name: Permission.AGENT_RUN, decisionStrategy: 'affirmative' },
            policies: [
                { type: 'attributes', query: { name: 'triage' } } as never,
                { type: 'attributes', query: { name: 'review' } } as never,
            ],
        });

        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'review' } })).resolves.toBe(true);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(false);
    });

    it('fails an inverted attributes policy when the attributes are missing', async () => {
        const subject = holder({
            permission: { name: Permission.AGENT_RUN },
            policies: [{
                type: 'attributes', 
                query: { name: 'triage' }, 
                invert: true, 
            } as never],
        });

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(true);
    });

    it('passes an identity policy for the matching identity type and fails without identity', async () => {
        const binding: PermissionBinding = {
            permission: { name: Permission.AGENT_READ },
            policies: [{ type: 'identity', types: ['user'] } as never],
        };

        await expect(can({ bindings: [binding], identity: { type: 'user', id: USER_ID } }, Permission.AGENT_READ)).resolves.toBe(true);
        await expect(can({ bindings: [binding], identity: { type: 'client', id: USER_ID } }, Permission.AGENT_READ)).resolves.toBe(false);
        await expect(can({ bindings: [binding] }, Permission.AGENT_READ)).resolves.toBe(false);
    });

    it('evaluates a time policy at options.now', async () => {
        const subject = holder({
            permission: { name: Permission.TOOL_USE },
            policies: [{
                type: 'time', 
                start: '09:00', 
                end: '17:00', 
            } as never],
        });

        await expect(can(subject, Permission.TOOL_USE, { now: new Date(2026, 10, 11, 10, 0) })).resolves.toBe(true);
        await expect(can(subject, Permission.TOOL_USE, { now: new Date(2026, 10, 11, 20, 0) })).resolves.toBe(false);
    });

    it('grants nothing for old string permissions and never rejects', async () => {
        const subject = { bindings: ['agent:x:run', '*'] as never };

        for (const name of [...PERMISSION_NAMES, 'agent:x:run', '*']) {
            await expect(can(subject, name)).resolves.toBe(false);
            await expect(canSome(subject, name)).resolves.toBe(false);
        }
    });

    it('fails a binding with an unknown policy type while a sibling binding still passes', async () => {
        const broken: PermissionBinding = {
            permission: { name: Permission.AGENT_RUN },
            policies: [{ type: 'nope' } as never],
        };

        await expect(can(holder(broken), Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(canSome(holder(broken), Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(can(holder(broken, { permission: { name: Permission.AGENT_RUN } }), Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('denies a realmMatch policy node under can, with and without attributes', async () => {
        const subject = holder({
            permission: { name: Permission.AGENT_RUN },
            policies: [{ type: 'realmMatch' } as never],
        });

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'triage' } })).resolves.toBe(false);
        // upstream's pre-gate counts the node, whose identity data is missing, as pending
        await expect(canSome(subject, Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('denies a permissionBinding policy node', async () => {
        const plain: PermissionBinding = {
            permission: { name: Permission.AGENT_RUN },
            policies: [{ type: 'permissionBinding' } as never],
        };
        const inverted: PermissionBinding = {
            permission: { name: Permission.AGENT_RUN },
            policies: [{ type: 'permissionBinding', invert: true } as never],
        };

        await expect(can(holder(plain), Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(canSome(holder(plain), Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(can(holder(inverted), Permission.AGENT_RUN)).resolves.toBe(false);
    });

    it('skips entries that are not bindings', async () => {
        const subject = {
            bindings: [
                null,
                { permission: { name: '' } },
                { permission: { name: Permission.AGENT_RUN }, policies: 'x' },
                { permission: { name: Permission.AGENT_RUN }, policies: [{ invert: true }] },
            ] as never,
        };

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(false);

        const withValid = { bindings: [...subject.bindings, { permission: { name: Permission.AGENT_RUN } }] };

        await expect(can(withValid, Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('ignores the realmScope of a binding', async () => {
        const subject = holder({ permission: { name: Permission.AGENT_RUN }, realmScope: 'none' });

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(true);
        await expect(canSome(subject, Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('grants nothing to a holder of the former shape (a permissions array, no bindings)', async () => {
        const subject = { permissions: [{ permission: { name: 'x' } }] } as never;

        await expect(can(subject, 'x')).resolves.toBe(false);
        await expect(canSome(subject, 'x')).resolves.toBe(false);
    });

    it('never rejects for a holder without a bindings array', async () => {
        await expect(can({} as never, Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(canSome(null as never, Permission.AGENT_RUN)).resolves.toBe(false);
    });
});

describe('policies that cannot be evaluated', () => {
    const name = Permission.AGENT_RUN;

    function inverted(...children: unknown[]): PermissionBinding {
        return {
            permission: { name },
            policies: [{
                type: 'composite', 
                invert: true, 
                children, 
            } as never],
        };
    }

    const broken: Record<string, unknown> = {
        'a permissionBinding node': { type: 'permissionBinding' },
        'a realmMatch node': { type: 'realmMatch' },
        'an unknown type': { type: 'nope' },
        'a node without a type': { query: { name: 'triage' } },
        'an attributes policy without a query': { type: 'attributes' },
        'a malformed time policy': { type: 'time', start: 'zz' },
        'a composite with an unknown decision strategy': {
            type: 'composite',
            decisionStrategy: 'garbage',
            children: [{ type: 'attributes', query: { name: 'triage' } }],
        },
        'an empty composite': { type: 'composite', children: [] },
    };

    for (const [label, child] of Object.entries(broken)) {
        it(`fails ${label} below an inverted composite`, async () => {
            const subject = holder(inverted(child));
            const attributes = { name: 'other', private: false };
            // upstream's pre-gate counts a realmMatch node without identity data as pending
            const some = label === 'a realmMatch node';

            await expect(can(subject, name, { attributes })).resolves.toBe(false);
            await expect(can(subject, name)).resolves.toBe(false);
            await expect(canSome(subject, name, { attributes })).resolves.toBe(some);
            await expect(canSome(subject, name)).resolves.toBe(some);
        });
    }

    it('fails an attributes query that does not parse below an inverted composite once attributes are given', async () => {
        const subject = holder(inverted({ type: 'attributes', query: { name: { $nope: 1 } } }));
        const attributes = { name: 'other' };

        await expect(can(subject, name, { attributes })).resolves.toBe(false);
        await expect(can(subject, name)).resolves.toBe(false);
        await expect(canSome(subject, name, { attributes })).resolves.toBe(false);
    });

    it('fails a broken node below a composite nested in an inverted composite', async () => {
        const subject = holder(inverted({ type: 'composite', children: [{ type: 'permissionBinding' }] }));

        await expect(can(subject, name, { attributes: { name: 'other' } })).resolves.toBe(false);
        await expect(canSome(subject, name)).resolves.toBe(false);
    });

    it('fails an inverted identity policy when the identity does not validate', async () => {
        const binding = inverted({ type: 'identity', types: ['user'] });
        const invalid: PermissionHolder = { bindings: [binding], identity: { type: 'user', id: 'alice' } };
        const valid: PermissionHolder = { bindings: [binding], identity: { type: 'user', id: USER_ID } };
        const client: PermissionHolder = { bindings: [binding], identity: { type: 'client', id: USER_ID } };

        await expect(can(invalid, name)).resolves.toBe(false);
        await expect(canSome(invalid, name)).resolves.toBe(false);
        await expect(can(valid, name)).resolves.toBe(false);
        await expect(can(client, name)).resolves.toBe(true);
    });

    it('keeps a broken binding from blocking a sibling binding', async () => {
        const subject = holder(inverted({ type: 'nope' }), triageOnly);

        await expect(can(subject, name, { attributes: { name: 'triage' } })).resolves.toBe(true);
        await expect(can(subject, name, { attributes: { name: 'other' } })).resolves.toBe(false);
    });

    it('still evaluates a valid inverted composite', async () => {
        const subject = holder(inverted({ type: 'attributes', query: { name: 'triage' } }));

        await expect(can(subject, name, { attributes: { name: 'other' } })).resolves.toBe(true);
        await expect(can(subject, name, { attributes: { name: 'triage' } })).resolves.toBe(false);
    });
});

describe('bindings the check cannot copy', () => {
    const name = Permission.AGENT_RUN;

    /** A deep proxy, as a reactive store hands it out: structuredClone refuses it. */
    function proxied<T>(value: T): T {
        if (typeof value !== 'object' || value === null) {
            return value;
        }

        return new Proxy(value as object, { get: (target, key) => proxied(Reflect.get(target, key)) }) as T;
    }

    it('evaluates a restricted binding of a proxied holder', async () => {
        const subject = proxied(holder(triageOnly));

        await expect(can(subject, name, { attributes: { name: 'triage' } })).resolves.toBe(true);
        await expect(can(subject, name, { attributes: { name: 'other' } })).resolves.toBe(false);
        await expect(canSome(subject, name)).resolves.toBe(true);
    });

    it('fails only the binding that cannot be copied', async () => {
        const policy: Record<string, unknown> = { type: 'attributes', query: { name: 'triage' } };

        policy.self = policy;

        const cyclic: PermissionBinding = { permission: { name }, policies: [policy as never] };

        await expect(can(holder(cyclic), name, { attributes: { name: 'triage' } })).resolves.toBe(false);
        await expect(can(holder(cyclic, { permission: { name } }), name, { attributes: { name: 'triage' } })).resolves.toBe(true);
        await expect(canSome(holder(cyclic, { permission: { name } }), name)).resolves.toBe(true);
    });

    it('leaves the holder\'s policies unchanged', async () => {
        const binding: PermissionBinding = {
            permission: { name },
            policies: [{ type: 'attributes', query: { name: { $regex: '/^tri/' } } } as never],
        };
        const before = structuredClone(binding);

        await expect(can(holder(binding), name, { attributes: { name: 'triage' } })).resolves.toBe(true);
        expect(binding).toEqual(before);
    });
});

const APP_REALM = '0195f2a0-7c3e-7a4b-9c1d-000000000001';
const OTHER_REALM = '0195f2a0-7c3e-7a4b-9c1d-000000000002';
const CLIENT_ID = '0195f2a0-7c3e-7a4b-9c1d-000000000003';

/** A catalog as GET /authorization serves it: every definition binds its grants. */
const CATALOG = {
    policies: {
        binding: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
        triage: { type: 'attributes', query: { name: 'triage' } },
    },
    permissions: [
        Permission.AGENT_RUN,
        Permission.AGENT_READ,
        Permission.RUN_READ,
    ].map((name) => definition(name)).concat([
        definition('release_manage', { realmId: APP_REALM }),
        definition('release_other', { realmId: OTHER_REALM }),
        definition('release_client', { clientId: CLIENT_ID }),
    ]),
};

const GRANTS = [
    {
        name: Permission.AGENT_RUN, 
        realm_scope: 'any', 
        policies: ['triage'], 
    },
    { name: Permission.RUN_READ, realm_scope: 'own' },
    {
        name: 'release_manage', 
        realm_id: APP_REALM, 
        realm_scope: 'any', 
    },
    {
        name: 'release_other', 
        realm_id: OTHER_REALM, 
        realm_scope: 'any', 
    },
    {
        name: 'release_client', 
        client_id: CLIENT_ID, 
        realm_scope: 'any', 
    },
];

function definition(name: string, owner: { realmId?: string; clientId?: string } = {}) {
    return {
        name,
        realmId: owner.realmId ?? null,
        clientId: owner.clientId ?? null,
        decisionStrategy: null,
        policies: ['binding'],
    };
}

/** The snapshot as a run's invoker stores it: plain JSON. */
async function snapshot(grants: unknown[] = GRANTS): Promise<AuthorizationSnapshot> {
    return JSON.parse(JSON.stringify(await buildAuthorizationSnapshot({ catalog: CATALOG, grants }))) as AuthorizationSnapshot;
}

function identityIn(realmId: string): PermissionIdentity {
    return {
        type: 'user', 
        id: USER_ID, 
        realmId, 
    };
}

async function snapshotHolder(identity: PermissionIdentity | undefined = identityIn(APP_REALM)): Promise<PermissionHolder> {
    return {
        bindings: [],
        authorization: { snapshot: await snapshot(), realm: APP_REALM },
        ...(identity ? { identity } : {}),
    };
}

describe('authorization snapshots', () => {
    it('passes a grant that reaches the app realm', async () => {
        const subject = await snapshotHolder();

        await expect(can(subject, Permission.RUN_READ)).resolves.toBe(true);
        await expect(canSome(subject, Permission.RUN_READ)).resolves.toBe(true);
    });

    it('denies a grant of reach own for an identity of another realm', async () => {
        const subject = await snapshotHolder(identityIn(OTHER_REALM));

        await expect(can(subject, Permission.RUN_READ)).resolves.toBe(false);
        await expect(canSome(subject, Permission.RUN_READ)).resolves.toBe(false);
    });

    it('decides a junction attributes policy per resource', async () => {
        const subject = await snapshotHolder();

        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'triage' } })).resolves.toBe(true);
        await expect(can(subject, Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(false);
        await expect(canSome(subject, Permission.AGENT_RUN, { attributes: { name: 'other' } })).resolves.toBe(false);
    });

    it('passes a junction attributes policy without attributes under canSome only', async () => {
        const subject = await snapshotHolder();

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(false);
        await expect(canSome(subject, Permission.AGENT_RUN)).resolves.toBe(true);
    });

    it('denies a name the identity holds no grant of', async () => {
        const subject = await snapshotHolder();

        await expect(can(subject, Permission.AGENT_READ)).resolves.toBe(false);
        await expect(canSome(subject, Permission.AGENT_READ)).resolves.toBe(false);
        await expect(can(subject, 'unknown_name')).resolves.toBe(false);
    });

    it('reaches a definition owned by the app realm through the bare name', async () => {
        await expect(can(await snapshotHolder(), 'release_manage')).resolves.toBe(true);
    });

    it('never reaches a definition owned by another realm or by a client', async () => {
        const subject = await snapshotHolder();

        for (const name of ['release_other', 'release_client']) {
            await expect(can(subject, name)).resolves.toBe(false);
            await expect(canSome(subject, name)).resolves.toBe(false);
        }
    });

    it('grants nothing without an identity', async () => {
        const subject = await snapshotHolder(null as never);

        await expect(can(subject, Permission.RUN_READ)).resolves.toBe(false);
        await expect(canSome(subject, Permission.RUN_READ)).resolves.toBe(false);
    });

    it('grants nothing for a malformed snapshot and never rejects', async () => {
        const identity = identityIn(APP_REALM);
        const malformed: unknown[] = [
            { definitions: 'nope' },
            { definitions: [{ permission: { name: Permission.RUN_READ } }], grants: 'nope' },
            { definitions: [{ permission: { name: Permission.RUN_READ }, realmScope: 'any' }] },
            null,
        ];

        for (const value of malformed) {
            const subject = {
                bindings: [], 
                authorization: { snapshot: value as never, realm: APP_REALM }, 
                identity, 
            };

            await expect(can(subject, Permission.RUN_READ)).resolves.toBe(false);
            await expect(canSome(subject, Permission.RUN_READ)).resolves.toBe(false);
        }

        await expect(can({
            bindings: [], 
            authorization: 'nope' as never, 
            identity, 
        }, Permission.RUN_READ)).resolves.toBe(false);
        await expect(can({
            bindings: [], 
            authorization: { snapshot: await snapshot(), realm: '' }, 
            identity, 
        }, Permission.RUN_READ)).resolves.toBe(false);
    });

    it('passes when either source passes', async () => {
        const subject: PermissionHolder = {
            ...await snapshotHolder(),
            bindings: [{ permission: { name: Permission.AGENT_READ } }],
        };

        await expect(can(subject, Permission.AGENT_READ)).resolves.toBe(true);
        await expect(can(subject, Permission.RUN_READ)).resolves.toBe(true);
        await expect(can(subject, Permission.RUN_CANCEL)).resolves.toBe(false);
    });

    it('evaluates a holder again once its bindings or authorization are replaced', async () => {
        const subject: PermissionHolder = { ...await snapshotHolder(), bindings: [] };

        await expect(can(subject, Permission.AGENT_READ)).resolves.toBe(false);

        subject.bindings = [{ permission: { name: Permission.AGENT_READ } }];
        await expect(can(subject, Permission.AGENT_READ)).resolves.toBe(true);

        await expect(can(subject, Permission.RUN_READ)).resolves.toBe(true);
        subject.authorization = { snapshot: await snapshot([]), realm: APP_REALM };
        await expect(can(subject, Permission.RUN_READ)).resolves.toBe(false);
    });
});
