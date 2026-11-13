/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { HttpContext } from '../app/types.ts';

/** `GET /readyz`: ok, or why the app takes no traffic (503). */
export type ReadinessView = { status: 'ok' } |
{ status: 'unavailable'; reason: 'shutting-down' | 'draining' | 'store-unreachable' };

/** What `HealthService` needs of the http context. */
export type HealthServiceContext = Pick<HttpContext, 'engine' | 'store' | 'clock' | 'shutdown' | 'readyTimeoutMs'>;

export interface IHealthService {
    /** Shutdown, then engine drain, then a store round trip within `readyTimeoutMs`. */
    readiness(): Promise<ReadinessView>;
}

export type HealthControllerContext = {
    service: IHealthService;
};
