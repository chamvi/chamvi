/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { ILogger } from '../../logger/types.ts';

/** A service with expired records to remove (the lock and idempotency services). */
export type PurgingService = {
    purgeExpired(): Promise<number>;
};

export type PurgeTimerOptions = {
    services: PurgingService[];
    clock: IClock;
    intervalMs: number;
    logger: ILogger;
};

export interface IPurgeTimer {
    start(): void;
    /** Idempotent; keeps a call in flight from re-arming and resolves once it settled. */
    stop(): Promise<void>;
}
