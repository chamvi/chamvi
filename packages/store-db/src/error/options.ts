/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { DatabaseErrorCode } from './constants.ts';

/**
 * An app database's options or entities are not usable
 * (`database_options_invalid`): a configuration error. The message names
 * the option, an entity or a property, never a URL, a password or a
 * stored value.
 */
export class DatabaseOptionsError extends BaseError {
    constructor(message: string) {
        super({
            message,
            code: DatabaseErrorCode.DATABASE_OPTIONS_INVALID,
        });
    }
}
