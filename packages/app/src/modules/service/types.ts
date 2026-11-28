/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ILogger } from '@chamvi/core';

/** A service with expired records to remove (the lock, idempotency and limit services). */
export type PurgingService = {
    purgeExpired(): Promise<number>;
};

export type PurgeComponentOptions = {
    services: PurgingService[];
    clock: IClock;
    intervalMs: number;
    logger: ILogger;
};
