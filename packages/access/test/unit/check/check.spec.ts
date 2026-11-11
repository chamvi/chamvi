/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { PermissionBinding, PermissionHolder } from '@chamvi/access';
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

function holder(...permissions: PermissionBinding[]): PermissionHolder {
    return { permissions };
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

        await expect(can({ permissions: [binding], identity: { type: 'user', id: USER_ID } }, Permission.AGENT_READ)).resolves.toBe(true);
        await expect(can({ permissions: [binding], identity: { type: 'client', id: USER_ID } }, Permission.AGENT_READ)).resolves.toBe(false);
        await expect(can({ permissions: [binding] }, Permission.AGENT_READ)).resolves.toBe(false);
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
        const subject = { permissions: ['agent:x:run', '*'] as never };

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
            permissions: [
                null,
                { permission: { name: '' } },
                { permission: { name: Permission.AGENT_RUN }, policies: 'x' },
                { permission: { name: Permission.AGENT_RUN }, policies: [{ invert: true }] },
            ] as never,
        };

        await expect(can(subject, Permission.AGENT_RUN)).resolves.toBe(false);
    });

    it('never rejects for a holder without a permissions array', async () => {
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

            await expect(can(subject, name, { attributes })).resolves.toBe(false);
            await expect(can(subject, name)).resolves.toBe(false);
            await expect(canSome(subject, name, { attributes })).resolves.toBe(false);
            await expect(canSome(subject, name)).resolves.toBe(false);
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
        const invalid: PermissionHolder = { permissions: [binding], identity: { type: 'user', id: 'alice' } };
        const valid: PermissionHolder = { permissions: [binding], identity: { type: 'user', id: USER_ID } };
        const client: PermissionHolder = { permissions: [binding], identity: { type: 'client', id: USER_ID } };

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
