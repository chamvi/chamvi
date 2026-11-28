/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission, allPermissions } from '@chamvi/access';
import type { PermissionAuthorization } from '@chamvi/access';
import { isActorGranted, isSystemActor } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { buildActorContext, isGranted, toInvoker } from '../../../src/auth/helpers/index.ts';
import type { Principal } from '../../../src/auth/types.ts';

const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';

const AUTHORIZATION: PermissionAuthorization = {
    realm: '0195f2a0-7c3e-7a4b-9c1d-000000000001',
    snapshot: {
        definitions: [{
            permission: {
                name: Permission.RUN_READ,
                realmId: null,
                clientId: null,
            },
        }],
        grants: [{
            permission: {
                name: Permission.RUN_READ,
                realmId: null,
                clientId: null,
            },
            realmScope: 'any',
        }],
    },
};

const PRINCIPALS: [string, Principal][] = [
    ['a static-token principal', {
        id: 'reader',
        kind: 'token',
        bindings: [{ permission: { name: Permission.RUN_READ } }],
    }],
    ['an authup-snapshot principal', {
        id: USER_ID,
        kind: 'authup',
        bindings: [],
        identity: {
            type: 'user',
            id: USER_ID,
            realmId: null,
        },
        authorization: AUTHORIZATION,
    }],
    ['an oidc-style principal', {
        id: 'u1',
        kind: 'oidc',
        bindings: [{ permission: { name: Permission.AGENT_READ } }],
        claims: { sub: 'u1', name: 'Alice' },
    }],
    ['a forged system principal', {
        id: 'system',
        kind: 'system',
        bindings: allPermissions(),
    }],
];

describe('buildActorContext', () => {
    it.each(PRINCIPALS)('never yields the system actor for %s', (_label, principal) => {
        expect(isSystemActor(buildActorContext(principal, new ControllableClock()))).toBe(false);
    });

    it.each(PRINCIPALS)('carries the invoker of %s as identity', (_label, principal) => {
        expect(buildActorContext(principal, new ControllableClock()).identity).toEqual(toInvoker(principal));
    });

    it('decides as isGranted at the clock time, with a date policy', async () => {
        const principal: Principal = {
            id: 'dated',
            kind: 'token',
            bindings: [{
                permission: { name: Permission.RUN_READ },
                policies: [{ type: 'date', end: '2027-01-01' } as never],
            }],
        };
        const clock = new ControllableClock(new Date(2026, 10, 11, 10, 0));
        const actor = buildActorContext(principal, clock);
        const cases: [string, Record<string, unknown> | undefined][] = [
            [Permission.RUN_READ, undefined],
            [Permission.RUN_READ, { agent: 'echo' }],
            [Permission.AGENT_READ, { name: 'echo', private: false }],
        ];
        const decide = () => Promise.all(cases.map(async ([name, attributes]) => [
            await isActorGranted(actor, name, attributes),
            await isGranted(principal, name, clock, attributes),
        ]));

        const before = await decide();

        clock.advance(new Date(2027, 10, 11, 10, 0).getTime() - clock.now());

        const after = await decide();

        expect(before.map(([actorGranted]) => actorGranted)).toEqual([true, true, false]);
        expect(after.map(([actorGranted]) => actorGranted)).toEqual([false, false, false]);

        for (const [actorGranted, granted] of [...before, ...after]) {
            expect(actorGranted).toBe(granted);
        }
    });
});
