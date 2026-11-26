/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * A tool call the agent's toolPolicy refuses for the run. It is recorded as
 * the tool step's error on both paths: a model's call to a tool it was never
 * offered (the model itself sees the AI SDK's unavailable-tool error), and an
 * approved call from an older history that the engine's per-call re-check
 * refuses (the model sees this error). It never fails the run.
 */
export class ToolNotAllowedError extends ChamviError {
    constructor(toolName: string) {
        super({ message: `The tool "${toolName}" is not allowed for this run.`, code: ErrorCode.TOOL_NOT_ALLOWED });
    }
}
