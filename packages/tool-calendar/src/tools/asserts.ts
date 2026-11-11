/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import type { JSONSchema7 } from 'ai';
import { ValidationError, inject } from '@chamvi/core';
import type { ToolContext } from '@chamvi/core';
import { isObject } from 'smob';
import type { ICalendarClient } from '../client/types.ts';
import { CALENDAR_CONTEXT } from '../context/constants.ts';

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

/** A non-empty string or undefined, else a ValidationError. */
export function optionalString(value: unknown, name: string): string | undefined {
    return value === undefined ? undefined : requireString(value, name);
}

/** The call's abort signal combined with the run's. */
export function signalOf(abortSignal: AbortSignal | undefined, context: ToolContext): AbortSignal {
    const { signal } = context.run;

    if (!abortSignal || abortSignal === signal) {
        return signal;
    }

    return AbortSignal.any([abortSignal, signal]);
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

/** The tools' own client, else the one provided on the engine (ContextNotProvidedError without one). */
export function clientOf(client: ICalendarClient | undefined, context: ToolContext): ICalendarClient {
    return client ?? inject(context, CALENDAR_CONTEXT);
}

/**
 * The `taint` classification of both calendar tools, decided before the call
 * runs: a read taints the run, also when it fails. Only the client of an app
 * without accounts (`configured: false`) does not, since its refusal carries
 * nothing from outside.
 */
export function taintOf(client: ICalendarClient | undefined): (input: unknown, context: ToolContext) => boolean {
    return (_input, context) => clientOf(client, context).configured !== false;
}
