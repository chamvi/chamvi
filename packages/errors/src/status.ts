/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode } from './constants.ts';

/**
 * Default mapping from `ErrorCode` to HTTP status. Adapters apply this and
 * may layer their own overrides on top. Codes not listed here fall back to
 * 400 (Bad Request).
 */
export const ERROR_CODE_TO_STATUS: Readonly<Partial<Record<ErrorCode, number>>> = {
    // 400
    [ErrorCode.VALIDATION]: 400,
    [ErrorCode.BAD_REQUEST]: 400,

    // 401
    [ErrorCode.UNAUTHORIZED]: 401,

    // 403
    [ErrorCode.FORBIDDEN]: 403,

    // 404
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.AGENT_NOT_FOUND]: 404,
    [ErrorCode.RUN_NOT_FOUND]: 404,
    [ErrorCode.ARTIFACT_NOT_FOUND]: 404,
    [ErrorCode.REPOSITORY_NOT_FOUND]: 404,

    // 409
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.AGENT_REPLACED]: 409,
    [ErrorCode.CONNECTION_CHANGED]: 409,
    [ErrorCode.CONNECTION_HELD]: 409,
    // a stored seal no key of the keyring opens (one dropped)
    [ErrorCode.DECRYPTION_FAILED]: 409,
    [ErrorCode.INVALID_RUN_STATE]: 409,

    // 413
    [ErrorCode.REQUEST_ENTITY_TOO_LARGE]: 413,

    // 415
    [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,

    // 429
    [ErrorCode.TOO_MANY_REQUESTS]: 429,

    // 500
    [ErrorCode.INTERNAL_ERROR]: 500,

    // 503
    [ErrorCode.SERVICE_UNAVAILABLE]: 503,
    // retryable: an http adapter answers it with `Retry-After`
    [ErrorCode.PEER_START_BUSY]: 503,
};

/**
 * Resolve an HTTP status for a given error code. Unknown codes fall back
 * to `fallback` (default 400).
 */
export function httpStatusFromCode(code: string, fallback = 400): number {
    return ERROR_CODE_TO_STATUS[code as ErrorCode] ?? fallback;
}
