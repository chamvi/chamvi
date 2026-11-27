/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    isBadRequestError,
    isConflictError,
    isForbiddenError,
    isInternalError,
    isNotFoundError,
    isRequestEntityTooLargeError,
    isServiceUnavailableError,
    isTooManyRequestsError,
    isUnauthorizedError,
    isUnsupportedMediaTypeError,
} from './built-in/check.ts';
import { ErrorCode } from './constants.ts';
import type { ChamviError } from './module.ts';

/**
 * Default mapping from `ErrorCode` to HTTP status. Adapters apply this and
 * may layer their own overrides on top. The http handler uses `httpStatusOf`
 * and treats a code not listed here as internal (500).
 */
export const ERROR_CODE_TO_STATUS: Readonly<Partial<Record<ErrorCode, number>>> = {
    // 400
    [ErrorCode.VALIDATION]: 400,
    [ErrorCode.BAD_REQUEST]: 400,
    [ErrorCode.ENTITY_INVALID]: 400,
    [ErrorCode.ENTITY_QUERY_INVALID]: 400,
    [ErrorCode.ENTITY_RELATION_INVALID]: 400,

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
    [ErrorCode.ENTITY_NOT_FOUND]: 404,

    // 409
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.AGENT_REPLACED]: 409,
    [ErrorCode.CONNECTION_CHANGED]: 409,
    [ErrorCode.CONNECTION_HELD]: 409,
    // a stored seal no key of the keyring opens (one dropped); the message names at most a key id
    [ErrorCode.DECRYPTION_FAILED]: 409,
    [ErrorCode.INVALID_RUN_STATE]: 409,
    [ErrorCode.ENTITY_CONFLICT]: 409,
    // a lock cycle victim; nothing it wrote was kept, the caller retries
    [ErrorCode.ENTITY_DEADLOCK]: 409,

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
 * to `fallback` (default 400); the http handler does not use this, it uses `httpStatusOf`.
 */
export function httpStatusFromCode(code: string, fallback = 400): number {
    return ERROR_CODE_TO_STATUS[code as ErrorCode] ?? fallback;
}

/** The code each built-in class answers with when it carries a code of its own (an oidc 401 carries the vouchly code). */
const BUILT_IN_CODES: ReadonlyArray<readonly [(input: unknown) => boolean, ErrorCode]> = [
    [isBadRequestError, ErrorCode.BAD_REQUEST],
    [isUnauthorizedError, ErrorCode.UNAUTHORIZED],
    [isForbiddenError, ErrorCode.FORBIDDEN],
    [isNotFoundError, ErrorCode.NOT_FOUND],
    [isConflictError, ErrorCode.CONFLICT],
    [isRequestEntityTooLargeError, ErrorCode.REQUEST_ENTITY_TOO_LARGE],
    [isUnsupportedMediaTypeError, ErrorCode.UNSUPPORTED_MEDIA_TYPE],
    [isTooManyRequestsError, ErrorCode.TOO_MANY_REQUESTS],
    [isServiceUnavailableError, ErrorCode.SERVICE_UNAVAILABLE],
    [isInternalError, ErrorCode.INTERNAL_ERROR],
];

/**
 * The HTTP status of a chamvi error, `undefined` when neither its code nor
 * its class names one (an internal error).
 */
export function httpStatusOf(error: ChamviError): number | undefined {
    // the code wins over the class: a built-in whose code is in the table answers with that code's status
    const status = ERROR_CODE_TO_STATUS[error.code as ErrorCode];

    if (status !== undefined) {
        return status;
    }

    const builtIn = BUILT_IN_CODES.find(([guard]) => guard(error));

    return builtIn ? ERROR_CODE_TO_STATUS[builtIn[1]] : undefined;
}
