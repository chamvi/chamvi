/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseAPI } from '../base.ts';
import type { APIRequestOptions } from '../types.ts';
import type { AuthorizationCheckWire, IAuthorizationAPI } from './types.ts';

export class AuthorizationAPI extends BaseAPI implements IAuthorizationAPI {
    check(names?: readonly string[], options?: APIRequestOptions): Promise<AuthorizationCheckWire> {
        return this.request<AuthorizationCheckWire>({
            url: '/authorization/check',
            method: 'POST',
            body: names === undefined ? {} : { names: [...names] },
        }, options);
    }
}
