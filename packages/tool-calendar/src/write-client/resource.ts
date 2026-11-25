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
import { isSafeResourceName } from '../event-id/module.ts';
import { basicAuthorizationOf } from './asserts.ts';
import { CALENDAR_EVENT_MAX_BYTES } from './constants.ts';
import type { CalendarResourceRequest, CalendarWriteView } from './types.ts';

/** A base no request goes to: `assertResourceName` resolves names against it before any lookup. */
const PROBE_BASE = 'https://calendar.invalid/calendar/';

/**
 * `name` as a resource name a write may use (ValidationError
 * `CALENDAR_EVENT_ID_MESSAGE`, before any request): `isSafeResourceName`
 * (no encoded slash, backslash or dot either) and nothing the URL parser
 * would rewrite.
 */
export function assertResourceName(name: string): void {
    if (!isSafeResourceName(name) || new URL(`./${name}`, PROBE_BASE).href !== `${PROBE_BASE}${name}`) {
        throw new ValidationError(CALENDAR_EVENT_ID_MESSAGE);
    }
}

/**
 * The URL of the resource `name` in the calendar `view`: a direct child of its
 * collection (same origin, same parent path), `name` as `assertResourceName`
 * accepts it. Anything else is a ValidationError, before any request.
 */
export function resourceUrlOf(view: Pick<CalendarWriteView, 'url'>, name: string): string {
    assertResourceName(name);

    const parent = new URL(view.url.endsWith('/') ? view.url : `${view.url}/`);
    const url = new URL(`./${name}`, parent);

    if (url.origin !== parent.origin || url.href !== `${parent.href}${name}`) {
        throw new ValidationError(CALENDAR_EVENT_ID_MESSAGE);
    }

    return url.href;
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

/**
 * The body of `response`, at most `CALENDAR_EVENT_MAX_BYTES` (by its
 * `content-length` and by the bytes read): above, `<tool>: <account>: too
 * large`, the rest unread.
 */
export async function readResourceBody(response: Response, tool: string, account: string): Promise<Uint8Array> {
    const length = Number(response.headers.get('content-length') ?? '0');

    if (length > CALENDAR_EVENT_MAX_BYTES || !response.body) {
        await response.body?.cancel();

        if (length > CALENDAR_EVENT_MAX_BYTES) {
            throw calendarError(`${tool}: ${account}: too large`);
        }

        return new Uint8Array();
    }

    const chunks: Uint8Array[] = [];
    let size = 0;

    for await (const chunk of response.body) {
        size += chunk.byteLength;

        if (size > CALENDAR_EVENT_MAX_BYTES) {
            throw calendarError(`${tool}: ${account}: too large`);
        }

        chunks.push(chunk);
    }

    const data = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return data;
}

/** Drops the body of an answer whose content is not used. */
export async function discardBody(response: Response): Promise<void> {
    try {
        await response.body?.cancel();
    } catch {
        // nothing to free
    }
}
