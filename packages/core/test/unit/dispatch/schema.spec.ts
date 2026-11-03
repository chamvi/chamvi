/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { TypeValidationError, asSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { InvalidAgentDefinitionError, rebaseJsonSchemaRefs } from '@chamvi/core';
import { toRoleToolInput } from '../../../src/dispatch/schema.ts';

async function validate(inputSchema: Awaited<ReturnType<typeof toRoleToolInput>>['inputSchema'], value: unknown) {
    const { validate: fn } = asSchema(inputSchema);

    return fn!(value);
}

function jsonOf(inputSchema: Awaited<ReturnType<typeof toRoleToolInput>>['inputSchema']): Record<string, unknown> {
    return asSchema(inputSchema).jsonSchema as Record<string, unknown>;
}

function collectRefs(node: unknown, out: string[] = []): string[] {
    if (Array.isArray(node)) {
        node.forEach((item) => collectRefs(item, out));
    } else if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
            if (key === '$ref' && typeof value === 'string') {
                out.push(value);
            } else {
                collectRefs(value, out);
            }
        }
    }

    return out;
}

describe('toRoleToolInput()', () => {
    it('uses an object schema as the tool input and passes the raw input', async () => {
        const schema = z.object({ pr: z.string(), count: z.string().transform(Number) });
        const { inputSchema, toPayload } = await toRoleToolInput('dispatch_pr', schema);
        const json = jsonOf(inputSchema);

        expect(json.type).toBe('object');
        expect(json).not.toHaveProperty('$schema');
        expect(Object.keys(json.properties as object)).toEqual(['pr', 'count']);

        const input = { pr: 'o/r#1', count: '3' };
        const result = await validate(inputSchema, input);

        expect(result).toEqual({ success: true, value: { pr: 'o/r#1', count: '3' } });
        expect(toPayload(input)).toBe(input);
    });

    it('wraps a non-object root as a required payload', async () => {
        const { inputSchema, toPayload } = await toRoleToolInput('dispatch_pr', z.string());
        const json = jsonOf(inputSchema);

        expect(json).toMatchObject({
            type: 'object',
            properties: { payload: { type: 'string' } },
            required: ['payload'],
            additionalProperties: false,
        });
        expect(await validate(inputSchema, { payload: 'x' })).toEqual({ success: true, value: { payload: 'x' } });
        expect(toPayload({ payload: 'x' })).toBe('x');
    });

    it('wraps any payload without a schema', async () => {
        const { inputSchema, toPayload } = await toRoleToolInput('dispatch_pr', undefined);

        expect(jsonOf(inputSchema)).toEqual({
            type: 'object',
            properties: { payload: {} },
            required: ['payload'],
            additionalProperties: false,
        });
        expect(await validate(inputSchema, { payload: [1, 2] })).toEqual({ success: true, value: { payload: [1, 2] } });
        expect(toPayload({ payload: 42 })).toBe(42);
    });

    it('rebases the local $refs of a recursive schema under the payload', async () => {
        type Node = { name: string, children: Node[] };
        const node: z.ZodType<Node> = z.lazy(() => z.object({ name: z.string(), children: z.array(node) }));
        const { inputSchema } = await toRoleToolInput('dispatch_tree', z.array(node));
        const refs = collectRefs(jsonOf(inputSchema));

        expect(refs.length).toBeGreaterThan(0);

        for (const ref of refs) {
            expect(ref.startsWith('#/properties/payload')).toBe(true);
        }
    });

    it('refuses a Standard Schema without a JSON Schema converter', async () => {
        const schema: StandardSchemaV1 = {
            '~standard': {
                version: 1,
                vendor: 'x',
                validate: (value) => ({ value }),
            },
        };

        await expect(toRoleToolInput('dispatch_pr', schema)).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(toRoleToolInput('dispatch_pr', schema)).rejects
            .toThrow('dispatch_pr: the role schema cannot be converted to JSON Schema.');
    });

    it('fails invalid input with a TypeValidationError carrying the issues', async () => {
        const { inputSchema } = await toRoleToolInput('dispatch_pr', z.object({ pr: z.string() }));
        const result = await validate(inputSchema, { pr: 1 });

        expect(result.success).toBe(false);

        if (result.success) {
            return;
        }

        expect(TypeValidationError.isInstance(result.error)).toBe(true);

        const { cause } = result.error as TypeValidationError;

        expect(Array.isArray(cause)).toBe(true);
        expect((cause as StandardSchemaV1.Issue[])[0]).toMatchObject({ path: ['pr'] });
    });

    it('validates the payload part of a wrapped schema', async () => {
        const { inputSchema } = await toRoleToolInput('dispatch_pr', z.string());
        const result = await validate(inputSchema, { payload: 1 });

        expect(result.success).toBe(false);
    });
    it('rebaseJsonSchemaRefs re-roots local refs and leaves remote refs and data keywords alone', () => {
        expect(rebaseJsonSchemaRefs({
            items: [{ $ref: '#/definitions/node' }],
            remote: { $ref: 'https://example.com/schema' },
            fixed: { const: { $ref: '#' }, enum: [{ $ref: '#' }] },
        }, '#/properties/payload')).toEqual({
            items: [{ $ref: '#/properties/payload/definitions/node' }],
            remote: { $ref: 'https://example.com/schema' },
            fixed: { const: { $ref: '#' }, enum: [{ $ref: '#' }] },
        });
    });
});
