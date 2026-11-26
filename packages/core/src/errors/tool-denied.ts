/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * A tool call a gate refused, e.g. an agent's `beforeToolExecution` hook. The
 * message is the gate's to word and goes back to the model as a tool error;
 * it never fails the run.
 */
export class ToolDeniedError extends ChamviError {
    constructor(message: string) {
        super({ message, code: ErrorCode.TOOL_DENIED });
    }
}
