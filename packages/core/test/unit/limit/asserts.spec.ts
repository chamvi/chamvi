/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    APPROVAL_TIMEOUT_MAX_MS,
    InvalidAgentDefinitionError,
    defineEffectTool,
    defineModelAgent,
    defineRemoteAgent,
    defineSimpleAgent,
    defineTool,
} from '@chamvi/core';
import type { AgentLimits, ToolLimit } from '@chamvi/core';
import { assertAgentLimits, assertToolLimit } from '../../../src/limit/asserts.ts';
import { searchTool } from '../../utils/limits.ts';

const model = {} as LanguageModel;
const valid: ToolLimit = { max: 5, windowMs: 60_000 };
const search = (limit?: unknown) => defineTool({
    description: 'search',
    inputSchema: z.object({ q: z.string() }),
    execute: async () => 'ok',
    limit: limit as ToolLimit,
});

/** Each invalid limit, with the part of the message that names what is wrong. */
const INVALID: [string, unknown, RegExp][] = [
    ['no object', 5, /must be an object of max and windowMs/],
    ['null', null, /must be an object of max and windowMs/],
    ['an array', [], /must be an object of max and windowMs/],
    ['an unknown key', { ...valid, maxx: 1 }, /unknown key "maxx"/],
    ['no max', { windowMs: 1_000 }, /max .* must be an integer from 1 to 2147483647/],
    ['a max of 0', { ...valid, max: 0 }, /max .* must be an integer from 1 to 2147483647/],
    ['a fractional max', { ...valid, max: 1.5 }, /max .* must be an integer from 1 to 2147483647/],
    ['an unsafe max', { ...valid, max: 2 ** 53 }, /max .* must be an integer from 1 to 2147483647/],
    ['a string max', { ...valid, max: '5' }, /max .* must be an integer from 1 to 2147483647/],
    ['a max over 2^31 - 1', { ...valid, max: 2 ** 31 }, /max .* must be an integer from 1 to 2147483647/],
    ['no windowMs', { max: 1 }, /windowMs .* must be an integer from 1 to/],
    ['a windowMs of 0', { ...valid, windowMs: 0 }, /windowMs .* must be an integer from 1 to/],
    ['a windowMs above the timer limit', { ...valid, windowMs: APPROVAL_TIMEOUT_MAX_MS + 1 }, /windowMs .* must be an integer from 1 to 2147483647/],
    ['a fractional windowMs', { ...valid, windowMs: 1.5 }, /windowMs .* must be an integer from 1 to/],
    ['an unknown onExceed', { ...valid, onExceed: 'queue' }, /onExceed .* must be "approve" or "deny"/],
    ['an uppercase bucket', { ...valid, bucket: 'Search' }, /bucket .* must match/],
    ['a bucket of 65 characters', { ...valid, bucket: 'b'.repeat(65) }, /bucket .* must match/],
    ['a bucket with a colon', { ...valid, bucket: 'a:b' }, /bucket .* must match/],
    ['a numeric bucket', { ...valid, bucket: 5 }, /bucket .* must match/],
    ['a weight that is no function', { ...valid, weight: 2 }, /"weight" .* must be a function/],
    ['a detail that is no function', { ...valid, detail: 'text' }, /"detail" .* must be a function/],
];

