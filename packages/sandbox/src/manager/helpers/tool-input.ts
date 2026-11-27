/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import type { JSONSchema7 } from 'ai';
import { ValidationError } from '@chamvi/errors';
import { isObject } from 'smob';

/** A string or undefined, else a ValidationError (a tool error the model can correct). */
export function optionalString(value: unknown, name: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new ValidationError(`${name} must be a string.`);
    }

    return value;
}

/** A boolean or undefined, else a ValidationError. */
export function optionalBoolean(value: unknown, name: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        throw new ValidationError(`${name} must be a boolean.`);
    }

    return value;
}

/** The tool input as an object, else a ValidationError. */
export function inputObject(input: unknown): Record<string, unknown> {
    if (!isObject(input)) {
        throw new ValidationError('The tool input must be an object.');
    }

    return input;
}

/** An object schema of optional `properties`. */
export function optionalObjectSchema<T>(properties: Record<string, JSONSchema7>) {
    return jsonSchema<T>({
        type: 'object',
        properties,
        additionalProperties: false,
    });
}
