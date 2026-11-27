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
    DSecurity,
    DStatus,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../../auth/helpers/index.ts';
import { ForceLoggedInMiddleware, RequiredJsonBodyMiddleware } from '../../middleware/index.ts';
import type { ConnectionConfigControllerContext, IConnectionConfigService } from '../types.ts';
import type { ConnectionCreateBody, ConnectionSettingsView, ConnectionTypeView } from '@chamvi/core-kit';

@DTags('connection-type')
@DSecurity([], 'bearer')
@DController('/connection-types')
export class ConnectionTypeController {
    protected config: IConnectionConfigService;

    constructor(ctx: ConnectionConfigControllerContext) {
        this.config = ctx.config;
    }

    /** One entry per type, with the fields a form needs. */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<{ data: ConnectionTypeView[] }> {
        return this.config.types(await usePrincipal(event));
    }

    /** Adds an account of the type. */
    @DPost('/:type/connections', [ForceLoggedInMiddleware, RequiredJsonBodyMiddleware])
    @DStatus(201)
    async create(
        @DPath('type') type: string,
        @DBody() data: ConnectionCreateBody,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionSettingsView & { name: string }> {
        return this.config.create(type, data, await usePrincipal(event));
    }
}
