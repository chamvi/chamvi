/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { calendarError } from '../client/asserts.ts';
import { CALENDAR_WRITE_ALLOWED_METHODS } from './constants.ts';

/**
 * `inner` restricted to `CALENDAR_WRITE_ALLOWED_METHODS`. A PUT must carry
 * `If-None-Match: *` and no `If-Match` (create only, never update), a DELETE an
 * `If-Match` of one version (not `*`, no list); both take a string or URL (never a `Request`, which
 * carries its own headers and redirect mode) and are sent with
 * `redirect: 'manual'`. Each refusal is a `calendar_request` error before
 * anything is sent.
 */
export function writeGuardedFetch(inner: typeof fetch): typeof fetch {
    return async (input, init) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

        if (!CALENDAR_WRITE_ALLOWED_METHODS.includes(method)) {
            throw calendarError(`calendar: method ${method} is not allowed`);
        }

        if (method !== 'PUT' && method !== 'DELETE') {
            return inner(input, init);
        }

        if (input instanceof Request) {
            throw calendarError(`calendar: ${method} takes a URL, not a Request`);
        }

        const headers = new Headers(init?.headers);
        const ifMatch = headers.get('if-match');

        if (method === 'PUT' && (headers.get('if-none-match') !== '*' || ifMatch !== null)) {
            throw calendarError('calendar: PUT must carry If-None-Match: * and no If-Match');
        }

        // one concrete version: never the wildcard or a list, which would delete whatever is there
        if (method === 'DELETE' && (ifMatch === null || ifMatch.trim().length === 0 || ifMatch.trim() === '*' || ifMatch.includes(','))) {
            throw calendarError('calendar: DELETE must carry If-Match with one version');
        }

        return inner(input, {
            ...init, 
            method, 
            redirect: 'manual', 
        });
    };
}
