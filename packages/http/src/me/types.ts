/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionIdentity } from '@chamvi/access';

/**
 * `GET /me`: the authenticated principal's identity as the app records it
 * as an invoker (the name from `name` or `preferred_username`, never the
 * claims); never its bindings or authorization (`POST /authorization/check`
 * answers verdicts instead).
 */
export type MeView = {
    id: string;
    kind: string;
    name?: string;
    identity?: PermissionIdentity;
};
