/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { FetchTransport } from 'hapic';
import { Client } from '../../src/client/module.ts';
import type { ClientOptions } from '../../src/client/types.ts';
import { createFakeFetch } from './fetch.ts';
import type { FakeAnswer } from './fetch.ts';

/** A client on `/api` whose fetch answers `answers` in order and records every request. */
export function createTestClient(answers: FakeAnswer[], options: Omit<ClientOptions, 'transport'> = {}) {
    const { fetch, requests } = createFakeFetch(answers);
    const client = new Client({
        baseURL: '/api',
        transport: new FetchTransport({ fetch }),
        ...options,
    });

    return { client, requests };
}

/** A fetch that never answers; it rejects as the platform does once its signal aborts. */
export function silentFetch() {
    const signals: AbortSignal[] = [];
    const fetch = ((_input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((_resolve, reject) => {
        const { signal } = init;

        if (!signal) {
            return;
        }

        signals.push(signal);
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof globalThis.fetch;

    return { fetch, signals };
}
