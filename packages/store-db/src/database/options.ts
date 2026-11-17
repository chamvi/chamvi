/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSourceOptions } from 'typeorm';
import { pinTimezone } from 'typeorm-extension';
import { DatabaseOptionsError } from '../error/options.ts';
import {
    CHAMVI_MIGRATIONS_TABLE,
    DATABASE_MIGRATIONS_TABLE_PATTERN,
    POSTGRES_PROTOCOLS,
    RESERVED_TABLE_PREFIXES,
    SQLITE_DRIVER,
    SQLITE_MEMORY,
} from './constants.ts';
import type { DatabaseOptions, DatabaseOptionsInput } from './types.ts';

/**
 * The data source options of an app's database, without I/O: PostgreSQL
 * on `url` (never synchronized, migrations from `migrations` into
 * `migrationsTableName`, the session and the driver pinned to UTC), else
 * SQLite in memory through better-sqlite3 (no migrations; the caller
 * synchronizes the schema). Logging is off on both. Loads `pg` on
 * PostgreSQL (the UTC pin builds on its types), nothing on SQLite.
 * Throws `DatabaseOptionsError` (naming the option, never the URL) for a
 * URL that is not PostgreSQL, a migrations table that is no plain
 * identifier, is `migrations` or starts with `chamvi_` or
 * `typeorm_metadata`, no URL in `migrate` mode, and no URL in
 * production.
 */
function assertInput(input: DatabaseOptionsInput): void {
    const table = input.migrationsTableName;

    if (typeof table !== 'string' || !DATABASE_MIGRATIONS_TABLE_PATTERN.test(table)) {
        throw new DatabaseOptionsError(
            'migrationsTableName must be a plain identifier: lower-case letters, digits and underscores, ' +
            'starting with a letter or an underscore, at most 63 characters, no schema and no quotes.',
        );
    }

    if (table === CHAMVI_MIGRATIONS_TABLE) {
        throw new DatabaseOptionsError(`migrationsTableName cannot be "${CHAMVI_MIGRATIONS_TABLE}": chamvi's own store records its migrations there.`);
    }

    const reserved = RESERVED_TABLE_PREFIXES.find((prefix) => table.startsWith(prefix));

    if (reserved) {
        throw new DatabaseOptionsError(`migrationsTableName cannot start with "${reserved}": chamvi's own store and TypeORM name their tables so.`);
    }

    if (typeof input.url === 'string') {
        // the URL itself is never part of the message: it holds the password
        const protocol = URL.canParse(input.url) ? new URL(input.url).protocol : undefined;

        if (protocol === undefined || !POSTGRES_PROTOCOLS.includes(protocol)) {
            throw new DatabaseOptionsError(`DATABASE_URL must be an absolute URL with one of the protocols ${POSTGRES_PROTOCOLS.join(', ')}.`);
        }

        return;
    }

    if (input.mode === 'migrate') {
        throw new DatabaseOptionsError('DATABASE_URL is required to migrate an app database.');
    }

    if (input.production) {
        throw new DatabaseOptionsError('An app database needs DATABASE_URL when NODE_ENV is production: SQLite in memory loses its rows on a restart.');
    }
}

export function buildDatabaseOptions(input: DatabaseOptionsInput): DatabaseOptions {
    assertInput(input);

    if (typeof input.url === 'string') {
        const options: DataSourceOptions = {
            type: 'postgres',
            url: input.url,
            entities: input.entities,
            migrations: input.migrations,
            migrationsTableName: input.migrationsTableName,
            migrationsRun: false,
            synchronize: false,
            logging: false,
            connectTimeoutMS: input.connectTimeoutMs,
        };

        return { kind: 'postgres', options: pinTimezone(options, 'UTC') };
    }

    return {
        kind: 'sqlite',
        options: {
            type: SQLITE_DRIVER,
            database: SQLITE_MEMORY,
            entities: input.entities,
            migrations: [],
            migrationsTableName: input.migrationsTableName,
            migrationsRun: false,
            synchronize: false,
            logging: false,
        },
    };
}
