/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

export class InvalidRunStateError extends ChamviError {
    constructor(message: string) {
        super({ message, code: ErrorCode.INVALID_RUN_STATE });
    }
}
