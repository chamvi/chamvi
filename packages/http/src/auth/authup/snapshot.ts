/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AuthorizationSnapshot, PermissionPolicyBinding } from '@authup/access';
import {
    authorizationGrantSchema,
    buildAuthorizationSnapshot,
    buildPermissionKey,
} from '@authup/access';
import { PERMISSION_NAMES } from '@chamvi/access';

type SnapshotInput = {
    /** authup's `GET /authorization` body. */
    catalog: unknown;
    /** The introspected grants (`permissions` of the token). */
    grants: unknown;
};

const keyOf = (binding: PermissionPolicyBinding): string => buildPermissionKey({
    name: binding.permission.name,
    realmId: binding.permission.realmId ?? null,
    clientId: binding.permission.clientId ?? null,
});

/**
 * The snapshot a principal carries: upstream's `buildAuthorizationSnapshot`
 * over the well-formed grants (a malformed one is ignored), keeping every
 * grant and of the definitions those chamvi checks (`PERMISSION_NAMES`) and
 * those a grant names. Throws `AuthorizationCatalogStaleError` when a grant
 * names a definition or policy the catalog lacks.
 */
export async function buildPrincipalSnapshot(input: SnapshotInput): Promise<AuthorizationSnapshot> {
    const grants = Array.isArray(input.grants) ?
        (input.grants as unknown[]).filter((grant) => authorizationGrantSchema.safeParse(grant).success) :
        [];
    const snapshot = await buildAuthorizationSnapshot({ catalog: input.catalog, grants });
    const granted = new Set((snapshot.grants ?? []).map(keyOf));
    const names: readonly string[] = PERMISSION_NAMES;

    return {
        definitions: snapshot.definitions.filter((definition) => names.includes(definition.permission.name) ||
            granted.has(keyOf(definition))),
        grants: snapshot.grants ?? [],
    };
}
