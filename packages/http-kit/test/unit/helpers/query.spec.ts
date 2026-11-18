/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { buildQueryString, path } from '@chamvi/http-kit';
import { parseRunListQuery } from '../../../../http/src/runs/helpers.ts';

/** What the server decodes from a client-built query (http cannot devDepend on http-kit: a cycle). */
const decode = (text: string, agents: string[] = ['a']) => parseRunListQuery(new URLSearchParams(text.slice(1)), agents);

describe('buildQueryString', () => {
    it('is empty without input', () => {
        expect(buildQueryString()).toBe('');
        expect(buildQueryString({})).toBe('');
    });

    it('round-trips a run list query through the server decoder', () => {
        const request = decode(buildQueryString<{
            agent: string; 
            status: string; 
            createdAt: string 
        }>({
            filters: { agent: 'a', status: ['queued', 'running'] },
            pagination: { limit: 10, offset: 20 },
            sorts: '-createdAt',
        }));

        expect(request).toMatchObject({
            agent: 'a',
            limit: 10,
            offset: 20,
            sorts: { createdAt: 'DESC' },
        });
        expect(request.filters).toEqual(expect.arrayContaining([
            expect.objectContaining({ value: 'a' }),
            expect.objectContaining({ value: ['queued', 'running'] }),
        ]));
    });

    it.each(['null', '007', '1e5', '42', 'true'])('encodes and round-trips the agent name %s', (name) => {
        const request = decode(buildQueryString({ filters: { agent: name, status: ['queued'] } }), [name, 'a']);

        expect(request.agent).toBe(name);
    });

    it('round-trips parent and waiting', () => {
        const { filters } = decode(buildQueryString({ filters: { parent: 'r1', waiting: 'approval' } }));

        expect(filters).toEqual(expect.arrayContaining([
            expect.objectContaining({ value: 'r1' }),
            expect.objectContaining({ value: 'approval' }),
        ]));
    });
});

describe('path', () => {
    it('encodes every segment', () => {
        expect(path('runs', 'a/b', 'c d')).toBe('/runs/a%2Fb/c%20d');
    });
});
