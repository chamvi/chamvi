/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PERMISSION_NAMES } from '@chamvi/access';
import { shallowRef } from 'vue';
import type { ISession } from '../../src/auth/types.ts';

/** Every chamvi permission name (what the check answers a `'*'` token). */
export const ALL: readonly string[] = PERMISSION_NAMES;

/** The verdict part of a session that holds exactly these names, as a fake session spreads it. */
export function verdicts(names: readonly string[] = ALL): Pick<ISession, 'permissions' | 'allowed'> {
    const permissions = shallowRef<ReadonlySet<string>>(new Set(names));

    return {
        permissions,
        allowed: (name) => permissions.value.has(name),
    };
}
