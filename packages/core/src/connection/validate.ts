/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../agent/constants.ts';
import { ValidationError } from '../errors/index.ts';
import {
    CONNECTION_ENTRY_KEY_MAX_LENGTH,
    CONNECTION_SECRET_FIELD_MAX_LENGTH,
    CONNECTION_TYPE_MAX_LENGTH,
} from './constants.ts';
import type { ConnectionConfigWrite, ConnectionEntryWrite, ConnectionValue } from './types.ts';
import type { ConnectionInput } from '@chamvi/store';

/**
 * Text every driver stores as given: well-formed UTF-16 (a lone surrogate
 * would be stored as U+FFFD in Postgres and seal to a shared AAD) without
 * NUL (which a Postgres `jsonb` or `varchar` refuses).
 */
export const isStorableConnectionText = (value: unknown): value is string => typeof value === 'string' &&
    !value.includes('\0') &&
    value.isWellFormed();

const isText = (value: unknown, max: number): value is string => isStorableConnectionText(value) &&
    value.length > 0 &&
    value.length <= max;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!isObject(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
};

const isSettingValue = (value: unknown): boolean => {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }

    if (Array.isArray(value)) {
        return value.every(isStorableConnectionText);
    }

    return typeof value === 'boolean' || isStorableConnectionText(value);
};

/**
 * Plain settings every driver stores and reads back alike: a plain object
 * whose keys are storable text and whose values are storable text, finite
 * numbers, booleans or arrays of storable text; a ValidationError otherwise
 * (no key or value is echoed).
 */
export function assertConnectionSettings(settings: unknown): asserts settings is Record<string, ConnectionValue> {
    if (!isPlainObject(settings)) {
        throw new ValidationError('Connection settings must be a plain object.');
    }

    for (const key of Object.keys(settings)) {
        if (!isStorableConnectionText(key) || !isSettingValue(settings[key])) {
            throw new ValidationError(
                'A connection setting must have a well-formed key without NUL and a value of well-formed text without NUL, ' +
                'a finite number, a boolean or a list of such text.',
            );
        }
    }
}

const isDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

/** A connection name follows the agent-name rule; a ValidationError otherwise. */
export function assertConnectionName(name: unknown): asserts name is string {
    if (typeof name !== 'string' || name.length > NAME_MAX_LENGTH || !NAME_PATTERN.test(name)) {
        throw new ValidationError(`A connection name must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`);
    }
}

/** An entry key is 1 to 255 characters of well-formed UTF-16 without NUL; a ValidationError otherwise (the key is not echoed). */
export function assertConnectionEntryKey(key: unknown): asserts key is string {
    if (!isText(key, CONNECTION_ENTRY_KEY_MAX_LENGTH)) {
        throw new ValidationError(
            `A connection entry key must be a well-formed string of 1 to ${CONNECTION_ENTRY_KEY_MAX_LENGTH} characters without NUL.`,
        );
    }
}

/** The whole shape of a connection to insert; a ValidationError otherwise. */
export function assertConnection(connection: unknown): asserts connection is ConnectionInput {
    if (!isObject(connection)) {
        throw new ValidationError('A connection must be an object.');
    }

    assertConnectionName(connection.name);

    if (!isText(connection.type, CONNECTION_TYPE_MAX_LENGTH) || !isText(connection.keyId, CONNECTION_TYPE_MAX_LENGTH)) {
        throw new ValidationError(
            `A connection type and key id must be well-formed strings of 1 to ${CONNECTION_TYPE_MAX_LENGTH} characters without NUL.`,
        );
    }

    if (!(connection.wrappedKey instanceof Uint8Array)) {
        throw new ValidationError('A connection wrapped key must be a Uint8Array.');
    }

    if (!isDate(connection.createdAt) || !isDate(connection.updatedAt)) {
        throw new ValidationError('A connection createdAt and updatedAt must be valid dates.');
    }
}

function assertConnectionSecretField(field: unknown): asserts field is string {
    if (!isText(field, CONNECTION_SECRET_FIELD_MAX_LENGTH)) {
        throw new ValidationError(
            `A connection secret field must be a well-formed string of 1 to ${CONNECTION_SECRET_FIELD_MAX_LENGTH} characters without NUL.`,
        );
    }
}

/** A whole config write and what it expects, before anything is written; a ValidationError otherwise (no field or value is echoed). */
export function assertConnectionConfigWrite(write: unknown, expected: unknown): asserts write is ConnectionConfigWrite {
    if (!isObject(write)) {
        throw new ValidationError('A connection config write must be an object.');
    }

    if (!isObject(expected) || !(expected.wrappedKey instanceof Uint8Array)) {
        throw new ValidationError('A connection wrapped key must be a Uint8Array.');
    }

    if (expected.revision !== undefined && (!Number.isSafeInteger(expected.revision) || (expected.revision as number) < 0)) {
        throw new ValidationError('An expected connection revision must be a non-negative integer.');
    }

    if (expected.generation !== undefined && typeof expected.generation !== 'string') {
        throw new ValidationError('An expected connection generation must be a string.');
    }

    if (write.settings !== undefined) {
        assertConnectionSettings(write.settings);
    }

    if (write.setSecrets !== undefined) {
        if (!isObject(write.setSecrets)) {
            throw new ValidationError('A connection config write setSecrets must be an object of Uint8Array values.');
        }

        for (const [field, value] of Object.entries(write.setSecrets)) {
            assertConnectionSecretField(field);

            if (!(value instanceof Uint8Array)) {
                throw new ValidationError('A connection secret value must be a Uint8Array.');
            }
        }
    }

    if (write.clearSecrets === undefined) {
        return;
    }

    if (!Array.isArray(write.clearSecrets)) {
        throw new ValidationError('A connection config write clearSecrets must be an array of fields.');
    }

    for (const field of write.clearSecrets) {
        assertConnectionSecretField(field);
    }
}

/** The whole batch, before anything is written; a ValidationError otherwise. */
export function assertConnectionEntryWrite(write: unknown): asserts write is ConnectionEntryWrite {
    if (!isObject(write)) {
        throw new ValidationError('A connection entry write must be an object.');
    }

    if (write.clear !== undefined && typeof write.clear !== 'boolean') {
        throw new ValidationError('A connection entry write clear must be a boolean.');
    }

    if (write.set !== undefined) {
        if (!isObject(write.set)) {
            throw new ValidationError('A connection entry write set must be an object of Uint8Array values.');
        }

        for (const [key, value] of Object.entries(write.set)) {
            assertConnectionEntryKey(key);

            if (!(value instanceof Uint8Array)) {
                throw new ValidationError('A connection entry value must be a Uint8Array.');
            }
        }
    }

    if (!(write.delete !== undefined)) {
        return;
    }

    if (!Array.isArray(write.delete)) {
        throw new ValidationError('A connection entry write delete must be an array of keys.');
    }

    for (const key of write.delete) {
        assertConnectionEntryKey(key);
    }
}
