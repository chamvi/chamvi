/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AuthorizationCheckView } from '@chamvi/core-kit';
import type { APIRequestOptions } from '../types.ts';

export type AuthorizationCheckWire = AuthorizationCheckView;

export interface IAuthorizationAPI {
    /**
     * `POST /authorization/check`: which of `names` (every `chamvi_*` name
     * without) the principal may attempt, an upper bound the routes decide
     * per resource.
     */
    check(names?: readonly string[], options?: APIRequestOptions): Promise<AuthorizationCheckWire>;
}
