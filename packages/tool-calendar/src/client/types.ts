/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CalendarEvent } from '../expand/types.ts';

export type CalendarAccount = {
    /** Names the account in calendar ids and errors (`^[a-z0-9]+(-[a-z0-9]+)*$`). */
    id: string;
    /** The CalDAV server, e.g. `https://caldav.icloud.com`. */
    url: string;
    user: string;
    /** For iCloud an app-specific password. */
    password: string;
};

export type CalendarView = {
    /** `<account>:<last path segment of the calendar URL>`. */
    calendar: string;
    account: string;
    name: string;
    color?: string;
    /** The calendar's own zone (TZID of its `calendar-timezone`). */
    timezone?: string;
};

export type CalendarEventsInput = {
    /** An ISO date or date-time; a date is midnight in the client's zone. */
    from: string;
    /** As `from`; after it and at most `CALENDAR_RANGE_MAX_DAYS` days later. */
    to: string;
    /** A calendar id from `calendars()`; default all. */
    calendar?: string;
    /** Default `CALENDAR_EVENTS_DEFAULT_LIMIT`, at most `CALENDAR_EVENTS_MAX_LIMIT`. */
    limit?: number;
    signal?: AbortSignal;
};

export type CalendarEventsResult = {
    /** Sorted by start. */
    events: CalendarEvent[];
    /** More events matched than `limit`. */
    truncated: boolean;
};

/** Read-only access to the calendars of some CalDAV accounts. */
export interface ICalendarClient {
    calendars(options?: { signal?: AbortSignal }): Promise<CalendarView[]>;
    events(input: CalendarEventsInput): Promise<CalendarEventsResult>;
    /** Forgets every session; the next call logs in again. */
    close(): Promise<void>;
}
