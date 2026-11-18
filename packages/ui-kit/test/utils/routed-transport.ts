/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITransport, TransportRequest } from 'hapic';

/** A request as a routed fake sees it: the method and the JSON body decoded. */
export type RoutedRequest = { method?: string; body?: unknown };

export type RouteHandler = (url: string, init: RoutedRequest) => Response | Promise<Response>;

/** A hapic transport handing every request (its path under the API base) to a URL router of the test. */
export class RoutedTransport implements ITransport {
    constructor(protected send: RouteHandler) {}

    async dispatch(request: TransportRequest): Promise<Response> {
        return this.send(request.url, {
            method: request.method ?? 'GET',
            ...(typeof request.body === 'string' ? { body: JSON.parse(request.body) } : {}),
        });
    }
}
