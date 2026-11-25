/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The only HTTP methods the calendar write client sends: PROPFIND and GET
 * (login, discovery, a resource's current version), PUT with `If-None-Match: *`
 * (create, never update) and DELETE with `If-Match`.
 */
export const CALENDAR_WRITE_ALLOWED_METHODS: readonly string[] = ['PROPFIND', 'GET', 'PUT', 'DELETE'];

/** The largest event resource the write tools read (a delete's backup), in bytes. */
export const CALENDAR_EVENT_MAX_BYTES = 1_048_576;

/** A bare e-mail address, as an organizer or attendee. */
export const CALENDAR_ADDRESS_PATTERN = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;

/** The refusal of a calendar id that names no listed VEVENT calendar. */
export const CALENDAR_UNKNOWN_MESSAGE = 'calendar is unknown: take one from calendar_list.';

/** The PRODID of every created event. */
export const CALENDAR_PRODID = '-//chamvi//tool-calendar//EN';

/** The refusal of a delete whose event changed since `calendar_events` read it (another ETag). */
export const CALENDAR_CHANGED_MESSAGE = 'calendar_delete: the event changed since calendar_events read it: read it again and use its new id; ' +
    'nothing was deleted.';

/** The refusal of a delete whose resource is no iCalendar or holds no VEVENT. */
export const CALENDAR_NO_EVENT_MESSAGE = 'calendar_delete: the resource holds no event; nothing was deleted.';
