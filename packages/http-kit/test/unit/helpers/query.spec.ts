/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    and,
    eq,
    gte,
    inArray,
    lte,
} from '@rapiq/core';
import { describe, expect, it } from 'vitest';
import { buildQueryString } from '@chamvi/http-kit';
import { parseRunListQuery } from '../../../../http/src/runs/helpers/index.ts';

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

    it('round-trips one createdAt bound in the bracket form', () => {
        const text = buildQueryString({ filters: and(eq('agent', 'a'), gte('createdAt', '2026-11-01T00:00:00.000Z')) });

        expect(decodeURIComponent(text)).toContain('filter[createdAt]=>=2026-11-01T00:00:00.000Z');
        expect(decode(text).filters).toEqual([eq('agent', 'a'), gte('createdAt', new Date('2026-11-01T00:00:00.000Z'))]);
    });

    it.each(['a', 'null', '007', '1e5', '42', 'true'])('round-trips both createdAt bounds with statuses and the agent name %s', (name) => {
        const request = decode(buildQueryString({
            filters: and(
                eq('agent', name),
                inArray('status', ['queued', 'running']),
                gte('createdAt', '2026-11-01T00:00:00.000Z'),
                lte('createdAt', '2026-11-07T23:59:59.999Z'),
            ),
        }), [name, 'b']);

        expect(request.agent).toBe(name);
        expect(request.filters.slice(1)).toEqual([
            inArray('status', ['queued', 'running']),
            gte('createdAt', new Date('2026-11-01T00:00:00.000Z')),
            lte('createdAt', new Date('2026-11-07T23:59:59.999Z')),
        ]);
    });

    it('round-trips parent and waiting', () => {
        const { filters } = decode(buildQueryString({ filters: { parent: 'r1', waiting: 'approval' } }));

        expect(filters).toEqual(expect.arrayContaining([
            expect.objectContaining({ value: 'r1' }),
            expect.objectContaining({ value: 'approval' }),
        ]));
    });
});
