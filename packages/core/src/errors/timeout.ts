/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/** The abort reason when a run exceeds its `timeoutMs` budget. */
export class TimeoutError extends ChamviError {
    /** `message` names what timed out; default: the run's own timeout. */
    constructor(ms: number, message = `The run exceeded its ${ms}ms timeout.`) {
        super({ message, code: ErrorCode.TIMEOUT });
    }
}
