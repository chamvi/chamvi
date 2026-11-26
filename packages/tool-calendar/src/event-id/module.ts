/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { CALENDAR_EVENT_ID_MESSAGE, CALENDAR_EVENT_ID_PART_MAX_CHARS } from './constants.ts';
import type { CalendarEventRef } from './types.ts';

function encodePart(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64url');
}

/** `<account>:<slug>:<base64url(name)>:<base64url(etag)>`: the resource and version a read event came from. */
export function encodeCalendarEventId(ref: Pick<CalendarEventRef, 'calendar' | 'name' | 'etag'>): string {
    return `${ref.calendar}:${encodePart(ref.name)}:${encodePart(ref.etag)}`;
}

function partValid(text: string): boolean {
    return text.length > 0 && text.length <= CALENDAR_EVENT_ID_PART_MAX_CHARS;
}

// C0 and C1 control characters
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * Whether `name` is a resource name a write may use: 1 to 255 characters, not
 * `.`/`..`, without `/`, `\`, `?`, `#` or a control character, and no encoded
 * slash, backslash or dot (`%2F`, `%5C`, `%2E`, any case); decoded it must be
 * valid and hold none of these either, so a decoding server cannot map it
 * outside the calendar.
 */
export function isSafeResourceName(name: unknown): name is string {
    if (
        typeof name !== 'string' ||
        !partValid(name) ||
        /[/\\?#]/.test(name) ||
        CONTROL.test(name) ||
        /%(?:2f|5c|2e)/i.test(name)
    ) {
        return false;
    }

    let decoded: string;

    try {
        decoded = decodeURIComponent(name);
    } catch {
        return false;
    }

    return decoded !== '.' &&
        decoded !== '..' &&
        !decoded.startsWith('../') &&
        !/[/\\?#]/.test(decoded) &&
        !CONTROL.test(decoded);
}

/** Whether `etag` is a single, concrete version: not `*`, no list (`,`), no control character. */
export function isSafeEventEtag(etag: unknown): etag is string {
    return typeof etag === 'string' &&
        partValid(etag) &&
        etag.trim() !== '*' &&
        !etag.includes(',') &&
        !CONTROL.test(etag);
}

/**
 * The parts of an event id (ValidationError `CALENDAR_EVENT_ID_MESSAGE` for
 * anything `encodeCalendarEventId` would not give back, an empty part, a name
 * `isSafeResourceName` refuses or an ETag `isSafeEventEtag` refuses).
 */
export function parseCalendarEventId(id: unknown): CalendarEventRef {
    if (typeof id === 'string') {
        const parts = id.split(':');

        if (parts.length >= 4) {
            const etag = Buffer.from(parts.pop() ?? '', 'base64url').toString('utf8');
            const name = Buffer.from(parts.pop() ?? '', 'base64url').toString('utf8');
            const [account = '', ...rest] = parts;
            const slug = rest.join(':');
            const calendar = `${account}:${slug}`;

            if (
                account.length > 0 &&
                slug.length > 0 &&
                isSafeResourceName(name) &&
                isSafeEventEtag(etag) &&
                encodeCalendarEventId({
                    calendar,
                    name,
                    etag,
                }) === id
            ) {
                return {
                    account,
                    slug,
                    calendar,
                    name,
                    etag,
                };
            }
        }
    }

    throw new ValidationError(CALENDAR_EVENT_ID_MESSAGE);
}
