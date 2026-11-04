/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { TypeValidationError, asSchema, jsonSchema } from 'ai';
import type { JSONSchema7 } from 'ai';
import { isObject } from 'smob';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { JSON_SCHEMA_DATA_KEYWORDS } from './constants.ts';
import type { RoleToolInput } from './types.ts';

const PAYLOAD_POINTER = '#/properties/payload';

/**
 * `node` with every local `$ref` (`#`, `#/definitions/...`) re-rooted at
 * `pointer`, so a schema nested there still resolves its own definitions.
 * The one implementation: the generated dispatch tools and the MCP run
 * tools of `@chamvi/http` wrap a role schema the same way.
 */
export function rebaseJsonSchemaRefs(node: unknown, pointer: string): unknown {
    if (Array.isArray(node)) {
        return node.map((item) => rebaseJsonSchemaRefs(item, pointer));
    }

    if (!isObject(node)) {
        return node;
    }

    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string' && value.startsWith('#')) {
            out[key] = `${pointer}${value.slice(1)}`;
        } else if (JSON_SCHEMA_DATA_KEYWORDS.has(key)) {
            out[key] = value;
        } else {
            out[key] = rebaseJsonSchemaRefs(value, pointer);
        }
    }

    return out;
}

/** The role schema's input JSON Schema without `$schema`; refuses, never falls back to `{}`. */
async function convert(label: string, schema: StandardSchemaV1): Promise<Record<string, unknown>> {
    let json: JSONSchema7;

    try {
        json = await asSchema(schema).jsonSchema;
    } catch {
        throw new InvalidAgentDefinitionError(`${label}: the role schema cannot be converted to JSON Schema.`);
    }

    if (!isObject(json)) {
        throw new InvalidAgentDefinitionError(`${label}: the role schema cannot be converted to JSON Schema.`);
    }

    const out: Record<string, unknown> = { ...json };

    delete out.$schema;

    return out;
}

function failure(value: unknown, issues: readonly StandardSchemaV1.Issue[]) {
    return { success: false as const, error: new TypeValidationError({ value, cause: issues }) };
}

/** Prefixes each issue's path with `payload`, as the model sees the wrapped input. */
function underPayload(issues: readonly StandardSchemaV1.Issue[]): StandardSchemaV1.Issue[] {
    return issues.map((issue) => ({ ...issue, path: ['payload', ...(issue.path ?? [])] }));
}

/**
 * A role schema as a generated tool's input. An object root is the input as
 * is (payload = input); any other root, or no schema, is wrapped as a
 * required `payload` (local `$ref`s rebased), payload = `input.payload`. The
 * validator runs the role schema for early model feedback but returns the
 * raw input, so `dispatch()` parses exactly once. A schema that cannot be
 * converted is an `InvalidAgentDefinitionError` naming `label`.
 */
export async function toRoleToolInput(
    label: string,
    schema: StandardSchemaV1 | undefined,
): Promise<RoleToolInput> {
    const json = schema ? await convert(label, schema) : undefined;

    if (schema && json && json.type === 'object') {
        return {
            inputSchema: jsonSchema(json as JSONSchema7, {
                validate: async (value) => {
                    const result = await schema['~standard'].validate(value);

                    return result.issues ? failure(value, result.issues) : { success: true, value };
                },
            }),
            toPayload: (input) => input,
        };
    }

    const wrapped: JSONSchema7 = {
        type: 'object',
        properties: { payload: (json ? rebaseJsonSchemaRefs(json, PAYLOAD_POINTER) : {}) as JSONSchema7 },
        required: ['payload'],
        additionalProperties: false,
    };

    return {
        inputSchema: jsonSchema(wrapped, {
            validate: async (value) => {
                if (!isObject(value) || !('payload' in value)) {
                    return failure(value, [{ message: 'Required', path: ['payload'] }]);
                }

                if (!schema) {
                    return { success: true, value };
                }

                const result = await schema['~standard'].validate(value.payload);

                return result.issues ? failure(value, underPayload(result.issues)) : { success: true, value };
            },
        }),
        toPayload: (input) => (input as { payload: unknown }).payload,
    };
}
