/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/** A connection was used before its required fields were set. */
export class ConnectionNotConfiguredError extends ChamviError {
    readonly connection: string;

    constructor(connection: string) {
        super({
            message: `The connection "${connection}" is not configured.`,
            code: ErrorCode.CONNECTION_NOT_CONFIGURED,
        });
        this.connection = connection;
    }
}
