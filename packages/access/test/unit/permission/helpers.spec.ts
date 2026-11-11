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
    isPermissionBinding,
    permissionNames,
} from '@chamvi/access';

describe('isPermissionBinding', () => {
    it.each([
        [{ permission: { name: 'x' } }, true],
        [{ permission: { name: 'x' }, policies: [] }, true],
        [{ permission: { name: 'x' }, policies: [{ type: 'attributes', query: {} }] }, true],
        [{ permission: { name: '' } }, false],
        [{ permission: 'x' }, false],
        [{ permission: { name: 1 } }, false],
        [{ permission: { name: 'x' }, policies: {} }, false],
        [{ permission: { name: 'x' }, policies: [{}] }, false],
        [{ permission: { name: 'x' }, policies: [null] }, false],
        ['agent:x:run', false],
        ['*', false],
        [null, false],
        [[], false],
    ])('%j is %s', (value, expected) => {
        expect(isPermissionBinding(value)).toBe(expected);
    });
});

describe('allPermissions', () => {
    it('is one unrestricted binding per chamvi name, a new array each call', async () => {
        const all = allPermissions();

        expect(all.map((binding) => binding.permission.name)).toEqual(PERMISSION_NAMES);
        expect(all.every((binding) => binding.policies === undefined)).toBe(true);
        expect(allPermissions()).not.toBe(all);
        await expect(can({ permissions: all }, Permission.CONNECTION_WRITE, { attributes: { name: 'mail', type: 'imap' } })).resolves.toBe(true);
    });
});

describe('permissionNames', () => {
    it('lists the distinct names of valid bindings in first-seen order', () => {
        const names = permissionNames({
            permissions: [
                { permission: { name: Permission.AGENT_RUN } },
                'agent:x:run' as never,
                { permission: { name: 'release_manage' } },
                { permission: { name: Permission.AGENT_RUN }, policies: [{ type: 'attributes', query: { name: 'a' } } as never] },
            ],
        });

        expect(names).toEqual([Permission.AGENT_RUN, 'release_manage']);
    });

    it('is empty for a holder without bindings', () => {
        expect(permissionNames({ permissions: [] })).toEqual([]);
        expect(permissionNames({} as never)).toEqual([]);
    });
});
