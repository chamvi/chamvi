/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { isObject } from 'smob';

/** The tool input as an object, else a ValidationError (a tool error the model can correct). */
export function inputObject(input: unknown): Record<string, unknown> {
    if (!isObject(input)) {
        throw new ValidationError('The tool input must be an object.');
    }

    return input;
}

/** A non-empty string, else a ValidationError. */
export function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(`${name} must be a non-empty string.`);
    }

    return value;
}

/** A string (empty allowed), else a ValidationError. */
export function requireText(value: unknown, name: string): string {
    if (typeof value !== 'string') {
        throw new ValidationError(`${name} must be a string.`);
    }

    return value;
}

/** A non-empty string or undefined, else a ValidationError. */
export function optionalString(value: unknown, name: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return requireString(value, name);
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

/** An integer in `[min, max]` or undefined, else a ValidationError. */
export function optionalInteger(value: unknown, name: string, min: number, max: number): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
    }

    return value;
}
