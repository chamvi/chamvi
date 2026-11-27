/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { AuthorizationCheckBody, AuthorizationCheckView } from '@chamvi/core-kit';
import type { Principal } from '../auth/types.ts';



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
