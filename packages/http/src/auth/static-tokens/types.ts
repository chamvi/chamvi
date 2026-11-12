/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionBinding } from '@chamvi/access';

export type StaticToken = {
    /** The bearer token, at least 16 characters; unique across the list. */
    value: string;
    /** The principal it stands for; several tokens may share one (rotation). */
    id: string;
    /** `'*'`: every chamvi permission, unrestricted; else the bindings as configured. */
    permissions: readonly PermissionBinding[] | '*';
};

export type StaticTokensOptions = {
    tokens: StaticToken[];
};
