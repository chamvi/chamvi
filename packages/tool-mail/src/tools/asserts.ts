/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import type { JSONSchema7 } from 'ai';
import { ValidationError } from '@chamvi/core';
import type { ToolContext } from '@chamvi/core';
import { isObject } from 'smob';
import type { MailClientSource } from './types.ts';

/** The tool input as an object, else a ValidationError (a tool error the model can correct). */
export function inputObject(input: unknown): Record<string, unknown> {
    if (!isObject(input)) {
        throw new ValidationError('The tool input must be an object.');
    }

    return input;
}

/** A non-empty string, else a ValidationError. */
export function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${name} must be a non-empty string.`);
    }

    return value;
}

/** An integer in `[min, max]` or undefined, else a ValidationError. */
export function optionalInteger(value: unknown, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
    }

    return value;
}

/** One of `allowed` or undefined, else a ValidationError. */
export function optionalOneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new ValidationError(`${name} must be one of ${allowed.join(', ')}.`);
    }

    return value as T;
}

/** The call's abort signal combined with the run's. */
export function signalOf(abortSignal: AbortSignal | undefined, context: ToolContext): AbortSignal {
    const { signal } = context.run;

    if (!abortSignal || abortSignal === signal) {
        return signal;
    }

    return AbortSignal.any([abortSignal, signal]);
}

/**
 * The `taint` classification of every mail tool, decided before the call
 * runs: a read taints the run, also when it fails. Only the client of an app
 * without accounts (`configured: false`) does not, since its refusal carries
 * nothing from outside.
 */
export function taintOf(source: MailClientSource): (input: unknown, context: ToolContext) => boolean {
    return (_input, context) => source(context).configured !== false;
}

/** An object schema of `properties`, the `required` ones required. */
export function objectSchema<T>(properties: Record<string, JSONSchema7>, required: string[] = []) {
    return jsonSchema<T>({
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    });
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

/** An ISO date (`2026-11-04` or a date-time) or undefined, else a ValidationError. */
export function optionalDate(value: unknown, name: string): Date | undefined {
    if (value === undefined) {
        return undefined;
    }

    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value) ?
        new Date(value) :
        undefined;

    if (!date || Number.isNaN(date.getTime())) {
        throw new ValidationError(`${name} must be an ISO date such as 2026-11-04.`);
    }

    return date;
}
