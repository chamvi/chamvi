/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { Principal } from '../auth/types.ts';

/**
 * `POST /authorization/check`: the permission names to ask, each 1 to 255
 * characters, at most 64; absent means every `chamvi_*` name.
 */
export type AuthorizationCheckBody = {
    names?: string[];
};

/**
 * The asked names the caller may attempt (an upper bound: a grant
 * restricted by a resource policy counts, the route decides per resource),
 * deduplicated, in request order. An absent name is denied.
 */
export type AuthorizationCheckView = {
    permissions: string[];
};

/** What `AuthorizationService` needs of the http context. */
export type AuthorizationServiceContext = {
    clock: IClock;
};

export interface IAuthorizationService {
    /**
     * The asked names (`data` untrusted, validated here) the principal may
     * attempt; every `chamvi_*` name when `names` (or the body) is absent.
     */
    check(data: AuthorizationCheckBody | undefined, principal: Principal): Promise<AuthorizationCheckView>;
}

export type AuthorizationControllerContext = {
    service: IAuthorizationService;
};
