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
@DController('/authorization')
export class AuthorizationController {
    protected service: IAuthorizationService;

    constructor(ctx: AuthorizationControllerContext) {
        this.service = ctx.service;
    }

    /**
     * `POST /authorization/check`: any authenticated principal asks which of
     * the permission names it may attempt.
     */
    @DPost('/check', [ForceLoggedInMiddleware, JsonBodyMiddleware])
    async check(
        @DBody() data: AuthorizationCheckBody,
        @DContext() event: IAppEvent,
    ): Promise<AuthorizationCheckView> {
        return this.service.check(data, await usePrincipal(event));
    }
}
