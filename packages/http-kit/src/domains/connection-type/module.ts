/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { ConnectionTypeWire, IConnectionTypeAPI } from './types.ts';

export class ConnectionTypeAPI extends BaseAPI implements IConnectionTypeAPI {
    async getMany(options?: APIRequestOptions): Promise<ConnectionTypeWire[]> {
        return dataOf<ConnectionTypeWire>(await this.request({ url: '/connection-types', method: 'GET' }, options));
    }
}
