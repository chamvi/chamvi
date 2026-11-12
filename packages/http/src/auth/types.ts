/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionAuthorization, PermissionBinding, PermissionIdentity } from '@chamvi/access';

export type Principal = {
    id: string;
    kind: 'token' | 'authup' | 'oidc' | (string & {});
    /** Granted permissions: authup bindings with resolved policy trees (plain data). */
    bindings: readonly PermissionBinding[];
    /** authup's snapshot of the identity's grants; set by `authup()`, which leaves `bindings` empty. */
    authorization?: PermissionAuthorization;
    /** What an `identity` policy evaluates; set by `authup()`. */
    identity?: PermissionIdentity;
    claims?: Record<string, unknown>;
};

/**
 * Resolves `undefined` when the request carries no credentials it
 * recognizes, throws `UnauthorizedError` for credentials it rejects.
 */
export type Authenticator = (request: Request) => Promise<Principal | undefined>;
