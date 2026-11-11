/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { allPermissions } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';

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
