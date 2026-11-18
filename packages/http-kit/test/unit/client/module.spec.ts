/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { FetchTransport } from 'hapic';
import { describe, expect, it } from 'vitest';
import { Client, REQUEST_TIMEOUT_MS, createClient } from '@chamvi/http-kit';
import { createFakeFetch, json } from '../../utils/fetch.ts';

describe('createClient', () => {
    it('makes bearer requests under baseURL with the default deadline', async () => {
        const { fetch, requests } = createFakeFetch([json({ id: 'admin', kind: 'token' })]);
        const client = createClient({
            baseURL: 'https://agents.example/api',
            transport: new FetchTransport({ fetch }),
            token: async () => 't',
        });

        expect(client).toBeInstanceOf(Client);
        expect(client.timeoutMs).toBe(REQUEST_TIMEOUT_MS);
        await client.account.getMe();
        expect(requests[0]!.url).toBe('https://agents.example/api/me');
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer t');
    });

    it('keeps a given accept header and timeout', () => {
        const client = new Client({ headers: { accept: 'text/plain' }, timeoutMs: 5 });

        expect(client.getHeader('accept')).toBe('text/plain');
        expect(client.timeoutMs).toBe(5);
    });
});
