/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * Thrown from a tool's execute to fail the whole run. Any other tool error is
 * fed back to the model as a tool-error result.
 */
export class FatalToolError extends ChamviError {
    constructor(message: string, code: string = ErrorCode.FATAL_TOOL) {
        super({ message, code });
    }
}
