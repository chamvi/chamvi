/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionBinding } from '@chamvi/access';
import type { Principal } from '@chamvi/http';

/** A token principal holding a binding per permission name (or the binding given). */
export function principalOf(...grants: Array<string | PermissionBinding>): Principal {
    return {
        id: 'p',
        kind: 'token',
        bindings: grants.map((grant) => (typeof grant === 'string' ? { permission: { name: grant } } : grant)),
    };
}
