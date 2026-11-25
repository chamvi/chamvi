/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { DAVCalendar } from 'tsdav';

/** A calendar the write tools may write to, as a lookup gives it. */
export type CalendarWriteView = {
    /** `<account>:<last path segment of the calendar URL>`, as `calendar_list` gives it. */
    calendar: string;
    account: string;
    /** The display name, else the last path segment. */
    name: string;
    /** The calendar's collection URL; its events are its direct children. */
    url: string;
};

/** A listed calendar of a write session: its view and tsdav's record. */
export type CalendarWriteEntry = {
    view: CalendarWriteView;
    dav: DAVCalendar;
    /** Shared with the account by someone else (CalendarServer `shared`, or a `DAV:owner` other than its principal). */
    shared: boolean;
};

/** A time of an event: a plain date (all-day) or an instant. */
export type CalendarTime = { kind: 'date'; date: Temporal.PlainDate } | { kind: 'instant'; instant: Temporal.Instant };

/** One event to create: the tool checked every field. */
export type CalendarCreateRequest = {
    /** A calendar id of `calendar_list`. */
    calendar: string;
    /** `calendarResourceOf(key).uid`. */
    uid: string;
    /** `calendarResourceOf(key).name`: the resource the event is stored as. */
    name: string;
    title: string;
    start: CalendarTime;
    /** Exclusive; a date for an all-day event. */
    end: CalendarTime;
    location?: string;
    description?: string;
    /** The address invitations come from; required with attendees. */
    organizer?: string;
    /** Bare addresses, deduplicated. */
    attendees: string[];
};

export type CalendarCreateResult = {
    calendar: string;
    uid: string;
    /** The event id for `calendar_delete`; absent when the server gave no ETag. */
    event?: string;
    /** As `calendar_events` prints it: ISO with the zone's offset, or a plain date. */
    start: string;
    end: string;
    allDay: boolean;
    /** The number of attendees invited. */
    invited: number;
};

/** The event a delete would remove, as its checks and approval see it. */
export type CalendarDeleteItem = {
    /** The event id it was described by. */
    event: string;
    calendar: string;
    /** The calendar's display name. */
    calendarName: string;
    /** The resource name. */
    name: string;
    /** The resource's current ETag (the id's may differ: the tool compares). */
    etag: string;
    /** Cut at `CALENDAR_FIELD_MAX_CHARS`. */
    title: string;
    /** Of the master VEVENT, as `calendar_events` prints it. */
    start: string;
    end: string;
    allDay: boolean;
    /** The master VEVENT's attendee count. */
    attendees: number;
    /** An attendee or organizer is neither the account user nor one of its calendar user addresses. */
    others: boolean;
    /**
     * The addresses of those others (organizer first, then the attendees of every VEVENT), without `mailto:`,
     * deduplicated case-insensitively: who the server may notify of a delete.
     */
    notified: string[];
    /** The event's calendar is shared with the account by someone else. */
    shared: boolean;
    /** An RRULE or RDATE, a RECURRENCE-ID component or more than one VEVENT. */
    recurring: boolean;
    /** The master's end is before the client clock's now (an all-day end: midnight in the zone). */
    ended: boolean;
    /** The resource as the GET answered it, unchanged. */
    data: Uint8Array;
};

/** One request on an event resource. */
export type CalendarResourceRequest = {
    method: string;
    /** A direct child of a calendar (`resourceUrlOf`). */
    url: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
};

/** Creates and deletes calendar events; separate from the read-only `ICalendarClient`. */
export interface ICalendarWriteClient {
    /**
     * `false` only on a client without accounts: each of its calls refuses
     * before anything is sent or read.
     */
    readonly configured?: boolean;
    /** The IANA zone input without an offset is read in and times are shown in. */
    readonly timezone: string;
    readonly clock: IClock;
    /** The listed VEVENT calendar `id` (`<account>:<slug>`); a ValidationError for any other. */
    calendar(id: string, signal?: AbortSignal): Promise<CalendarWriteView>;
    /**
     * The address `account` invites from: the first `mailto:` of its principal's
     * calendar user addresses, else its user when that is an address; undefined
     * without either.
     */
    organizer(account: string, signal?: AbortSignal): Promise<string | undefined>;
    /**
     * PUTs `request` as a new resource (`If-None-Match: *`). A `412` on a
     * resource holding the same UID is the replay and answers as created;
     * nothing throws after the server accepted the PUT.
     */
    create(request: CalendarCreateRequest, signal?: AbortSignal): Promise<CalendarCreateResult>;
    /**
     * The event a create with effect key `key` stored in `calendar`; undefined
     * when the resource is absent. Any other answer throws (fail closed).
     */
    findCreated(calendar: string, key: string, signal?: AbortSignal): Promise<CalendarCreateResult | undefined>;
    /**
     * The event the id `event` names, as it is now (GET); undefined when the
     * resource is gone. A malformed id, an unknown account or a bad name is a
     * ValidationError before any request.
     */
    describe(event: string, signal?: AbortSignal): Promise<CalendarDeleteItem | undefined>;
    /**
     * DELETEs the resource the id `event` names, with `If-Match` of the id's
     * ETag: `deleted`, or `missing` when it is gone; a changed event is a
     * ValidationError (`CALENDAR_CHANGED_MESSAGE`).
     */
    remove(event: string, signal?: AbortSignal): Promise<'deleted' | 'missing'>;
    /** Forgets every session; the next call logs in again. */
    close(): Promise<void>;
}
