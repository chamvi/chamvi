/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { matchesInstanceof } from '@ebec/core';
import { isChamviError } from '../check.ts';
import { ErrorCode } from '../constants.ts';
import { BAD_REQUEST_ERROR_INSTANCE, type BadRequestError } from './bad-request.ts';
import { CONFLICT_ERROR_INSTANCE, type ConflictError } from './conflict.ts';
import { FORBIDDEN_ERROR_INSTANCE, type ForbiddenError } from './forbidden.ts';
import { INTERNAL_ERROR_INSTANCE, type InternalError } from './internal.ts';
import { NOT_FOUND_ERROR_INSTANCE, type NotFoundError } from './not-found.ts';
import { REQUEST_ENTITY_TOO_LARGE_ERROR_INSTANCE, type RequestEntityTooLargeError } from './request-entity-too-large.ts';
import { SERVICE_UNAVAILABLE_ERROR_INSTANCE, type ServiceUnavailableError } from './service-unavailable.ts';
import { TOO_MANY_REQUESTS_ERROR_INSTANCE, type TooManyRequestsError } from './too-many-requests.ts';
import { UNAUTHORIZED_ERROR_INSTANCE, type UnauthorizedError } from './unauthorized.ts';
import { UNSUPPORTED_MEDIA_TYPE_ERROR_INSTANCE, type UnsupportedMediaTypeError } from './unsupported-media-type.ts';
import { VALIDATION_ERROR_INSTANCE, type ValidationError } from './validation.ts';

export function isBadRequestError(input: unknown): input is BadRequestError {
    if (matchesInstanceof(input, BAD_REQUEST_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.BAD_REQUEST;
}

export function isConflictError(input: unknown): input is ConflictError {
    if (matchesInstanceof(input, CONFLICT_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.CONFLICT;
}

export function isForbiddenError(input: unknown): input is ForbiddenError {
    if (matchesInstanceof(input, FORBIDDEN_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.FORBIDDEN;
}

export function isInternalError(input: unknown): input is InternalError {
    if (matchesInstanceof(input, INTERNAL_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.INTERNAL_ERROR;
}

export function isNotFoundError(input: unknown): input is NotFoundError {
    if (matchesInstanceof(input, NOT_FOUND_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.NOT_FOUND;
}

export function isRequestEntityTooLargeError(input: unknown): input is RequestEntityTooLargeError {
    if (matchesInstanceof(input, REQUEST_ENTITY_TOO_LARGE_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.REQUEST_ENTITY_TOO_LARGE;
}

export function isServiceUnavailableError(input: unknown): input is ServiceUnavailableError {
    if (matchesInstanceof(input, SERVICE_UNAVAILABLE_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.SERVICE_UNAVAILABLE;
}

export function isTooManyRequestsError(input: unknown): input is TooManyRequestsError {
    if (matchesInstanceof(input, TOO_MANY_REQUESTS_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.TOO_MANY_REQUESTS;
}

export function isUnauthorizedError(input: unknown): input is UnauthorizedError {
    if (matchesInstanceof(input, UNAUTHORIZED_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.UNAUTHORIZED;
}

export function isUnsupportedMediaTypeError(input: unknown): input is UnsupportedMediaTypeError {
    if (matchesInstanceof(input, UNSUPPORTED_MEDIA_TYPE_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.UNSUPPORTED_MEDIA_TYPE;
}

export function isValidationError(input: unknown): input is ValidationError {
    if (matchesInstanceof(input, VALIDATION_ERROR_INSTANCE)) {
        return true;
    }

    if (!isChamviError(input)) {
        return false;
    }

    return input.code === ErrorCode.VALIDATION;
}
