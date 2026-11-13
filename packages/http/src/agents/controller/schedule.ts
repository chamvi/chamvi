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
import { usePrincipal } from '../../auth/helpers.ts';
import { ForceLoggedInMiddleware } from '../../middleware/index.ts';
import type { IAgentService, ScheduleControllerContext, ScheduleSummary } from '../types.ts';

@DTags('schedule')
@DSecurity([], 'bearer')
@DController('/schedules')
export class ScheduleController {
    protected service: IAgentService;

    constructor(ctx: ScheduleControllerContext) {
        this.service = ctx.service;
    }

    /** `GET /schedules`: the cron subscriptions of the agents the principal may read runs of. */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<{ data: ScheduleSummary[] }> {
        return this.service.schedules(await usePrincipal(event));
    }
}
