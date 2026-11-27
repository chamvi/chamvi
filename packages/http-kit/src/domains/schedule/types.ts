/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ScheduleSummary } from '@chamvi/core-kit';
import type { APIRequestOptions } from '../types.ts';

/** One entry of `GET /schedules`. */
export type ScheduleWire = ScheduleSummary;

export interface IScheduleAPI {
    getMany(options?: APIRequestOptions): Promise<ScheduleWire[]>;
}
