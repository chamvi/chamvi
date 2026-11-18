/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { path } from '../../helpers/path.ts';
import { buildQueryString } from '../../helpers/query.ts';
import type { EntityQueryInput } from '../../helpers/types.ts';
import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { DocEntry, IStateAPI, KvEntry } from './types.ts';

export class StateAPI extends BaseAPI implements IStateAPI {
    async getKv(agent: string, query?: EntityQueryInput<KvEntry>, options?: APIRequestOptions): Promise<KvEntry[]> {
        return dataOf<KvEntry>(await this.request({ url: `${path('agents', agent)}/state/kv${buildQueryString(query)}`, method: 'GET' }, options));
    }

    async getDocs(agent: string, collection: string, query?: EntityQueryInput<DocEntry>, options?: APIRequestOptions): Promise<DocEntry[]> {
        return dataOf<DocEntry>(await this.request({
            url: `${path('agents', agent)}/state/collections${path(collection)}${buildQueryString(query)}`,
            method: 'GET',
        }, options));
    }
}
