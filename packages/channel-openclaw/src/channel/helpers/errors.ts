/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { ERROR_TEXT_MAX_LENGTH, OPENCLAW_REQUEST_ERROR_CODE } from '../constants.ts';
import { cutText } from './message.ts';

/** Every occurrence of a non-empty secret replaced by `[redacted]`. */
export function redact(text: string, secrets: readonly (string | undefined)[]): string {
    let out = text;

    for (const secret of secrets) {
        if (secret) {
            out = out.split(secret).join('[redacted]');
        }
    }

    return out;
}

/** The message of a failed `fetch`, with its cause (undici keeps ECONNREFUSED, ENOTFOUND, TLS errors there), redacted. */
export function fetchErrorMessage(error: unknown, secrets: readonly (string | undefined)[]): string {
    let message = Error.isError(error) ? error.message : String(error);

    if (Error.isError(error) && Error.isError(error.cause) && error.cause.message) {
        message += ` (${error.cause.message})`;
    }

    return cutText(redact(message, secrets), ERROR_TEXT_MAX_LENGTH);
}

export function requestError(message: string): ChamviError {
    return new ChamviError({ message, code: OPENCLAW_REQUEST_ERROR_CODE });
}

/** `OpenClaw <status>: <text>`, redacted, then cut. */
export function responseError(
    status: number,
    text: string,
    retryAfter: string | null,
    secrets: readonly (string | undefined)[],
): ChamviError {
    const detail = cutText(redact(text.trim(), secrets), ERROR_TEXT_MAX_LENGTH) || 'no response body';
    const retry = retryAfter ? ` (retry after ${cutText(redact(retryAfter, secrets), 64)})` : '';

    return requestError(`OpenClaw ${status}: ${detail}${retry}`);
}
