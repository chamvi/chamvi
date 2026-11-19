/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DContext,
    DController,
    DGet,
    DSecurity,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../auth/helpers/index.ts';
import { ForceLoggedInMiddleware } from '../middleware/index.ts';
import type {
    ComponentControllerContext,
    ComponentListView,
    IComponentService,
} from './types.ts';

@DTags('component')
@DSecurity([], 'bearer')
@DController('/components')
export class ComponentController {
    protected service: IComponentService;

    constructor(ctx: ComponentControllerContext) {
        this.service = ctx.service;
    }

    /**
     * The app's background jobs, then the engine's channels that report a
     * status, each with the times of its last success, error and run and of
     * the pass in flight; needs `chamvi_component_read`.
     */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<ComponentListView> {
        return this.service.list(await usePrincipal(event));
    }
}
