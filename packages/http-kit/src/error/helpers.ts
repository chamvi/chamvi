/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Issue } from '@ebec/core';
import { isObject } from 'smob';
import { RATE_LIMIT_BACKOFF_MS } from './constants.ts';
import { ApiError } from './module.ts';

function retryAfterOf(headers: Headers): number | undefined {
    if (!headers.has('retry-after')) {
        return undefined;
    }

    const value = Number(headers.get('retry-after'));

    return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** The ApiError of a non-2xx answer whose body is already decoded (`body`). */
export function toApiError(response: Response, body: unknown): ApiError {
    const retryAfter = retryAfterOf(response.headers);

    if (isObject(body) && typeof body.code === 'string') {
        return new ApiError(
            response.status,
            body.code,
            typeof body.message === 'string' ? body.message : response.statusText,
            retryAfter,
            Array.isArray(body.issues) ? body.issues as Issue[] : undefined,
        );
    }

    return new ApiError(response.status, `http_${response.status}`, response.statusText || `HTTP ${response.status}`, retryAfter);
}

/** The wait in ms a 429 or 503 asks for (`Retry-After`; a bare 429 a minute), else `undefined`. */
export function retryDelayOf(error: ApiError): number | undefined {
    if (error.retryAfter !== undefined && (error.status === 429 || error.status === 503)) {
        return error.retryAfter * 1000;
    }

    return error.status === 429 ? RATE_LIMIT_BACKOFF_MS : undefined;
}

/** `error` when it is an `ApiError`, else a `network_error` (status 0) carrying its message. */
export function asApiError(error: unknown): ApiError {
    if (error instanceof ApiError) {
        return error;
    }

    return new ApiError(0, 'network_error', Error.isError(error) ? error.message : String(error));
}
