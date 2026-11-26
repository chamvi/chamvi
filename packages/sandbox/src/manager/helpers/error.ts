/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/errors';
import { SandboxError } from '@chamvi/core';

/** chamvi errors pass through; anything else becomes a SandboxError `<what>: <message>` with the cause. */
export function toSandboxError(error: unknown, what: string): ChamviError {
    if (error instanceof ChamviError) {
        return error;
    }

    const message = Error.isError(error) ? error.message : String(error);

    return new SandboxError(`${what}: ${message}`, { cause: error });
}
