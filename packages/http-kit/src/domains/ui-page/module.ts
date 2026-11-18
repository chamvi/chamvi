/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { IUiPageAPI, UiPageWire } from './types.ts';

export class UiPageAPI extends BaseAPI implements IUiPageAPI {
    async getMany(options?: APIRequestOptions): Promise<UiPageWire[]> {
        return dataOf<UiPageWire>(await this.request({ url: '/ui-pages', method: 'GET' }, options));
    }
}
