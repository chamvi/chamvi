/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    eq,
    gte,
    inArray,
    lte,
} from '@rapiq/core';
import { describe, expect, it } from 'vitest';
import { parseRunListQuery } from '../../../src/runs/helpers/index.ts';

const parse = (query: string) => parseRunListQuery(new URLSearchParams(query));

describe('parseRunListQuery', () => {
    it('defaults the page', () => {
        expect(parse('')).toEqual({
            filters: [],
            limit: 50,
            offset: 0,
            sorts: {},
        });
    });

    it('keeps sort=createdAt ascending', () => {
        expect(parse('sort=createdAt').sorts).toEqual({ createdAt: 'ASC' });
    });

    it('reads sort=-createdAt as createdAt descending', () => {
        expect(parse('sort=-createdAt').sorts).toEqual({ createdAt: 'DESC' });
    });

    it('reads agent, status and the page', () => {
        expect(parse('filter[agent]=echo&filter[status]=queued,running&page[limit]=5&page[offset]=2&sort=createdAt')).toEqual({
            filters: [eq('agent', 'echo'), inArray('status', ['queued', 'running'])],
            agent: 'echo',
            limit: 5,
            offset: 2,
            sorts: { createdAt: 'ASC' },
        });
        expect(parse('filter[status]=queued').filters).toEqual([inArray('status', ['queued'])]);
    });

    it('parses filter[parent]', () => {
        expect(parse('filter[parent]=run-1&filter[agent]=echo&filter[status]=completed')).toEqual({
            filters: [eq('parentRunId', 'run-1'), eq('agent', 'echo'), inArray('status', ['completed'])],
            agent: 'echo',
            limit: 50,
            offset: 0,
            sorts: {},
        });
    });

    it.each([
        'filter[parent]=a&filter[parent]=b',
        'filter[parent]=a,b',
        'filter[parent]=~a',
    ])('refuses two filter[parent] (%s)', (query) => {
        expect(() => parse(query)).toThrow('filter[parent] takes one run id.');
    });

    it('reads createdAt bounds as instants: one bound in the bracket form, both in the expression form', () => {
        const lower = '2026-11-01T00:00:00.000Z';
        const upper = '2026-11-07T22:59:59.999Z';

        expect(parse(`filter[createdAt]=>=${lower}`).filters).toEqual([gte('createdAt', new Date(lower))]);
        expect(parse(`filter[createdAt]=<=${upper}`).filters).toEqual([lte('createdAt', new Date(upper))]);
        expect(parse(`filter=and(gte(createdAt,'${lower}'),lte(createdAt,'${upper}'))`).filters)
            .toEqual([gte('createdAt', new Date(lower)), lte('createdAt', new Date(upper))]);
        // an offset names the same instant; equal bounds are one instant
        expect(parse('filter[createdAt]=>=2026-11-01T01:00:00%2B01:00').filters).toEqual([gte('createdAt', new Date(lower))]);
        expect(parse(`filter=and(gte(createdAt,'${lower}'),lte(createdAt,'${lower}'))`).filters)
            .toEqual([gte('createdAt', new Date(lower)), lte('createdAt', new Date(lower))]);
    });

    it('combines createdAt bounds with agent and status', () => {
        const query = 'filter=and(eq(agent,\'echo\'),in(status,\'queued\',\'running\'),gte(createdAt,\'2026-11-01T00:00:00Z\'),lte(createdAt,\'2026-11-02T00:00:00Z\'))';

        expect(parse(query)).toEqual({
            filters: [
                eq('agent', 'echo'),
                inArray('status', ['queued', 'running']),
                gte('createdAt', new Date('2026-11-01T00:00:00Z')),
                lte('createdAt', new Date('2026-11-02T00:00:00Z')),
            ],
            agent: 'echo',
            limit: 50,
            offset: 0,
            sorts: {},
        });
    });

    it('rejects a reversed createdAt range without echoing a value', () => {
        expect(() => parse('filter=and(gte(createdAt,\'2026-11-02T00:00:00Z\'),lte(createdAt,\'2026-11-01T00:00:00Z\'))'))
            .toThrow('filter[createdAt] has its lower bound after its upper bound.');
    });

    it.each([
        ['filter[createdAt]=2026-11-01T00:00:00Z', 'eq'],
        ['filter[createdAt]=>2026-11-01T00:00:00Z', 'gt'],
        ['filter[createdAt]=<2026-11-01T00:00:00Z', 'lt'],
        ['filter[createdAt]=>=2026-11-01', 'a day without a time'],
        ['filter[createdAt]=>=2026-11-01T00:00:00', 'no offset'],
        ['filter[createdAt]=>=2026-13-01T00:00:00Z', 'month 13'],
        ['filter[createdAt]=>=2026-02-30T00:00:00Z', 'February 30'],
        ['filter[createdAt]=>=2026', 'a number'],
        ['filter[createdAt]=>=yesterday', 'text'],
        ['filter[createdAt]=>=2026-11-01T00:00:00Z&filter[createdAt]=<=2026-11-02T00:00:00Z', 'a repeated bracket key'],
    ])('rejects filter[createdAt] that is no >= or <= ISO 8601 instant (%s: %s)', (query) => {
        let error: unknown;

        try {
            parse(query);
        } catch (e) {
            error = e;
        }

        expect((error as Error).message).toBe('filter[createdAt] takes a lower (>=) and an upper (<=) bound, each an ISO 8601 instant with a time and an offset.');
    });

    it('rejects a createdAt bound of one kind given twice', () => {
        expect(() => parse('filter=and(gte(createdAt,\'2026-11-01T00:00:00Z\'),gte(createdAt,\'2026-11-02T00:00:00Z\'))'))
            .toThrow('filter[createdAt] may be given once per bound.');
        expect(() => parse('filter=and(lte(createdAt,\'2026-11-01T00:00:00Z\'),lte(createdAt,\'2026-11-02T00:00:00Z\'))'))
            .toThrow('filter[createdAt] may be given once per bound.');
    });

    it('reads an agent name the wire coerces to a scalar back as the registered name', () => {
        const names = ['123', '007', 'true', 'null', '0x10'];
        const read = (query: string) => parseRunListQuery(new URLSearchParams(query), names).agent;

        expect(read('filter[agent]=123')).toBe('123');
        expect(read('filter=eq(agent,\'123\')')).toBe('123');
        expect(read('filter[agent]=007')).toBe('007');
        expect(read('filter[agent]=true')).toBe('true');
        expect(read('filter[agent]=null')).toBe('null');
        expect(read('filter[agent]=0x10')).toBe('0x10');
        // not registered: the canonical spelling
        expect(read('filter[agent]=42')).toBe('42');
    });

    it('rejects a coerced agent name two registered agents share', () => {
        expect(() => parseRunListQuery(new URLSearchParams('filter[agent]=7'), ['7', '007']))
            .toThrow('filter[agent] matches more than one agent');
    });

    it.each([
        'page[limit]=1e2',
        'page[limit]=50.5',
        'page[offset]=1e1',
        'page[offset]=2.5',
    ])('rejects a non-integer page value %s', (query) => {
        expect(() => parse(query)).toThrow('takes a non-negative integer');
    });

    it.each([
        ['filter[status]=nope', 'filter[status] takes run statuses.'],
        ['filter[status]=!queued', 'filter[status] takes run statuses.'],
        ['filter[agent]=a,b', 'filter[agent] takes one agent name.'],
        ['filter[agent]=a&filter[agent]=b', 'filter[agent] takes one agent name.'],
        ['filter[agent]=~a', 'filter[agent] takes one agent name.'],
        ['filter=and(eq(agent,\'a\'),eq(agent,\'b\'))', 'filter[agent] may be given once.'],
    ])('rejects %s', (query, message) => {
        expect(() => parse(query)).toThrow(message);
    });

    it.each([
        'filter[status]=',
        'page[limit]=500',
        'page[limit]=abc',
        'filter[nope]=1',
        'sort=id',
        'sort=-id',
    ])('rejects %s', (query) => {
        expect(() => parse(query)).toThrow();
    });
});
