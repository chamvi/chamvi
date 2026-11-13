/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { READINESS_PROBE_RUN_ID } from './constants.ts';
import type { HealthServiceContext, IHealthService, ReadinessView } from './types.ts';

/** Whether the app takes traffic: not shutting down, not draining, the store answering in time. */
export class HealthService implements IHealthService {
    protected ctx: HealthServiceContext;

    constructor(ctx: HealthServiceContext) {
        this.ctx = ctx;
    }

    async readiness(): Promise<ReadinessView> {
        if (this.ctx.shutdown?.shuttingDown) {
            return { status: 'unavailable', reason: 'shutting-down' };
        }

        if (this.ctx.engine.isDraining) {
            return { status: 'unavailable', reason: 'draining' };
        }

        if (!await this.isStoreReachable()) {
            return { status: 'unavailable', reason: 'store-unreachable' };
        }

        return { status: 'ok' };
    }

    protected async isStoreReachable(): Promise<boolean> {
        let timer: { clear(): void } | undefined;
        const timeout = new Promise<boolean>((resolve) => {
            timer = this.ctx.clock.setTimeout(() => resolve(false), this.ctx.readyTimeoutMs);
        });
        const probe = this.ctx.store.runs.findOne(READINESS_PROBE_RUN_ID).then(() => true, () => false);

        try {
            return await Promise.race([probe, timeout]);
        } finally {
            timer?.clear();
        }
    }
}
