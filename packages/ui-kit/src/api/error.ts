/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';

/** A non-2xx answer of the chamvi API (`{ status, code, message }`), or `http_<status>` for any other body. */
export class ApiError extends BaseError {
    readonly status: number;

    /** `Retry-After` in seconds, when the answer carried one. */
    readonly retryAfter: number | undefined;

    constructor(status: number, code: string, message: string, retryAfter?: number) {
        super({ message, code });
        this.status = status;
        this.retryAfter = retryAfter;
    }
}
