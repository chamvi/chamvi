/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { toInvoker } from '../../../src/auth/helpers.ts';

const READ: PermissionBinding = { permission: { name: Permission.RUN_READ } };
const USER_ID = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';

describe('toInvoker', () => {
    it('keeps id, kind and a copy of the bindings, never the claims', () => {
        const bindings = [READ];
        const invoker = toInvoker({
            id: 'u1',
            kind: 'oidc',
            bindings,
            claims: { sub: 'u1', secret: 'x' },
        });

        expect(invoker).toEqual({
            id: 'u1',
            kind: 'oidc',
            bindings: [READ],
        });
        expect(invoker.bindings).not.toBe(bindings);
    });

    it('keeps a copy of the identity', () => {
        const identity = {
            type: 'user' as const,
            id: USER_ID,
            realmId: null,
        };
        const invoker = toInvoker({
            id: USER_ID,
            kind: 'authup',
            bindings: [READ],
            identity,
        });

        expect(invoker.identity).toEqual(identity);
        expect(invoker.identity).not.toBe(identity);
    });

    it('takes the name from name, then preferred_username, never email', () => {
        const base = {
            id: 'u1',
            kind: 'authup',
            bindings: [],
        };

        expect(toInvoker({
            ...base,
            claims: {
                name: 'Alice',
                preferred_username: 'alice',
                email: 'a@x',
            },
        }).name).toBe('Alice');
        expect(toInvoker({ ...base, claims: { preferred_username: 'alice', email: 'a@x' } }).name).toBe('alice');
        expect(toInvoker({ ...base, claims: { email: 'a@x' } })).not.toHaveProperty('name');
        expect(toInvoker({
            ...base,
            claims: {
                name: '',
                preferred_username: 42,
                email: 'a@x',
            },
        })).not.toHaveProperty('name');
        expect(toInvoker({ ...base, claims: {} })).not.toHaveProperty('name');
    });

    it('has no name for a principal without claims (static tokens)', () => {
        expect(toInvoker({
            id: 'ci',
            kind: 'token',
            bindings: [READ],
        })).toEqual({
            id: 'ci',
            kind: 'token',
            bindings: [READ],
        });
    });
});
