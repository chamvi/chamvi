/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The asked names the caller may attempt (an upper bound: a grant
 * restricted by a resource policy counts, the route decides per resource),
 * deduplicated, in request order. An absent name is denied.
 */
export type AuthorizationCheckView = {
    permissions: string[];
};
