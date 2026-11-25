/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type CalendarEventAttendees = {
    count: number;
    /** The PARTSTAT of the attendee whose address is the account user. */
    self?: string;
};

export type CalendarEvent = {
    /** Pass to calendar_delete: the event's resource and version; every occurrence of a series carries the series' id. */
    id?: string;
    /** `<account>:<calendar>`, as `calendar_list` gives it. */
    calendar: string;
    uid: string;
    /** The occurrence of a recurring event (its original start). */
    recurrenceId?: string;
    /** At most `CALENDAR_FIELD_MAX_CHARS` characters, as `location` and `organizer`. */
    title: string;
    /** ISO with offset in the zone; a plain date for an all-day event. */
    start: string;
    /** Exclusive; a plain date for an all-day event. */
    end: string;
    allDay: boolean;
    location?: string;
    /** At most `CALENDAR_DESCRIPTION_MAX_CHARS` characters. */
    description?: string;
    /** STATUS, e.g. `CANCELLED`. */
    status?: string;
    organizer?: string;
    attendees?: CalendarEventAttendees;
};

export type CalendarRange = {
    from: Temporal.Instant;
    to: Temporal.Instant;
};

export type ExpandContext = {
    /** The `calendar` of every event (default `''`). */
    calendar?: string;
    /** The account user, to find its own attendee status. */
    user?: string;
    /** The `id` of every event (the resource's event id); none without it. */
    id?: string;
};
