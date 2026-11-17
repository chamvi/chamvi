/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** TypeORM's lock mode per `EntityLockMode`. */
export const ENTITY_LOCK_MODES = {
    update: 'pessimistic_write',
    'no-key-update': 'for_no_key_update',
    share: 'pessimistic_read',
} as const;

/**
 * Drivers with one shared connection: every use of such a data source
 * runs through one in-process queue, one transaction at a time.
 */
export const SERIALIZED_DRIVERS: readonly string[] = ['better-sqlite3'];

/**
 * The bind parameters one statement may carry, per driver
 * (better-sqlite3's `SQLITE_MAX_VARIABLE_NUMBER`); others take
 * DEFAULT_BIND_PARAMETER_LIMIT (PostgreSQL's 65535).
 */
export const BIND_PARAMETER_LIMITS: Readonly<Record<string, number>> = { 'better-sqlite3': 32_766 };

export const DEFAULT_BIND_PARAMETER_LIMIT = 65_535;

/** Driver codes of a unique or primary key violation. */
export const CONFLICT_CODES: readonly string[] = ['23505', 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'];

/**
 * Driver codes of a value the table refuses: a NOT NULL or CHECK
 * violation, an integrity violation without a more specific class
 * (PostgreSQL 23000), and on SQLite a datatype mismatch or a value too
 * big. PostgreSQL's data exceptions (class 22: too long, out of range,
 * an invalid text representation) are matched by INVALID_CODE_CLASSES.
 */
export const INVALID_CODES: readonly string[] = [
    '23000',
    '23502',
    '23514',
    'SQLITE_CONSTRAINT_NOTNULL',
    'SQLITE_CONSTRAINT_CHECK',
    'SQLITE_CONSTRAINT_DATATYPE',
    'SQLITE_MISMATCH',
    'SQLITE_TOOBIG',
];

/** The PostgreSQL SQLSTATE classes (first two characters) of a refused value: 22, a data exception. */
export const INVALID_CODE_CLASSES: readonly string[] = ['22'];

/** Driver codes of a foreign key violation (PostgreSQL's 23001 a restrict violation). */
export const RELATION_CODES: readonly string[] = ['23001', '23503', 'SQLITE_CONSTRAINT_FOREIGNKEY'];

/** Driver codes of a transaction chosen as a deadlock victim. */
export const DEADLOCK_CODES: readonly string[] = ['40P01'];

/** The relation label of a foreign key failure no constraint name identifies. */
export const UNKNOWN_RELATION = 'relation';

/** How long work waits behind one holder of a serialized driver's connection before it is refused. */
export const QUEUE_WAIT_TIMEOUT_MS = 30_000;
