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
    /** The owner client id: only its definitions in `realm` are reachable. */
    client?: string;
    /** The kind of the token's subject: a user's grants are narrowed to the token's client. */
    subjectKind?: 'user' | 'client';
    /** The client the token was issued to (`client_id`). */
    tokenClient?: string | null;
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
 * Of the reachable definitions it keeps the `chamvi_*` ones and those a grant
 * names: with `client`, those owned by that client in `realm`; without, those
 * owned by nobody or by `realm` (never by a client or another realm, which no
 * check reaches); the grants of a definition it leaves out go with it
 * (upstream checks a binding per definition namespace, so no kept
 * definition reads them). A user's grant of a definition owned by a client
 * other than the token's is dropped first, as authup itself does (#3606); a
 * client identity is not narrowed. Throws `AuthorizationCatalogStaleError` when a
 * grant names a definition or policy the catalog lacks.
 */
export async function buildPrincipalSnapshot(input: SnapshotInput): Promise<AuthorizationSnapshot> {
    const snapshot = await buildAuthorizationSnapshot({ catalog: input.catalog, grants: input.grants });
    const tokenClient = input.tokenClient ?? null;
    const grants = (snapshot.grants ?? []).filter((grant) => input.subjectKind !== 'user' ||
        (grant.permission.clientId ?? null) === null ||
        grant.permission.clientId === tokenClient);
    const granted = new Set(grants.map(keyOf));
    const names: readonly string[] = PERMISSION_NAMES;
    const reachable = (binding: PermissionPolicyBinding) => {
        const realmId = binding.permission.realmId ?? null;
        const clientId = binding.permission.clientId ?? null;

        if (input.client) {
            return clientId === input.client && realmId === input.realm;
        }

        return clientId === null && (realmId === null || realmId === input.realm);
    };
    const definitions = snapshot.definitions.filter((definition) => reachable(definition) &&
        (names.includes(definition.permission.name) || granted.has(keyOf(definition))));
    const kept = new Set(definitions.map(keyOf));

    return {
        definitions,
        grants: grants.filter((grant) => kept.has(keyOf(grant))),
    };
}
