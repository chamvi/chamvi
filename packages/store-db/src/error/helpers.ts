/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';

// up to the last `@` of the URL: a password written raw may hold `/`, `#`, `?` or `@`
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)\S*@/gi;

// a password given as a query parameter (`?password=` or `&password=`), up to the next parameter
const QUERY_PASSWORD = /([?&]password=)[^&\s#]*/gi;

/**
 * The text with the credentials of every URL in it (`user:password@`)
 * replaced by `***@`, for a log line that names a connection. A URL's
 * user info ends at its last `@`, so a password written raw with `/`,
 * `#`, `?` or `@` is masked as a whole. A `password` query parameter's
 * value becomes `***` too.
 */
export function maskDatabaseUrl(text: string): string {
    return text.replaceAll(URL_CREDENTIALS, '$1***@').replaceAll(QUERY_PASSWORD, '$1***');
}

/**
 * The name of the constraint a PostgreSQL error names, if any.
 */
export function errorConstraint(error: unknown): string | undefined {
    if (!isObject(error)) {
        return undefined;
    }

    const source = isObject(error.driverError) ? error.driverError : error;

    return typeof source.constraint === 'string' ? source.constraint : undefined;
}

// better-sqlite3 names the column (`table.column`) or the check in its message: an identifier only, nothing else is taken
const SQLITE_FIELD = /^(?:NOT NULL|CHECK) constraint failed: (?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)$/;

/**
 * The column or constraint a refused value names: PostgreSQL's `column`
 * (a NOT NULL violation) or `constraint` (a CHECK violation), else the
 * identifier at the end of better-sqlite3's NOT NULL or CHECK message
 * (the column without its table). Never any other text of the error:
 * an unnamed CHECK's expression or a message that matches no rule gives
 * `undefined`.
 */
export function errorField(error: unknown): string | undefined {
    if (!isObject(error)) {
        return undefined;
    }

    const source = isObject(error.driverError) ? error.driverError : error;

    if (typeof source.column === 'string' && source.column.length > 0) {
        return source.column;
    }

    if (typeof source.constraint === 'string' && source.constraint.length > 0) {
        return source.constraint;
    }

    if (typeof source.code === 'string' && source.code.startsWith('SQLITE_') && typeof source.message === 'string') {
        return SQLITE_FIELD.exec(source.message)?.[1];
    }

    return undefined;
}
