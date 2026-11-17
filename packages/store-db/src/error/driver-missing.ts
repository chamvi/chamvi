/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { DatabaseErrorCode } from './constants.ts';

/** The driver package a database needs is not installed (`database_driver_missing`); names the package only. */
export class DatabaseDriverMissingError extends BaseError {
    /** The npm package to install, e.g. `better-sqlite3`. */
    readonly packageName: string;

    constructor(packageName: string) {
        super({
            message: `The database needs the package "${packageName}", which is not installed: npm install ${packageName}`,
            code: DatabaseErrorCode.DATABASE_DRIVER_MISSING,
        });

        this.packageName = packageName;
    }
}
