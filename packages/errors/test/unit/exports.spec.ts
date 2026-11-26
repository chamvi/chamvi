/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as errors from '@chamvi/errors';

const EXPORTS = [
    'BAD_REQUEST_ERROR_INSTANCE',
    'BASE_ERROR_INSTANCE',
    'BadRequestError',
    'CHAMVI_ERROR_INSTANCE',
    'CONFLICT_ERROR_INSTANCE',
    'ChamviError',
    'ConflictError',
    'ERROR_CODE_TO_STATUS',
    'ErrorCode',
    'FORBIDDEN_ERROR_INSTANCE',
    'ForbiddenError',
    'INSTANCEOF_PROPERTY',
    'INTERNAL_ERROR_INSTANCE',
    'InternalError',
    'NOT_FOUND_ERROR_INSTANCE',
    'NotFoundError',
    'REQUEST_ENTITY_TOO_LARGE_ERROR_INSTANCE',
    'RequestEntityTooLargeError',
    'SERVICE_UNAVAILABLE_ERROR_INSTANCE',
    'ServiceUnavailableError',
    'TOO_MANY_REQUESTS_ERROR_INSTANCE',
    'TooManyRequestsError',
    'UNAUTHORIZED_ERROR_INSTANCE',
    'UNSUPPORTED_MEDIA_TYPE_ERROR_INSTANCE',
    'UnauthorizedError',
    'UnsupportedMediaTypeError',
    'VALIDATION_ERROR_INSTANCE',
    'ValidationError',
    'hasInstanceof',
    'httpStatusFromCode',
    'isBadRequestError',
    'isChamviError',
    'isConflictError',
    'isError',
    'isForbiddenError',
    'isInternalError',
    'isNotFoundError',
    'isRequestEntityTooLargeError',
    'isServiceUnavailableError',
    'isTooManyRequestsError',
    'isUnauthorizedError',
    'isUnsupportedMediaTypeError',
    'isValidationError',
    'markInstanceof',
    'matchesInstanceof',
    'normalizeError',
    'serializeError',
    'serializeInstanceofChain',
];

describe('public api', () => {
    it('exports exactly the documented names', () => {
        expect(Object.keys(errors).sort()).toEqual([...EXPORTS].sort());
    });

    it('has no reverse status lookup', () => {
        expect(errors).not.toHaveProperty('codeFromHttpStatus');
    });
});
