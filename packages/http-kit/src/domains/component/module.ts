/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { ComponentWire, IComponentAPI } from './types.ts';

export class ComponentAPI extends BaseAPI implements IComponentAPI {
    async getMany(options?: APIRequestOptions): Promise<ComponentWire[]> {
        return dataOf<ComponentWire>(await this.request({ url: '/components', method: 'GET' }, options));
    }
}
