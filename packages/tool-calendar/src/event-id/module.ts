/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
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

/**
 * The parts of an event id (ValidationError `CALENDAR_EVENT_ID_MESSAGE` for
 * anything `encodeCalendarEventId` would not give back, an empty part, a name
 * with `/` or a name or ETag above 255 characters).
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
                partValid(name) &&
                partValid(etag) &&
                !name.includes('/') &&
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
