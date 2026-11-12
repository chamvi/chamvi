/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AuthorizationSnapshot, PermissionPolicyBinding } from '@authup/access';
import { buildAuthorizationSnapshot, buildPermissionKey } from '@authup/access';
import { PERMISSION_NAMES } from '@chamvi/access';

type SnapshotInput = {
    /** authup's `GET /authorization` body. */
    catalog: unknown;
    /** The introspected grants (`permissions` of the token), as received. */
    grants: unknown;
    /** The realm chamvi's resources belong to. */
    realm: string;
};

const keyOf = (binding: PermissionPolicyBinding): string => buildPermissionKey({
    name: binding.permission.name,
    realmId: binding.permission.realmId ?? null,
    clientId: binding.permission.clientId ?? null,
});

/**
 * The snapshot a principal carries: upstream's `buildAuthorizationSnapshot`
 * over the catalog and every grant as received (a malformed grant makes it
 * throw: dropping one could turn an inverted binding check into a pass).
 * Of the definitions owned by nobody or by `realm` (never by a client or
 * another realm, which no check reaches) it keeps the `chamvi_*` ones and
 * those a grant names; the grants of a definition it leaves out go with it
 * (upstream checks a binding per definition namespace, so no kept
 * definition reads them). Throws `AuthorizationCatalogStaleError` when a
 * grant names a definition or policy the catalog lacks.
 */
export async function buildPrincipalSnapshot(input: SnapshotInput): Promise<AuthorizationSnapshot> {
    const snapshot = await buildAuthorizationSnapshot({ catalog: input.catalog, grants: input.grants });
    const grants = snapshot.grants ?? [];
    const granted = new Set(grants.map(keyOf));
    const names: readonly string[] = PERMISSION_NAMES;
    const reachable = (binding: PermissionPolicyBinding) => (binding.permission.clientId ?? null) === null &&
        ((binding.permission.realmId ?? null) === null || binding.permission.realmId === input.realm);
    const definitions = snapshot.definitions.filter((definition) => reachable(definition) &&
        (names.includes(definition.permission.name) || granted.has(keyOf(definition))));
    const kept = new Set(definitions.map(keyOf));

    return {
        definitions,
        grants: grants.filter((grant) => kept.has(keyOf(grant))),
    };
}
