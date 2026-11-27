/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * A sandbox workspace or its provider failed: create, start or checkout,
 * a missing or oversized file, an unknown, expired or disposed workspace,
 * a provider API error, an aborted exec. A tool error the model sees, never
 * a failed run.
 */
export class SandboxError extends ChamviError {
    constructor(message: string, options: { cause?: unknown } = {}) {
        super({
            message,
            code: ErrorCode.SANDBOX,
            cause: options.cause,
        });
    }
}
