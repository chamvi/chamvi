/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AuthorizationSnapshot, PermissionPolicyBinding } from '@authup/access';

/**
 * One grant: a permission name and the policies that must pass for it,
 * authup's own binding shape with resolved policy trees (plain data).
 */
export type PermissionBinding = PermissionPolicyBinding;

/** What an `identity` policy needs; set by authup(), absent for tokens. */
export type PermissionIdentity = {
    type: 'user' | 'client';
    id: string;
    realmId?: string | null;
    realmName?: string | null;
    clientId?: string | null;
};

/**
 * authup's two-layer authorization of an identity: the definitions a check
 * may ask for and the identity's grants (plain JSON, `buildAuthorizationSnapshot`).
 */
export type PermissionAuthorization = {
    snapshot: AuthorizationSnapshot;
    /** The realm chamvi's resources belong to; every check reaches into it. */
    realm: string;
};

/** Anything that holds grants: a principal, a run's invoker. */
export type PermissionHolder = {
    /** Self-contained bindings (static tokens, oidc mappers, direct dispatch). */
    bindings: readonly PermissionBinding[];
    /** Set by authup(): the identity's snapshot, evaluated together with `identity`. */
    authorization?: PermissionAuthorization;
    identity?: PermissionIdentity;
};

export type PermissionCheckOptions = {
    /** The resource. Absent: the check asks about every resource of that kind. */
    attributes?: Record<string, unknown>;
    /** Feeds the date and time policies. Default: the real clock. */
    now?: Date;
};
