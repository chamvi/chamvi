/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChamviError } from '@chamvi/core';
import { ValidationError } from '@chamvi/core';
import { calendarError } from '../client/asserts.ts';
import type { CalendarAccount } from '../client/types.ts';
import { CALENDAR_EVENT_ID_MESSAGE } from '../event-id/constants.ts';
import { basicAuthorizationOf } from './asserts.ts';
import { CALENDAR_RESOURCE_NAME_MAX_CHARS } from './constants.ts';
import type { CalendarResourceRequest, CalendarWriteView } from './types.ts';

/**
 * The URL of the resource `name` in the calendar `view`: a direct child of its
 * collection (same origin, same parent path). A name that is empty, above 255
 * characters, `.`/`..`, holds `/`, `?`, `#` or `\`, or that the URL parser
 * would rewrite is a ValidationError, before any request.
 */
export function resourceUrlOf(view: Pick<CalendarWriteView, 'url'>, name: string): string {
    const parent = new URL(view.url.endsWith('/') ? view.url : `${view.url}/`);

    if (
        name.length > 0 &&
        name.length <= CALENDAR_RESOURCE_NAME_MAX_CHARS &&
        name !== '.' &&
        name !== '..' &&
        !/[/?#\\]/.test(name)
    ) {
        const url = new URL(`./${name}`, parent);

        if (url.origin === parent.origin && url.href === `${parent.href}${name}`) {
            return url.href;
        }
    }

    throw new ValidationError(CALENDAR_EVENT_ID_MESSAGE);
}

/**
 * One request on an event resource through `fetch` (the write guard), with the
 * account's Basic credentials and `redirect: 'manual'`: a redirect is answered,
 * never followed.
 */
export function resourceRequest(fetch: typeof globalThis.fetch, account: CalendarAccount, request: CalendarResourceRequest): Promise<Response> {
    return fetch(request.url, {
        method: request.method,
        headers: { ...request.headers, Authorization: basicAuthorizationOf(account) },
        ...(request.body !== undefined && { body: request.body }),
        redirect: 'manual',
        signal: request.signal,
    });
}

/** The tool error of an unexpected answer: 401 and 403 `not permitted`, any other (a 3xx too) `request failed`. */
export function statusError(tool: string, account: string, status: number): ChamviError {
    return calendarError(`${tool}: ${account}: ${status === 401 || status === 403 ? 'not permitted' : 'request failed'}`);
}
