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
export type CalendarWriteEntry = { view: CalendarWriteView; dav: DAVCalendar };

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
    /** Forgets every session; the next call logs in again. */
    close(): Promise<void>;
}
