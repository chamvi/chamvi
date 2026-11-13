/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DBody,
    DContext,
    DController,
    DPost,
    DSecurity,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../auth/helpers.ts';
import { ForceLoggedInMiddleware, JsonBodyMiddleware } from '../middleware/index.ts';
import type {
    AuthorizationCheckBody,
    AuthorizationCheckView,
    AuthorizationControllerContext,
    IAuthorizationService,
} from './types.ts';

@DTags('authorization')
@DSecurity([], 'bearer')
@DController('/authorization')
export class AuthorizationController {
    protected service: IAuthorizationService;

    constructor(ctx: AuthorizationControllerContext) {
        this.service = ctx.service;
    }

    /**
     * Which of the asked permission names the authenticated caller may
     * attempt; without a body, every chamvi permission is asked.
     */
    @DPost('/check', [ForceLoggedInMiddleware, JsonBodyMiddleware])
    async check(
        @DContext() event: IAppEvent,
        // optional (hence after `event`, routup binds by index) so the openapi document marks the body optional
        @DBody() data?: AuthorizationCheckBody,
    ): Promise<AuthorizationCheckView> {
        return this.service.check(data, await usePrincipal(event));
    }
}
