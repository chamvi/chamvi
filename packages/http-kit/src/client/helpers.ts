/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ClientAuthenticationHook } from '../hook/module.ts';
import { Client } from './module.ts';
import type { CreateClientOptions } from './types.ts';

/** A `Client` with a `ClientAuthenticationHook` attached: bearer per request, one refresh on a 401, `onUnauthorized` when it stands. */
export function createClient(options: CreateClientOptions): Client {
    const {
        token,
        refresh,
        onUnauthorized,
        ...rest
    } = options;
    const client = new Client(rest);

    new ClientAuthenticationHook({
        token, 
        refresh, 
        onUnauthorized, 
    }).attach(client);

    return client;
}
