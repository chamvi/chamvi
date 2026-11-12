/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as access from '@chamvi/access';

describe('public api', () => {
    it('exports exactly the check, the helpers and the names', () => {
        expect(Object.keys(access).sort()).toEqual([
            'PERMISSION_NAMES',
            'Permission',
            'allPermissions',
            'can',
            'canSome',
            'isPermissionAuthorization',
            'isPermissionBinding',
            'permissionNames',
        ]);
    });

    it.each([
        'allPermissions',
        'can',
        'canSome',
        'isPermissionAuthorization',
        'isPermissionBinding',
        'permissionNames',
    ])('exports the function %s', (name) => {
        expect(access[name as keyof typeof access]).toBeTypeOf('function');
    });

    it('names the thirteen chamvi permissions in order', () => {
        expect(access.PERMISSION_NAMES).toEqual([
            'chamvi_agent_read',
            'chamvi_agent_run',
            'chamvi_agent_approve',
            'chamvi_run_read',
            'chamvi_run_cancel',
            'chamvi_state_read',
            'chamvi_state_write',
            'chamvi_connection_read',
            'chamvi_connection_write',
            'chamvi_connection_create',
            'chamvi_tool_use',
            'chamvi_knowledge_read',
            'chamvi_knowledge_write',
        ]);
        expect(Object.values(access.Permission)).toEqual(access.PERMISSION_NAMES);
    });
});
