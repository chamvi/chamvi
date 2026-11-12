/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * `POST /authorization/check`: the permission names to ask, each 1 to 255
 * characters, at most 64; absent means every `chamvi_*` name.
 */
export type AuthorizationCheckBody = {
    names?: string[];
};

/**
 * The asked names the principal may attempt (`canSome`, an upper bound:
 * a policy that needs a resource passes, the route decides per resource),
 * deduplicated, in request order. An absent name is denied.
 */
export type AuthorizationCheckView = {
    permissions: string[];
};
