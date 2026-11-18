/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createClient } from '../../src/client/helpers.ts';
import { FakeTransport } from './transport.ts';
import type { FakeAnswer } from './transport.ts';

/** `createClient()` on `/api` with token `t` over a `FakeTransport`. */
export function createKitClient(answers: FakeAnswer[]) {
    const transport = new FakeTransport(answers);
    const client = createClient({
        baseURL: '/api',
        transport,
        token: async () => 't',
    });

    return { client, requests: transport.requests };
}

/** `METHOD url` of each request. */
export const linesOf = (requests: { method: string; url: string }[]) => requests.map((request) => `${request.method} ${request.url}`);
