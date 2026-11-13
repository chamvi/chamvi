/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DController,
    DDescription,
    DGet,
    DTags,
} from '@routup/decorators';
import type {
    HealthControllerContext,
    IHealthService,
    ReadinessReadyView,
    ReadinessUnavailableView,
} from './types.ts';

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

    /** Whether the app takes traffic: 503 with the reason while it does not. The 503 is never answered with a 304. */
    // the 503 is a raw `Response`, so routup's send path never gives it an etag and an `If-None-Match`
    // can never turn it into a 304
    @DGet('/readyz')
    @DDescription<ReadinessReadyView>(200, 'The app takes traffic.')
    @DDescription<ReadinessUnavailableView>(503, 'The app takes no traffic, and why.')
    async ready(): Promise<ReadinessReadyView | Response> {
        const view = await this.service.readiness();

        if (view.status === 'unavailable') {
            return Response.json(view, { status: 503 });
        }

        return view;
    }
}
