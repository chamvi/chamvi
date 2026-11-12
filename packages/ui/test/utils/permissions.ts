/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { allPermissions } from '@chamvi/access';
import { shallowRef } from 'vue';
import type { MeWire } from '@chamvi/ui-kit';

/** Every chamvi permission name, as `POST /authorization/check` answers a `'*'` token. */
export const ALL: string[] = allPermissions().map((binding) => binding.permission.name);

/** A verdict function as `session.allowed`: exactly these names. */
export function allowedOf(...names: string[]): (name: string) => boolean {
    const set = new Set(names);

    return (name) => set.has(name);
}

/** The session part of an `AppContext` whose permission check answered `names`. */
export function sessionOf(names: readonly string[], principal: MeWire = { id: 'a', kind: 'token' }) {
    const permissions = shallowRef<ReadonlySet<string>>(new Set(names));

    return {
        principal: shallowRef<MeWire | undefined>(principal),
        permissions,
        allowed: (name: string) => permissions.value.has(name),
    };
}
