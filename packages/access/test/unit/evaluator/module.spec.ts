/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    BuiltInPolicyType,
    PermissionError,
    PolicyData,
    buildAuthorizationSnapshot,
} from '@authup/access';
import type { AuthorizationSnapshot, IPermissionEvaluator } from '@authup/access';
import { describe, expect, it } from 'vitest';
import type { PermissionBinding, PermissionHolder } from '@chamvi/access';
import {
    HolderPermissionEvaluator,
    Permission,
    can,
    canSome,
} from '@chamvi/access';

const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';
const REALM = '0195f2a0-7c3e-7a4b-9c1d-000000000001';

function restricted(name: string, query: Record<string, unknown>): PermissionBinding {
    return {
        permission: { name },
        policies: [{ type: 'attributes', query } as never],
    };
}

/** The catalog of `check/owner.spec.ts`, reduced to the global definitions. */
const CATALOG = {
    policies: {
        binding: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
    },
    permissions: [Permission.RUN_READ, Permission.AGENT_READ].map((name) => ({
        name,
        realmId: null,
        clientId: null,
        decisionStrategy: null,
        policies: ['binding'],
    })),
};

async function snapshotHolder(): Promise<PermissionHolder> {
    const snapshot = await buildAuthorizationSnapshot({
        catalog: CATALOG,
        grants: [{ name: Permission.RUN_READ, realm_scope: 'any' }],
    });

    return {
        bindings: [],
        authorization: {
            snapshot: JSON.parse(JSON.stringify(snapshot)) as AuthorizationSnapshot,
            realm: REALM,
        },
        identity: {
            type: 'user',
            id: USER_ID,
            realmId: REALM,
        },
    };
}

const NAMES: (string | string[])[] = [
    Permission.RUN_READ,
    Permission.AGENT_READ,
    [Permission.RUN_READ, Permission.AGENT_READ],
];

const ATTRIBUTES: (Record<string, unknown> | undefined)[] = [undefined, { agent: 'echo' }, { agent: 'x' }];

const NOWS = [new Date(2026, 10, 11, 10, 0), new Date(2027, 10, 11, 10, 0)];

async function holders(): Promise<[string, PermissionHolder][]> {
    return [
        ['an unrestricted binding', { bindings: [{ permission: { name: Permission.RUN_READ } }] }],
        ['a restricted binding', { bindings: [restricted(Permission.RUN_READ, { agent: 'echo' })] }],
        ['a date binding', {
            bindings: [{
                permission: { name: Permission.RUN_READ },
                policies: [{ type: 'date', end: '2027-01-01' } as never],
            }],
        }],
        ['an authup snapshot', await snapshotHolder()],
        ['malformed bindings', { bindings: [42] } as unknown as PermissionHolder],
        ['null', null as unknown as PermissionHolder],
    ];
}

function dataOf(attributes: Record<string, unknown> | undefined): PolicyData | undefined {
    if (!attributes) {
        return undefined;
    }

    const data = new PolicyData();

    data.set(BuiltInPolicyType.ATTRIBUTES, attributes);

    return data;
}

async function settles(promise: Promise<void>): Promise<boolean> {
    try {
        await promise;

        return true;
    } catch {
        return false;
    }
}

type Check = (holder: PermissionHolder, name: string, options: { attributes?: Record<string, unknown>; now?: Date }) => Promise<boolean>;

async function expected(
    check: Check,
    every: boolean,
    holder: PermissionHolder,
    names: string[],
    attributes: Record<string, unknown> | undefined,
    now: Date,
): Promise<boolean> {
    const results = await Promise.all(names.map((n) => check(holder, n, { ...(attributes ? { attributes } : {}), now })));

    return every ? results.every(Boolean) : results.some(Boolean);
}

