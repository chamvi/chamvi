/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode, httpStatusOf, isChamviError } from '@chamvi/errors';
import type { Issue } from '@ebec/core';
import { isHTTPError } from '@ebec/http';
import type { IHTTPError } from '@ebec/http';
import { AppError, defineErrorHandler } from 'routup';
import type { Handler, IAppEvent } from 'routup';
import { isValidupError } from 'validup';
import { RETRY_AFTER_SECONDS, STORAGE_ERRORS } from '../constants.ts';
import { boundIssues } from '../../request/helpers/index.ts';
import type { HttpContext } from '../types.ts';

type ErrorBody = {
    status: number;
    code: string;
    message: string;
    issues?: readonly Issue[];
    /** The message is fixed and safe to send, also for a 5xx. */
    fixed?: boolean;
};

const APP_ERROR_CODE = 'APP_ERROR';

/** A refusal the caller retries after `Retry-After` (a busy peer start): never reported. */
export function isRetryableErrorCode(code: string): boolean {
    return Object.hasOwn(RETRY_AFTER_SECONDS, code);
}

export function renderError(event: IAppEvent, body: ErrorBody): Response {
    const headers = new Headers(event.response.headers);

    headers.set('content-type', 'application/json; charset=utf-8');

    if (body.status === 401) {
        headers.set('www-authenticate', 'Bearer');
    }

    const wire: Omit<ErrorBody, 'fixed'> = {
        status: body.status,
        code: body.code,
        message: body.message,
        ...(body.issues !== undefined ? { issues: body.issues } : {}),
    };

    return new Response(JSON.stringify(wire), { status: body.status, headers });
}

/**
 * A 503 once the shutdown ran the closers (streams ended, MCP handler
 * closed), else `undefined`. Rendered here, not thrown: an expected
 * refusal is not reported to `onError`.
 */
export function refuseWhenClosed(event: IAppEvent, ctx: HttpContext): Response | undefined {
    if (!ctx.closed) {
        return undefined;
    }

    return renderError(event, {
        status: 503,
        code: 'service_unavailable',
        message: 'The server is shutting down.',
    });
}

/** A large `received` value is dropped (`boundIssues`), whatever produced the issue. */
function withIssues(body: ErrorBody, issues: readonly Issue[] | undefined): ErrorBody {
    return issues && issues.length > 0 ? { ...body, issues: boundIssues(issues) } : body;
}

/** routup wraps what a handler throws in an AppError carrying it as `cause`. */
function unwrapAppError(error: unknown): unknown {
    if (error instanceof AppError && error.cause !== undefined) {
        return error.cause;
    }

    return error;
}

function isBareAppError(error: IHTTPError): boolean {
    return error instanceof AppError && error.code === APP_ERROR_CODE;
}

/**
 * A storage error by its code, with its fixed message: never the error's
 * own message or fields (an entity label, an operation, a driver code),
 * and never its issues.
 */
function toStorageErrorBody(cause: unknown): ErrorBody | undefined {
    if (!Error.isError(cause)) {
        return undefined;
    }

    const { code } = cause as { code?: unknown };

    if (typeof code !== 'string' || !Object.hasOwn(STORAGE_ERRORS, code)) {
        return undefined;
    }

    const { status, message } = STORAGE_ERRORS[code]!;

    return {
        status,
        code,
        message,
        fixed: true,
    };
}

function toErrorBody(cause: unknown): ErrorBody | undefined {
    const storage = toStorageErrorBody(cause);

    if (storage) {
        return storage;
    }

    if (isChamviError(cause)) {
        const status = httpStatusOf(cause);

        if (status === undefined) {
            return undefined;
        }

        return withIssues({
            status,
            code: cause.code,
            message: cause.message,
        }, cause.issues);
    }

    if (isHTTPError(cause) && !isBareAppError(cause)) {
        return withIssues({
            status: cause.status,
            code: cause.code.toLowerCase(),
            message: cause.message,
        }, cause.issues);
    }

    if (isValidupError(cause)) {
        return withIssues({
            status: 400,
            code: ErrorCode.VALIDATION,
            message: cause.message,
        }, cause.issues);
    }

    return undefined;
}

/**
 * Renders every error as `{ status, code, message, issues? }`; never sends a cause.
 * Keeps the headers plugins already set (CORS, `RateLimit-*`, `Retry-After`).
 */
export function createErrorHandler(ctx: HttpContext): Handler {
    return defineErrorHandler((error, event) => {
        const cause = unwrapAppError(error);
        let body = toErrorBody(cause);
        const retryAfter = body && isRetryableErrorCode(body.code) ? RETRY_AFTER_SECONDS[body.code] : undefined;

        // an expected refusal the caller retries: not reported
        if (body && retryAfter !== undefined) {
            event.response.headers.set('retry-after', String(retryAfter));

            return renderError(event, body);
        }

        if (!body || body.status >= 500) {
            ctx.onError(cause);
            body = {
                status: body?.status ?? 500,
                code: body?.code ?? 'internal_error',
                message: body?.fixed ? body.message : 'Internal Server Error',
            };
        }

        return renderError(event, body);
    });
}
