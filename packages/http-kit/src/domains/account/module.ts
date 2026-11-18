/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseAPI } from '../base.ts';
import type { APIRequestOptions } from '../types.ts';
import type { IAccountAPI, MeWire } from './types.ts';

export class AccountAPI extends BaseAPI implements IAccountAPI {
    getMe(options?: APIRequestOptions): Promise<MeWire> {
        return this.request<MeWire>({ url: '/me', method: 'GET' }, options);
    }
}
