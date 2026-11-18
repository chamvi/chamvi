/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { Client, REQUEST_TIMEOUT_MS, createClient } from '@chamvi/http-kit';
import { json } from '../../utils/responses.ts';
import { FakeTransport } from '../../utils/transport.ts';

describe('createClient', () => {
    it('makes bearer requests under baseURL with the default deadline', async () => {
        const transport = new FakeTransport([json({ id: 'admin', kind: 'token' })]);
        const client = createClient({
            baseURL: 'https://agents.example/api',
            transport,
            token: async () => 't',
        });

        expect(client).toBeInstanceOf(Client);
        expect(client.timeoutMs).toBe(REQUEST_TIMEOUT_MS);
        await client.account.getMe();
        expect(transport.requests[0]!.url).toBe('https://agents.example/api/me');
        expect(transport.requests[0]!.headers.get('authorization')).toBe('Bearer t');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('calls the global fetch present at request time', async () => {
        const client = createClient({ baseURL: '/api', token: async () => undefined });
        const fetch = vi.fn(async () => json({ id: 'admin', kind: 'token' }));

        vi.stubGlobal('fetch', fetch);
        await client.account.getMe();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps a given accept header and timeout', () => {
        const client = new Client({ headers: { accept: 'text/plain' }, timeoutMs: 5 });

        expect(client.getHeader('accept')).toBe('text/plain');
        expect(client.timeoutMs).toBe(5);
    });
});
