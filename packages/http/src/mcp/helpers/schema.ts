/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { rebaseJsonSchemaRefs } from '@chamvi/core';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

type JsonSchemaCarrier = { '~standard': Partial<StandardJSONSchemaV1.Props> };

/**
 * The JSON Schema (draft-07, without `$schema`) of a Standard Schema's
 * input, for a tool's `payload`; `{}` (anything) without a schema, a
 * converter, or when conversion fails. `pointer` is where the schema sits in
 * the tool's input schema (e.g. `#/properties/payload`): local `$ref`s of a
 * recursive or reused schema are rewritten to resolve from there.
 */
export function toJsonSchema(schema: StandardSchemaV1 | undefined, pointer = '#'): Record<string, unknown> {
    const converter = (schema as JsonSchemaCarrier | undefined)?.['~standard'].jsonSchema;

    if (!converter) {
        return {};
    }

    try {
        const jsonSchema = { ...converter.input({ target: 'draft-07' }) };

        delete jsonSchema.$schema;

        return rebaseJsonSchemaRefs(jsonSchema, pointer) as Record<string, unknown>;
    } catch {
        return {};
    }
}