describe('assertToolLimit', () => {
    it.each([
        ['absent', undefined],
        ['the least', { max: 1, windowMs: 1 }],
        ['the largest window', { max: 1, windowMs: APPROVAL_TIMEOUT_MAX_MS }],
        ['every field', {
            max: 3,
            windowMs: 3_600_000,
            onExceed: 'deny',
            bucket: 'web-calls',
            weight: () => 2,
            detail: async () => 'detail',
        }],
        ['approve', { ...valid, onExceed: 'approve' }],
        ['a bucket of 64 characters', { ...valid, bucket: 'b'.repeat(64) }],
        ['optional fields given as undefined', {
            ...valid,
            onExceed: undefined,
            bucket: undefined,
            weight: undefined,
            detail: undefined,
        }],
    ])('takes %s', (_, limit) => {
        expect(() => assertToolLimit(limit, 'search')).not.toThrow();
    });

    it.each(INVALID)('refuses %s, naming the tool', (_, limit, message) => {
        expect(() => assertToolLimit(limit, 'search')).toThrow(InvalidAgentDefinitionError);
        expect(() => assertToolLimit(limit, 'search')).toThrow(message);
        expect(() => assertToolLimit(limit, 'search')).toThrow('tool "search"');
    });

    it('says "a tool" without a name', () => {
        expect(() => assertToolLimit({ max: 0, windowMs: 1 })).toThrow('a tool');
    });
});

describe('assertAgentLimits', () => {
    it('takes absent limits, an empty record, false and valid limits', () => {
        expect(() => assertAgentLimits(undefined)).not.toThrow();
        expect(() => assertAgentLimits({})).not.toThrow();
        expect(() => assertAgentLimits({ search: valid, fetch: false })).not.toThrow();
    });

    it.each([5, null, [], 'search'])('refuses limits that are no record: %j', (limits) => {
        expect(() => assertAgentLimits(limits)).toThrow(InvalidAgentDefinitionError);
        expect(() => assertAgentLimits(limits)).toThrow('limits must be a record of tool limits');
    });

    it.each(INVALID)('refuses an entry with %s, naming its tool', (_, limit, message) => {
        expect(() => assertAgentLimits({ search: limit })).toThrow(message);
        expect(() => assertAgentLimits({ search: limit })).toThrow('tool "search"');
    });

    it('refuses true as an entry: only false turns a limit off', () => {
        expect(() => assertAgentLimits({ search: true })).toThrow('tool "search"');
    });
});

describe('limit on the tool and agent definitions', () => {
    it('defineTool keeps a valid limit on the tool and refuses an invalid one', () => {
        expect((search(valid) as { limit?: unknown }).limit).toEqual(valid);
        expect(() => search({ max: 0, windowMs: 1 })).toThrow(InvalidAgentDefinitionError);
    });

    it('defineEffectTool keeps a valid limit and refuses an invalid one', () => {
        const define = (limit: unknown) => defineEffectTool({
            description: 'post',
            inputSchema: z.object({ text: z.string() }),
            execute: async () => 'ok',
            limit: limit as ToolLimit,
        });

        expect((define(valid) as { limit?: unknown }).limit).toEqual(valid);
        expect(() => define({ ...valid, bucket: 'Bad' })).toThrow(InvalidAgentDefinitionError);
    });

    it('defineModelAgent keeps valid limits and refuses invalid ones', () => {
        const limits: AgentLimits = { search: { ...valid, onExceed: 'deny' }, fetch: false };

        expect(defineModelAgent({
            name: 'a',
            model,
            instructions: 'x',
            tools: { search: searchTool([]), fetch: searchTool([]) },
            limits,
        }).definition.limits).toEqual(limits);
        expect(() => defineModelAgent({
            name: 'a',
            model,
            instructions: 'x',
            limits: { search: { max: 1, windowMs: 0 } },
        }))
            .toThrow('tool "search"');
        expect(() => defineModelAgent({
            name: 'a',
            model,
            instructions: 'x',
            limits: 5 as unknown as AgentLimits,
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('a simple agent takes no limits', () => {
        expect(() => defineSimpleAgent({
            name: 's',
            run: () => undefined,
            limits: { search: valid } as never,
        })).toThrow('"limits" is not allowed on a simple agent');
    });

    it('a remote agent takes no limits', () => {
        expect(() => defineRemoteAgent({
            name: 'r',
            peer: 'p',
            limits: { search: valid } as never,
        })).toThrow('"limits" is not allowed on a remote agent');
    });
});
