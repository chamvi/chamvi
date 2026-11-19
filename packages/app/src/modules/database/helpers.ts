/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { ListSchema } from '@chamvi/http';
import { isObject } from 'smob';
import { DATABASE_URL_PROTOCOLS } from '../../config/constants.ts';
import { TIMER_MAX_MS } from '../../env/constants.ts';
import { envString, envUrl } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import type { AppMode } from '../../module/types.ts';
import {
    DATABASE_DESCRIPTOR,
    DATABASE_NAME_PATTERN,
    DATABASE_PREFIX,
    DEFAULT_DATABASE_NAME,
    MIGRATIONS_TABLE_PATTERN,
    OWNED_MIGRATIONS_TABLES,
    RESERVED_DATABASE_NAMES,
    RESERVED_MIGRATIONS_TABLE,
    RESERVED_MIGRATIONS_TABLE_PREFIXES,
} from './constants.ts';
import type { DatabaseDescriptor, DatabaseModuleOptions } from './types.ts';

function isClassList(value: unknown, allowSchemas: boolean): boolean {
    return Array.isArray(value) &&
        value.every((item) => typeof item === 'function' || (allowSchemas && isObject(item) && isObject(item.options)));
}

function toDirectory(value: unknown): string | undefined {
    if (value instanceof URL) {
        return value.protocol === 'file:' ? resolve(fileURLToPath(value)) : undefined;
    }

    if (typeof value === 'string' && value.length > 0) {
        return isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
    }

    return undefined;
}

/**
 * The frozen descriptor of `databaseModule(options)`; throws
 * InvalidAgentDefinitionError for options that are not a database's.
 */
export function buildDescriptor(options: DatabaseModuleOptions): DatabaseDescriptor {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('databaseModule needs an options object.');
    }

    const name = options.name ?? DEFAULT_DATABASE_NAME;

    if (typeof name !== 'string' || !DATABASE_NAME_PATTERN.test(name)) {
        throw new InvalidAgentDefinitionError('databaseModule\'s name must be a lower-case slug such as "notes".');
    }

    if (RESERVED_DATABASE_NAMES.includes(name)) {
        throw new InvalidAgentDefinitionError(`databaseModule's name cannot be "${name}": chamvi migration --database ${name} is chamvi's own store.`);
    }

    if (!isClassList(options.entities, true) || options.entities.length === 0) {
        throw new InvalidAgentDefinitionError(`The database "${name}" needs entities: a non-empty array of entity classes.`);
    }

    if (!isClassList(options.migrations, false)) {
        throw new InvalidAgentDefinitionError(`The database "${name}" needs migrations: an array of migration classes.`);
    }

    const migrationsDirectory = toDirectory(options.migrationsDirectory);

    if (migrationsDirectory === undefined) {
        throw new InvalidAgentDefinitionError(`The database "${name}" needs a migrationsDirectory: a file URL or a path.`);
    }

    const table = options.migrationsTableName;

    if (typeof table !== 'string' || !MIGRATIONS_TABLE_PATTERN.test(table)) {
        throw new InvalidAgentDefinitionError(
            `The database "${name}" needs a migrationsTableName that is a plain identifier: lower-case letters, digits and underscores, ` +
            'starting with a letter or an underscore, at most 63 characters, no schema and no quotes.',
        );
    }

    if (table === RESERVED_MIGRATIONS_TABLE) {
        throw new InvalidAgentDefinitionError(
            `The database "${name}" cannot record its migrations in "${RESERVED_MIGRATIONS_TABLE}": chamvi's own store does. Name a table of its own.`,
        );
    }

    const reserved = OWNED_MIGRATIONS_TABLES.includes(table) ?
        undefined :
        RESERVED_MIGRATIONS_TABLE_PREFIXES.find((prefix) => table.startsWith(prefix));

    if (reserved) {
        throw new InvalidAgentDefinitionError(
            `The database "${name}" cannot record its migrations in "${table}": chamvi's own store and TypeORM name their tables "${reserved}...". ` +
            'Name a table of its own.',
        );
    }

    return Object.freeze({
        name,
        entities: Object.freeze([...options.entities]),
        migrations: Object.freeze([...options.migrations]),
        migrationsDirectory,
        migrationsTableName: table,
        lockName: `${DATABASE_PREFIX}${name}`,
    });
}

/** `waitTimeoutMs` of `databaseModule(options)`: a positive integer a timer can wait, else InvalidAgentDefinitionError. */
export function readWaitTimeout(options: DatabaseModuleOptions): number | undefined {
    const value = options.waitTimeoutMs;

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > TIMER_MAX_MS) {
        throw new InvalidAgentDefinitionError(`databaseModule's waitTimeoutMs must be a whole number of milliseconds from 1 to ${TIMER_MAX_MS}.`);
    }

    return value;
}

/** The boolean option `key` of `databaseModule(options)`, else InvalidAgentDefinitionError. */
export function readFlag(options: DatabaseModuleOptions, key: 'postgres' | 'installExtensions'): boolean | undefined {
    const value = options[key];

    if (value !== undefined && typeof value !== 'boolean') {
        throw new InvalidAgentDefinitionError(`databaseModule's ${key} must be a boolean.`);
    }

    return value;
}

/**
 * `schemas` of `databaseModule(options)`: list schemas (`defineSchema()`),
 * each naming its entity, else InvalidAgentDefinitionError. Their fields
 * are checked against the entities in `setup`.
 */
export function readSchemas(options: DatabaseModuleOptions, name: string): ListSchema[] {
    const { schemas } = options;

    if (schemas === undefined) {
        return [];
    }

    const listed = Array.isArray(schemas) && schemas.every((schema) => isObject(schema) && Array.isArray((schema as ListSchema).filters));

    if (!listed) {
        throw new InvalidAgentDefinitionError(`The database "${name}" takes schemas as an array of list schemas (defineSchema()).`);
    }

    const unnamed = schemas.findIndex((schema) => schema.entity === undefined);

    if (unnamed !== -1) {
        throw new InvalidAgentDefinitionError(
            `The database "${name}" has a list schema (#${unnamed + 1}) that names no entity: give it the entity it lists.`,
        );
    }

    return [...schemas];
}

/** The descriptor a module carries, if it is a database module (also one copied property by property). */
export function descriptorOf(module: unknown): DatabaseDescriptor | undefined {
    if (!isObject(module)) {
        return undefined;
    }

    const descriptor = (module as Record<PropertyKey, unknown>)[DATABASE_DESCRIPTOR];

    return isObject(descriptor) ? descriptor as DatabaseDescriptor : undefined;
}

/**
 * `DATABASE_URL` of `env`, read as chamvi's config reads it (required in
 * `migrate` mode), and whether `NODE_ENV` is `production`. An error names
 * the variable, never its value.
 */
export function readDatabaseEnv(env: Env, mode: AppMode): { url: string | undefined; production: boolean } {
    return {
        url: envUrl(env, 'DATABASE_URL', { protocols: DATABASE_URL_PROTOCOLS, required: mode === 'migrate' }),
        production: envString(env, 'NODE_ENV') === 'production',
    };
}
