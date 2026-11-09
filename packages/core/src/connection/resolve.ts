/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '../errors/index.ts';
import type {
    ConnectionField,
    ConnectionFieldKind,
    ConnectionFieldSource,
    ConnectionState,
    ConnectionValue,
    ConnectionValues,
    ResolveConnectionInput,
    ResolvedConnection,
} from './types.ts';

type ResolvedField = { value: ConnectionValue; source: ConnectionFieldSource };

/** Defines an own property: an assignment of `__proto__` would set the prototype instead. */
function define<T>(target: Record<string, T>, key: string, value: T): void {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}

/** Types a raw variable by the field's kind; an invalid value is refused naming the variable, never echoing it. */
function coerceVariable(kind: ConnectionFieldKind, variable: string, value: string): ConnectionValue {
    if (kind === 'number') {
        if (!/^\d+$/.test(value)) {
            throw new InvalidAgentDefinitionError(`The variable ${variable} must be a whole number.`);
        }

        return Number(value);
    }

    if (kind === 'boolean') {
        if (value !== 'true' && value !== 'false' && value !== '1' && value !== '0') {
            throw new InvalidAgentDefinitionError(`The variable ${variable} must be true, false, 1 or 0.`);
        }

        return value === 'true' || value === '1';
    }

    if (kind === 'list') {
        return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
    }

    return value;
}

function resolveField(field: ConnectionField, input: ResolveConnectionInput): ResolvedField | undefined {
    if (input.preset && Object.hasOwn(input.preset, field.key)) {
        return input.preset[field.key];
    }

    const variable = field.env?.(input.name);

    if (variable !== undefined) {
        const value = input.readVariable(variable);

        if (value !== undefined && value !== '') {
            return { value: coerceVariable(field.kind, variable, value), source: { kind: 'env', variable } };
        }
    }

    if (input.stored && Object.hasOwn(input.stored, field.key)) {
        return { value: input.stored[field.key] as ConnectionValue, source: { kind: 'store' } };
    }

    return undefined;
}

/**
 * Resolves each field of a connection: a preset first, then its variable (an
 * empty one is unset, the rest typed by the field's kind), then the stored
 * value, recording the source that won.
 * A required field missing while any field came from the environment is a
 * deployment error and throws InvalidAgentDefinitionError naming the variable,
 * never a value; a store-only gap stays `incomplete`, so the dashboard can
 * repair it.
 */
export function resolveConnection(input: ResolveConnectionInput): ResolvedConnection {
    const values: ConnectionValues = {};
    const sources: Record<string, ConnectionFieldSource> = {};
    const missing: ConnectionField[] = [];

    for (const field of input.definition.fields) {
        const resolved = resolveField(field, input);

        if (resolved) {
            define(values, field.key, resolved.value);
            define(sources, field.key, resolved.source);
        } else {
            define(sources, field.key, { kind: 'unset' });

            if (field.required) {
                missing.push(field);
            }
        }
    }

    const envTouched = Object.values(sources).some((source) => source.kind === 'env');

    if (missing.length > 0 && envTouched) {
        const names = missing.map((field) => field.env?.(input.name) ?? `field "${field.key}"`);
        throw new InvalidAgentDefinitionError(
            `The connection "${input.name}" is partly set from the environment but is missing ${names.join(', ')}.`,
        );
    }

    let state: ConnectionState = 'configured';

    if (missing.length > 0) {
        state = 'incomplete';
    }

    if (Object.keys(values).length === 0) {
        state = 'not_configured';
    }

    return {
        name: input.name,
        values,
        sources,
        missing: missing.map((field) => field.key),
        state,
    };
}

/** The stored name of an account of a multi-instance type (`mail-work`). */
export function storedConnectionName(type: string, account: string): string {
    return `${type}-${account}`;
}
