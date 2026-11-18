/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Client } from '../../src/client/module.ts';
import type { ClientOptions } from '../../src/client/types.ts';
import { FakeTransport } from './transport.ts';
import type { FakeAnswer } from './transport.ts';

/** A client on `/api` over a `FakeTransport` answering `answers` in order. */
export function createTestClient(answers: FakeAnswer[], options: Omit<ClientOptions, 'transport'> = {}) {
    const transport = new FakeTransport(answers);
    const client = new Client({
        baseURL: '/api', 
        transport, 
        ...options, 
    });

    return { client, requests: transport.requests };
}
