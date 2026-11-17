/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { DatabaseErrorCode } from './constants.ts';

/**
 * A database operation failed for a reason that is none of the storage
 * errors (a lost connection, a refused value, an ended transaction).
 * Carries the operation and the driver's error code only: never the
 * driver's error as `cause`, its message, the statement, its parameters
 * or the connection URL, since each can hold stored content or a secret.
 */
export class DatabaseUnavailableError extends BaseError {
    /** The repository operation that failed, e.g. `save`. */
    readonly operation: string;

    /** The driver's error code (a PostgreSQL SQLSTATE, a SQLite result code), if it had one. */
    readonly driverCode: string | undefined;

    /** What the operation worked on when it failed, by name (a migration class), never a value. */
    readonly subject: string | undefined;

    constructor(operation: string, driverCode?: string, subject?: string) {
        super({
            message: `The database could not complete the ${operation}${subject ? ` of ${subject}` : ''}${driverCode ? ` (${driverCode})` : ''}.`,
            code: DatabaseErrorCode.DATABASE_UNAVAILABLE,
        });

        this.operation = operation;
        this.driverCode = driverCode;
        this.subject = subject;
    }
}
