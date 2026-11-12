/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionAuthorization, PermissionBinding, PermissionIdentity } from '@chamvi/access';

/**
 * `GET /me`: the authenticated principal as the app records it as an invoker
 * (the name from `name` or `preferred_username`, never the claims), with its
 * own permission bindings and identity, which the dashboard evaluates.
 */
export type MeView = {
    id: string;
    kind: string;
    name?: string;
    bindings: PermissionBinding[];
    authorization?: PermissionAuthorization;
    identity?: PermissionIdentity;
};
