/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineIntervalComponent } from 'hubwire';
import type { IScheduledComponent } from 'hubwire';
import { PURGE_COMPONENT_NAME } from './constants.ts';
import type { PurgeComponentOptions } from './types.ts';

/**
 * Runs each service's `purgeExpired()` every `intervalMs` on the clock (first
 * after one interval), as a hubwire interval component: the next pass waits
 * from the moment the previous one settled, so passes never overlap. A failed
 * purge is logged and the other services still purge; the pass then throws
 * an AggregateError of the failures (already logged), so the component's
 * status records the failure. Its timers never hold the process.
 */
export function createPurgeComponent(options: PurgeComponentOptions): IScheduledComponent {
    const {
        services,
        clock,
        intervalMs,
        logger,
    } = options;

    return defineIntervalComponent({
        name: PURGE_COMPONENT_NAME,
        clock,
        intervalMs,
        runOnStart: false,
        unref: true,
        handler: async () => {
            const failures: unknown[] = [];
            const results = await Promise.all(services.map(async (service) => {
                try {
                    return await service.purgeExpired();
                } catch (error) {
                    logger.error('Purging expired store records failed.', error);
                    failures.push(error);

                    return undefined;
                }
            }));

            logger.debug('Purged expired store records.', { results });

            if (failures.length > 0) {
                // logged above: the component's status records the failed pass, nothing logs it again
                throw new AggregateError(failures, 'Purging expired store records failed.');
            }
        },
    });
}
