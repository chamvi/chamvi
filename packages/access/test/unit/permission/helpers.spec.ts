/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    PERMISSION_NAMES,
    Permission,
    allPermissions,
    can,
    isPermissionAuthorization,
    permissionNames,
} from '@chamvi/access';

const BINDING = { permission: { name: 'x' } };

describe('isPermissionAuthorization', () => {
    it.each([
        [{ realm: 'r', snapshot: { definitions: [] } }, true],
        [{ realm: 'r', snapshot: { definitions: [BINDING], grants: [BINDING] } }, true],
        [{ realm: 'r', snapshot: { definitions: [BINDING], grants: [] } }, true],
        [{ realm: '', snapshot: { definitions: [] } }, false],
        [{ realm: 1, snapshot: { definitions: [] } }, false],
        [{ snapshot: { definitions: [] } }, false],
        [{ realm: 'r' }, false],
        [{ realm: 'r', snapshot: null }, false],
        [{ realm: 'r', snapshot: {} }, false],
        [{ realm: 'r', snapshot: { definitions: [{ permission: { name: '' } }] } }, false],
        [{ realm: 'r', snapshot: { definitions: ['x'] } }, false],
        [{ realm: 'r', snapshot: { definitions: [], grants: 'x' } }, false],
        [{ realm: 'r', snapshot: { definitions: [], grants: [{}] } }, false],
        ['x', false],
        [null, false],
        [[], false],
    ])('%j is %s', (value, expected) => {
        expect(isPermissionAuthorization(value)).toBe(expected);
    });
});

describe('allPermissions', () => {
    it('is one unrestricted binding per chamvi name, a new array each call', async () => {
        const all = allPermissions();

        expect(all.map((binding) => binding.permission.name)).toEqual(PERMISSION_NAMES);
        expect(all.every((binding) => binding.policies === undefined)).toBe(true);
        expect(allPermissions()).not.toBe(all);
        await expect(can({ bindings: all }, Permission.CONNECTION_WRITE, { attributes: { name: 'mail', type: 'imap' } })).resolves.toBe(true);
    });
});

describe('permissionNames', () => {
    it('lists the distinct names of valid bindings in first-seen order', () => {
        const names = permissionNames({
            bindings: [
                { permission: { name: Permission.AGENT_RUN } },
                'agent:x:run' as never,
                { permission: { name: 'release_manage' } },
                { permission: { name: Permission.AGENT_RUN }, policies: [{ type: 'attributes', query: { name: 'a' } } as never] },
            ],
        });

        expect(names).toEqual([Permission.AGENT_RUN, 'release_manage']);
    });

    it('adds the names of the snapshot\'s grants, never of its definitions', () => {
        const names = permissionNames({
            bindings: [{ permission: { name: Permission.AGENT_RUN } }],
            authorization: {
                realm: 'r',
                snapshot: {
                    definitions: [
                        { permission: { name: Permission.AGENT_READ } },
                        { permission: { name: Permission.RUN_READ } },
                        { permission: { name: Permission.AGENT_RUN } },
                    ],
                    grants: [
                        { permission: { name: Permission.RUN_READ } },
                        { permission: { name: Permission.AGENT_RUN } },
                        { permission: { name: Permission.RUN_READ }, realmScope: 'own' },
                    ],
                },
            },
        });

        expect(names).toEqual([Permission.AGENT_RUN, Permission.RUN_READ]);
    });

    it('ignores a malformed authorization', () => {
        expect(permissionNames({ bindings: [], authorization: { realm: 'r', snapshot: { grants: 'x' } } as never })).toEqual([]);
    });

    it('is empty for a holder without bindings', () => {
        expect(permissionNames({ bindings: [] })).toEqual([]);
        expect(permissionNames({} as never)).toEqual([]);
    });
});
