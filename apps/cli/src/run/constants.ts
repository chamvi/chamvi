/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { APP_ERROR_CODE, ErrorCode } from '@chamvi/app';

/** The exit codes of every command (C3). */
export const EXIT_CODE = {
    OK: 0,
    FAILURE: 1,
    USAGE: 2,
} as const;

/** The code of the ChamviError for a usage or entry error (exit 2). */
export const CLI_USAGE_ERROR_CODE = 'cli_usage';

/** citty's error class name (the class itself is not exported). */
export const CITTY_ERROR_NAME = 'CLIError';

/** The codes exiting 2 besides citty's own errors. */
export const USAGE_ERROR_CODES: readonly string[] = [CLI_USAGE_ERROR_CODE, ErrorCode.INVALID_AGENT_DEFINITION];

/** The app's stop error: the signal handler decides the exit code. */
export const APP_STOPPED_ERROR_CODE: string = APP_ERROR_CODE.STOPPED;
