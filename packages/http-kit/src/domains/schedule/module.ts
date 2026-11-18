/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { IScheduleAPI, ScheduleWire } from './types.ts';

export class ScheduleAPI extends BaseAPI implements IScheduleAPI {
    async getMany(options?: APIRequestOptions): Promise<ScheduleWire[]> {
        return dataOf<ScheduleWire>(await this.request({ url: '/schedules', method: 'GET' }, options));
    }
}
