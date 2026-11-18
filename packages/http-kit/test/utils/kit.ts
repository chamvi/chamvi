/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { FetchTransport } from 'hapic';
import { createClient } from '../../src/client/helpers.ts';
import { createFakeFetch } from './fetch.ts';
import type { FakeAnswer } from './fetch.ts';

/** `createClient()` on `/api` with token `t` over the fake fetch. */
export function createKitClient(answers: FakeAnswer[]) {
    const { fetch, requests } = createFakeFetch(answers);
    const client = createClient({
        baseURL: '/api',
        transport: new FetchTransport({ fetch }),
        token: async () => 't',
    });

    return { client, requests };
}

/** `METHOD url` of each request. */
export const linesOf = (requests: { method: string; url: string }[]) => requests.map((request) => `${request.method} ${request.url}`);
