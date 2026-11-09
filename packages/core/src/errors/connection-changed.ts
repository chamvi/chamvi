/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/** The stored connection changed underneath a write (e.g. its data key was replaced). */
export class ConnectionChangedError extends ChamviError {
    readonly connection: string;

    constructor(connection: string) {
        super({
            message: `The connection "${connection}" changed; load it again and retry.`,
            code: ErrorCode.CONNECTION_CHANGED,
        });
        this.connection = connection;
    }
}
