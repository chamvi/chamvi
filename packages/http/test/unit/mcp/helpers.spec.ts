/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Run, WaitPoint } from '@chamvi/core';
import { isWaitOver, toJsonSchema, toRunToolResult } from '../../../src/mcp/helpers.ts';

function plainSchema(jsonSchema?: unknown): StandardSchemaV1 {
    return {
        '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value) => ({ value }),
            ...(jsonSchema ? { jsonSchema } : {}),
        },
    } as StandardSchemaV1;
}

describe('toJsonSchema', () => {
    it('converts a schema with a json schema converter, without $schema', () => {
        const schema = toJsonSchema(z.object({ n: z.number() }));

        expect(schema).toMatchObject({ type: 'object', properties: { n: { type: 'number' } } });
        expect(schema).not.toHaveProperty('$schema');
    });

    it('re-roots local refs at the given pointer, leaving data keywords alone', () => {
        const schema = toJsonSchema(plainSchema({
            input: () => ({
                type: 'object',
                properties: {
                    self: { $ref: '#' },
                    node: { $ref: '#/definitions/node' },
                    remote: { $ref: 'https://example.com/schema' },
                    fixed: { const: { $ref: '#' } },
                },
                definitions: { node: { type: 'array', items: { $ref: '#/definitions/node' } } },
            }),
            output: () => ({}),
        }), '#/properties/payload');

        expect(schema).toEqual({
            type: 'object',
            properties: {
                self: { $ref: '#/properties/payload' },
                node: { $ref: '#/properties/payload/definitions/node' },
                remote: { $ref: 'https://example.com/schema' },
                fixed: { const: { $ref: '#' } },
            },
            definitions: { node: { type: 'array', items: { $ref: '#/properties/payload/definitions/node' } } },
        });
    });

    it('is {} without a schema, without a converter, or when the converter throws', () => {
        expect(toJsonSchema(undefined)).toEqual({});
        expect(toJsonSchema(plainSchema())).toEqual({});
        expect(toJsonSchema(plainSchema({
            input: () => {
                throw new Error('unsupported');
            },
            output: () => ({}),
        }))).toEqual({});
    });
});

function buildRun(status: Run['status'], waiting?: WaitPoint): Run {
    const now = new Date(0);

    return {
        id: 'r1',
        agent: 'gate',
        status,
        trigger: {
            id: 't1',
            agent: 'gate',
            trigger: 'mcp',
            channel: 'mcp',
            payload: undefined,
            receivedAt: now,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        ...(waiting ? { waiting } : {}),
        createdAt: now,
        updatedAt: now,
    };
}

const DISPATCH_WAIT: WaitPoint = {
    kind: 'dispatch',
    id: '0:c1:w0',
    toolName: 'delegate',
    toolCallId: 'c1',
    runIds: ['c1', 'c2'],
    expiresAt: new Date(1000),
};

const APPROVAL_WAIT: WaitPoint = {
    kind: 'approval',
    id: '0:c1:0',
    approvalId: '0:c1:0',
    toolName: 'deploy',
    toolCallId: 'c1',
    title: 'Deploy?',
    expiresAt: new Date(1000),
};

describe('toRunToolResult', () => {
    it('serializes an approval wait', () => {
        const result = toRunToolResult(buildRun('waiting', APPROVAL_WAIT), false);

        expect(result.waiting).toEqual({
            toolName: 'deploy',
            title: 'Deploy?',
            expiresAt: new Date(1000).toISOString(),
        });
    });

    it('omits a dispatch wait', () => {
        const result = toRunToolResult(buildRun('waiting', DISPATCH_WAIT), false);

        expect(result).not.toHaveProperty('waiting');
        expect(result.status).toBe('waiting');
    });
});

describe('isWaitOver', () => {
    it('is true for a terminal run and an approval wait', () => {
        expect(isWaitOver(buildRun('completed'))).toBe(true);
        expect(isWaitOver(buildRun('failed'))).toBe(true);
        expect(isWaitOver(buildRun('cancelled'))).toBe(true);
        expect(isWaitOver(buildRun('waiting', APPROVAL_WAIT))).toBe(true);
    });

    it('is false for a dispatch wait and an unsettled run', () => {
        expect(isWaitOver(buildRun('waiting', DISPATCH_WAIT))).toBe(false);
        expect(isWaitOver(buildRun('queued'))).toBe(false);
        expect(isWaitOver(buildRun('running'))).toBe(false);
        expect(isWaitOver(buildRun('interrupted'))).toBe(false);
    });
});
