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
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../../auth/helpers.ts';
import { ForceLoggedInMiddleware } from '../../middleware/index.ts';
import type { UiPage } from '../../static/types.ts';
import type { ConnectionConfigControllerContext, IConnectionConfigService } from '../types.ts';

@DTags('connections')
@DController('/ui-pages')
export class UiPageController {
    protected config: IConnectionConfigService;

    constructor(ctx: ConnectionConfigControllerContext) {
        this.config = ctx.config;
    }

    /** `GET /ui-pages`: the dashboard pages, their paths under `basePath`. */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<{ data: UiPage[] }> {
        return this.config.uiPages(await usePrincipal(event));
    }
}