describe('HolderPermissionEvaluator', () => {
    it('decides as can and canSome for every holder, name, resource and time', async () => {
        const outcomes = new Set<string>();
        let compared = 0;

        for (const [label, holder] of await holders()) {
            for (const name of NAMES) {
                const names = Array.isArray(name) ? name : [name];

                for (const attributes of ATTRIBUTES) {
                    for (const now of NOWS) {
                        const evaluator = new HolderPermissionEvaluator(holder, { now: () => now });
                        const data = dataOf(attributes);
                        const where = `${label} ${names.join('+')} ${JSON.stringify(attributes)} ${now.toISOString()}`;

                        const every = await expected(can, true, holder, names, attributes, now);

                        outcomes.add(`${label}:${every}`);
                        expect(await settles(evaluator.evaluate({ name, data })), `evaluate ${where}`).toBe(every);
                        expect(await settles(evaluator.evaluateOneOf({ name, data })), `evaluateOneOf ${where}`)
                            .toBe(await expected(can, false, holder, names, attributes, now));
                        expect(await settles(evaluator.preEvaluate({ name, data })), `preEvaluate ${where}`)
                            .toBe(await expected(canSome, true, holder, names, attributes, now));
                        expect(await settles(evaluator.preEvaluateOneOf({ name, data })), `preEvaluateOneOf ${where}`)
                            .toBe(await expected(canSome, false, holder, names, attributes, now));
                        compared += 4;
                    }
                }
            }
        }

        expect(compared).toBe(6 * 3 * 3 * 2 * 4);
        // every well-formed holder both passes and fails somewhere; the malformed ones only fail
        expect([...outcomes].sort()).toEqual([
            'a date binding:false',
            'a date binding:true',
            'a restricted binding:false',
            'a restricted binding:true',
            'an authup snapshot:false',
            'an authup snapshot:true',
            'an unrestricted binding:false',
            'an unrestricted binding:true',
            'malformed bindings:false',
            'null:false',
        ]);
    });

    it('reads the attributes from the policy data and none without data', async () => {
        const evaluator = new HolderPermissionEvaluator({ bindings: [restricted(Permission.RUN_READ, { agent: 'echo' })] });

        await expect(evaluator.evaluate({ name: Permission.RUN_READ, data: dataOf({ agent: 'echo' }) })).resolves.toBeUndefined();
        await expect(evaluator.evaluate({ name: Permission.RUN_READ, data: dataOf({ agent: 'x' }) })).rejects.toThrow();
        await expect(evaluator.evaluate({ name: Permission.RUN_READ })).rejects.toThrow();
        await expect(evaluator.evaluate({ name: Permission.RUN_READ, data: new PolicyData() })).rejects.toThrow();
        await expect(evaluator.preEvaluate({ name: Permission.RUN_READ })).resolves.toBeUndefined();
    });

    it('takes now from the injected function, never from the policy data', async () => {
        const holder: PermissionHolder = {
            bindings: [{
                permission: { name: Permission.RUN_READ },
                policies: [{ type: 'date', end: '2027-01-01' } as never],
            }],
        };
        const evaluator = new HolderPermissionEvaluator(holder, { now: () => new Date(2028, 0, 1) });
        const data = new PolicyData();

        data.set(BuiltInPolicyType.DATE, new Date(2026, 0, 1));

        await expect(evaluator.evaluate({ name: Permission.RUN_READ, data })).rejects.toThrow();
    });

    it('rejects a denial with a PermissionError', async () => {
        const evaluator = new HolderPermissionEvaluator({ bindings: [] });

        await expect(evaluator.evaluate({ name: Permission.RUN_READ })).rejects.toBeInstanceOf(PermissionError);
        await expect(evaluator.evaluateOneOf({ name: [Permission.RUN_READ, Permission.AGENT_READ] })).rejects.toBeInstanceOf(PermissionError);
        await expect(evaluator.preEvaluate({ name: Permission.RUN_READ })).rejects.toThrow(`The permission ${Permission.RUN_READ} has not been granted.`);
    });

    it('compiles to a post check', async () => {
        const evaluator: IPermissionEvaluator = new HolderPermissionEvaluator({ bindings: [] });

        await expect(evaluator.compile({ name: Permission.RUN_READ })).resolves.toEqual({ verdict: 'post' });
    });
});
