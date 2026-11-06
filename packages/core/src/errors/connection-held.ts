/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/** The lease of a connection is held by another process (or another session of this one). */
export class ConnectionHeldError extends ChamviError {
    readonly connection: string;

    constructor(connection: string) {
        super({
            message: `The connection "${connection}" is held elsewhere.`,
            code: ErrorCode.CONNECTION_HELD,
        });
        this.connection = connection;
    }
}
