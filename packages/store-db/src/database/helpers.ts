/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { DataSource } from 'typeorm';
import { readDatabaseErrorCode } from 'typeorm-extension';
import { serialize } from '../entity/helpers/index.ts';
import { SERIALIZED_DRIVERS } from '../entity/constants.ts';
import { DatabaseUnavailableError } from '../error/unavailable.ts';
import { maskDatabaseUrl } from '../error/helpers.ts';
import { DatabaseOptionsError } from '../error/options.ts';
import type { SerializeOptions } from '../entity/types.ts';
import { CONFIGURATION_ERRORS, CONFIGURATION_MESSAGE_MAX_LENGTH } from './constants.ts';

/** The error a failed `operation` reports: its name, the driver's code and what it worked on by name, never the driver's message. */
export function toUnavailable(operation: string, error: unknown, subject?: string): DatabaseUnavailableError {
    if (error instanceof DatabaseUnavailableError) {
        return error;
    }

    return new DatabaseUnavailableError(operation, readDatabaseErrorCode(error), subject);
}

/**
 * A TypeORM entity or metadata mistake found while connecting, as a
 * configuration error with TypeORM's message (entity, property and
 * column names only; masked as a URL would be, all the same), else
 * undefined: anything with a driver code or a driver error stays an
 * outage whose message is never passed on.
 */
export function toConfigurationError(error: unknown): DatabaseOptionsError | undefined {
    if (!isObject(error) || typeof error.name !== 'string' || typeof error.message !== 'string') {
        return undefined;
    }

    if ('driverError' in error || readDatabaseErrorCode(error) !== undefined || !CONFIGURATION_ERRORS.includes(error.name)) {
        return undefined;
    }

    return new DatabaseOptionsError(maskDatabaseUrl(error.message).slice(0, CONFIGURATION_MESSAGE_MAX_LENGTH));
}

/** Runs `work` in the data source's queue on a driver with one shared connection (better-sqlite3), else at once. */
export function queued<R>(dataSource: DataSource, work: () => Promise<R>, options?: SerializeOptions): Promise<R> {
    return SERIALIZED_DRIVERS.includes(dataSource.options.type) ? serialize(dataSource, work, options) : work();
}

/**
 * Refuses a lock name nobody could take (empty, not a string):
 * `withDatabaseLock` would wait for it without an end.
 */
export function assertLockName(lockName: unknown): asserts lockName is string {
    if (typeof lockName !== 'string' || lockName.length === 0) {
        throw new DatabaseOptionsError('The migrations need the name of the advisory lock they run under.');
    }
}
