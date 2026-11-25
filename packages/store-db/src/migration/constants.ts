/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationOperation } from './types.ts';

export const MIGRATION_OPERATIONS: readonly MigrationOperation[] = ['generate', 'run', 'revert', 'status', 'drift'];

/** The `--database` that selects chamvi's own store; no app database may be named so. */
export const STORE_DATABASE = 'store';

/**
 * The prefix of the advisory lock an app's database module migrates
 * under (`chamvi:db:<name>`, `@chamvi/app`'s `DATABASE_PREFIX`; a spec
 * pins both), for a descriptor that does not name its lock.
 */
export const DATABASE_LOCK_PREFIX = 'chamvi:db:';

/** The variable naming the throwaway database `generate` builds the schema in (development only). */
export const MIGRATION_DATABASE_URL_VARIABLE = 'MIGRATION_DATABASE_URL';

/** A generated migration's class name, before its timestamp. */
export const MIGRATION_CLASS_NAME_PATTERN = /^[A-Z][A-Za-z0-9]{0,99}$/;

/**
 * The database name of `MIGRATION_DATABASE_URL`: a plain name with
 * no percent-encoding, so TypeORM (which drops and creates it by the raw
 * spelling) and the driver (which connects to the decoded one) name the
 * same database.
 */
export const SCRATCH_DATABASE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$/;

/** The query parameters `MIGRATION_DATABASE_URL` may carry; any other is refused. */
export const SCRATCH_ALLOWED_PARAMETERS: readonly string[] = ['sslmode', 'application_name'];

/** The scratch URL's `sslmode` values and the driver's `ssl` option each becomes (`disable`: none). */
export const SCRATCH_SSL_MODES: Readonly<Record<string, boolean | { rejectUnauthorized: false } | undefined>> = {
    disable: undefined,
    require: { rejectUnauthorized: false },
    'verify-ca': true,
    'verify-full': true,
};

/**
 * The comment `generate` puts on the scratch database right after
 * creating it; an existing database without it is never dropped.
 */
export const SCRATCH_MARKER = 'chamvi:migration-scratch';

/** The database `generate` connects to while it drops and creates the scratch database. */
export const MAINTENANCE_DATABASE = 'postgres';

/** PostgreSQL's code for a database that does not exist (`invalid_catalog_name`). */
export const MISSING_DATABASE_CODE = '3D000';

/** How long PostgreSQL may take to accept the first connection: the store's own limit. */
export const MIGRATION_CONNECT_TIMEOUT_MS = 10_000;
