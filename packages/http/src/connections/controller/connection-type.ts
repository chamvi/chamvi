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
    DGet,
    DPath,
    DPost,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../../auth/helpers.ts';
import { ForceLoggedInMiddleware, RequiredJsonBodyMiddleware } from '../../middleware/index.ts';
import type {
    ConnectionConfigControllerContext,
    ConnectionCreateBody,
    ConnectionSettingsView,
    ConnectionTypeView,
    IConnectionConfigService,
} from '../types.ts';

@DTags('connections')
@DController('/connection-types')
export class ConnectionTypeController {
    protected config: IConnectionConfigService;

    constructor(ctx: ConnectionConfigControllerContext) {
        this.config = ctx.config;
    }

    /** `GET /connection-types`: one entry per type, with the fields a form needs. */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<{ data: ConnectionTypeView[] }> {
        return this.config.types(await usePrincipal(event));
    }

    /** `POST /connection-types/:type/connections`: adds an account of the type (201). */
    @DPost('/:type/connections', [ForceLoggedInMiddleware, RequiredJsonBodyMiddleware])
    async create(
        @DPath('type') type: string,
        @DBody() data: ConnectionCreateBody,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionSettingsView & { name: string }> {
        const result = await this.config.create(type, data, await usePrincipal(event));

        event.response.status = 201;

        return result;
    }
}
