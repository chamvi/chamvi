/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClientOptionsInput, IClient as IBaseClient } from 'hapic';

export type ClientOptions = ClientOptionsInput & {
    /** How long a request waits for the answer before it fails as a `timeout` `ApiError`. Default `REQUEST_TIMEOUT_MS`. */
    timeoutMs?: number;
};

/** The chamvi API client: hapic's request surface plus one API per domain. */
export interface IClient extends IBaseClient {
    readonly timeoutMs: number;
}
