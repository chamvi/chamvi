/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../utils/app.ts';
import { countingStream } from '../../utils/body.ts';

const LIMIT = 64;

const BODY_ROUTES: Array<[string, string]> = [
    ['POST', '/authorization/check'],
    ['PATCH', '/agents/echo/state/kv/key'],
    ['POST', '/agents/echo/runs'],
    ['POST', '/runs/0190e2a8-0000-7000-8000-000000000000/approve'],
    ['POST', '/connection-types/github/connections'],
    ['PUT', '/connections/github/config'],
];

describe('routes with a body', () => {
    it.each(BODY_ROUTES)('%s %s answers 401 to an anonymous oversized body before any read', async (method, path) => {
        const { app } = createTestApp({ bodyLimit: LIMIT });
        const stream = countingStream(LIMIT * 4);
        const response = await app.fetch(new Request(`http://test${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: stream.body,
            duplex: 'half',
        } as RequestInit));

        expect(response.status).toBe(401);
        expect(stream.reads()).toBe(0);
    });
});
