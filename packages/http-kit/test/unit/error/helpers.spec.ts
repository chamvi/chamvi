/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    ApiError,
    RATE_LIMIT_BACKOFF_MS,
    asApiError,
    retryDelayOf,
    toApiError,
} from '@chamvi/http-kit';

const response = (status: number, statusText = '', headers: Record<string, string> = {}) => new Response(null, {
    status, 
    statusText, 
    headers, 
});

describe('toApiError', () => {
    it('takes code, message and issues of a chamvi error body', () => {
        const issue = {
            type: 'item', 
            code: 'invalid', 
            message: 'bad', 
            path: ['name'], 
        };
        const error = toApiError(response(422), {
            code: 'validation',
            message: 'm',
            issues: [issue],
        });

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
            status: 422,
            code: 'validation',
            message: 'm',
            issues: [issue],
        });
    });

    it('falls back to http_<status> for any other body', () => {
        expect(toApiError(response(502, 'Bad Gateway'), '<html>')).toMatchObject({
            status: 502,
            code: 'http_502',
            message: 'Bad Gateway',
        });
        expect(toApiError(response(500), undefined)).toMatchObject({ code: 'http_500', message: 'HTTP 500' });
    });

    it('reads Retry-After in seconds', () => {
        expect(toApiError(response(429, '', { 'retry-after': '7' }), undefined).retryAfter).toBe(7);
        expect(toApiError(response(429, '', { 'retry-after': 'soon' }), undefined).retryAfter).toBeUndefined();
        expect(toApiError(response(429), undefined).retryAfter).toBeUndefined();
    });
});

describe('retryDelayOf', () => {
    it('waits Retry-After for a 429 or 503 and a whole window for a bare 429', () => {
        expect(retryDelayOf(new ApiError(503, 'x', 'x', 3))).toBe(3000);
        expect(retryDelayOf(new ApiError(429, 'x', 'x'))).toBe(RATE_LIMIT_BACKOFF_MS);
        expect(retryDelayOf(new ApiError(500, 'x', 'x', 3))).toBeUndefined();
    });
});

describe('asApiError', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('works where Error.isError is missing (the dashboard\'s browser target)', () => {
        vi.stubGlobal('Error', Object.assign(() => {}, { prototype: Error.prototype, isError: undefined }));

        expect(asApiError(new TypeError('Failed to fetch'))).toMatchObject({ code: 'network_error', message: 'Failed to fetch' });
    });

    it('keeps an ApiError and wraps anything else as network_error', () => {
        const error = new ApiError(404, 'x', 'x');

        expect(asApiError(error)).toBe(error);
        expect(asApiError(new TypeError('Failed to fetch'))).toMatchObject({
            status: 0,
            code: 'network_error',
            message: 'Failed to fetch',
        });
    });
});
