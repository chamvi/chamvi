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
import type { HealthControllerContext, IHealthService, ReadinessView } from './types.ts';

/** `/healthz` (process alive) and `/readyz` (store, engine, shutdown); unauthenticated. */
@DTags('health')
@DController('')
export class HealthController {
    protected service: IHealthService;

    constructor(ctx: HealthControllerContext) {
        this.service = ctx.service;
    }

    @DGet('/healthz')
    health(): { status: 'ok' } {
        return { status: 'ok' };
    }

    /** `GET /readyz`: 503 with the reason while the app takes no traffic. */
    @DGet('/readyz')
    async ready(@DContext() event: IAppEvent): Promise<ReadinessView> {
        const view = await this.service.readiness();

        if (view.status === 'unavailable') {
            event.response.status = 503;
        }

        return view;
    }
}
