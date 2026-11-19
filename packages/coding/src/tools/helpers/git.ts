/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SandboxError } from '@chamvi/core';
import type { ExecResult } from '@chamvi/sandbox';
import { GIT_ERROR_MAX_CHARS } from '../constants.ts';

/** git's stderr (else stdout), trimmed and cut. */
export function gitMessage(result: ExecResult): string {
    const text = (result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`);

    return text.length > GIT_ERROR_MAX_CHARS ? `${text.slice(0, GIT_ERROR_MAX_CHARS)}...` : text;
}

/** A SandboxError for a git command that failed in the workspace. */
export function gitFailure(what: string, result: ExecResult): SandboxError {
    if (result.timedOut) {
        return new SandboxError(`${what} timed out.`);
    }

    return new SandboxError(`${what} failed: ${gitMessage(result)}`);
}
