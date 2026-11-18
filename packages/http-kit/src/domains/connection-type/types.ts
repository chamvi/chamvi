/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionTypeView } from '@chamvi/http';
import type { APIRequestOptions } from '../types.ts';

/** One entry of `GET /connection-types`. */
export type ConnectionTypeWire = ConnectionTypeView;

export interface IConnectionTypeAPI {
    getMany(options?: APIRequestOptions): Promise<ConnectionTypeWire[]>;
}
