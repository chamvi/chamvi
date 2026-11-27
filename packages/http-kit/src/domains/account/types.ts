/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MeView } from '@chamvi/core-kit';
import type { APIRequestOptions } from '../types.ts';

export type MeWire = MeView;

export interface IAccountAPI {
    /** `GET /me`: the principal; `options.token` checks a credential without refresh or sign-out. */
    getMe(options?: APIRequestOptions): Promise<MeWire>;
}
