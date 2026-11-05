/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CALENDAR_ALLOWED_METHODS } from './constants.ts';
import { calendarError } from './asserts.ts';

/**
 * `inner` restricted to PROPFIND, REPORT and GET: any other method throws a
 * `calendar_request` error before a request is sent.
 */
export function guardedFetch(inner: typeof fetch): typeof fetch {
    return async (input, init) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

        if (!CALENDAR_ALLOWED_METHODS.includes(method)) {
            throw calendarError(`calendar: method ${method} is not allowed`);
        }

        return inner(input, init);
    };
}
