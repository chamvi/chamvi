/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { allPermissions } from '@chamvi/access';
import type { PermissionAuthorization, PermissionBinding, PermissionIdentity } from '@chamvi/access';

/** Every chamvi permission, unrestricted (a `'*'` token). */
export const ALL: PermissionBinding[] = allPermissions();

/** A binding of `name`: unrestricted, or restricted by one `attributes` policy over the resource. */
export function grant(name: string, query?: Record<string, unknown>): PermissionBinding {
    if (!query) {
        return { permission: { name } };
    }

    return {
        permission: { name },
        policies: [{ type: 'attributes', query } as never],
    };
}

export const AUTHUP_USER = '0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d';
export const AUTHUP_REALM = '0195f2a0-7c3e-7a4b-9c1d-000000000001';

/**
 * A holder as `GET /me` answers an authup login: no bindings, a snapshot
 * whose definitions bind their grants and one grant per given binding
 * (its policies as the grant's junction policies).
 */
export function authorized(...grants: PermissionBinding[]): {
    bindings: PermissionBinding[]; 
    authorization: PermissionAuthorization; 
    identity: PermissionIdentity 
} {
    const names = [...new Set(grants.map((entry) => entry.permission.name))];
    const permission = (name: string) => ({
        name, 
        realmId: null, 
        clientId: null, 
    });

    return {
        bindings: [],
        authorization: {
            realm: AUTHUP_REALM,
            snapshot: {
                definitions: names.map((name) => ({ permission: permission(name), policies: [{ type: 'permissionBinding' } as never] })),
                grants: grants.map((entry) => ({
                    permission: permission(entry.permission.name),
                    realmScope: 'any',
                    ...(entry.policies ? { policies: entry.policies } : {}),
                })),
            },
        },
        identity: {
            type: 'user', 
            id: AUTHUP_USER, 
            realmId: AUTHUP_REALM, 
        },
    };
}
