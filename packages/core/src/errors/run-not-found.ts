/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

export class RunNotFoundError extends ChamviError {
    constructor(runId: string) {
        super({ message: `Run "${runId}" was not found.`, code: ErrorCode.RUN_NOT_FOUND });
    }
}
