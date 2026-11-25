/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import ICAL from 'ical.js';
import { calendarError } from '../client/asserts.ts';
import { encodeCalendarEventId } from '../event-id/module.ts';
import { instantOf } from '../expand/module.ts';
import { sha256Hex } from '../write-tools/keys.ts';
import { calendarAccountOf, isCalendarAddress } from './asserts.ts';
import { buildEventIcs } from './ics.ts';
import {
    discardBody,
    readResourceBody,
    resourceRequest,
    resourceUrlOf,
    statusError,
} from './resource.ts';
import type { CalendarWriteSessions } from './session.ts';
import type {
    CalendarCreateRequest,
    CalendarCreateResult,
    CalendarTime,
    CalendarWriteEntry,
} from './types.ts';

const TOOL = 'calendar_create';

type IcalTime = InstanceType<typeof ICAL.Time>;

/** The UID and resource name of the create with effect key `key`: a replay names the same resource. */
export function calendarResourceOf(key: string): { uid: string; name: string } {
    const hash = sha256Hex(key).slice(0, 32);

    return { uid: `${hash}@chamvi`, name: `chamvi-${hash}.ics` };
}

/** `time` as `calendar_events` prints it: ISO with the offset of `zone`, or the plain date. */
export function printTime(time: CalendarTime, zone: string): string {
    if (time.kind === 'date') {
        return time.date.toString();
    }

    return time.instant.toZonedDateTimeISO(zone).toString({ timeZoneName: 'never' });
}


function calendarTimeOf(time: IcalTime, tzid: string | undefined, zone: string): CalendarTime {
    if (time.isDate) {
        return { kind: 'date', date: new Temporal.PlainDate(time.year, time.month, time.day) };
    }

    return { kind: 'instant', instant: instantOf(time, tzid, zone) };
}

function tzidOf(component: InstanceType<typeof ICAL.Component>, name: string): string | undefined {
    const tzid = component.getFirstProperty(name)?.getParameter('tzid');

    return typeof tzid === 'string' && tzid.length > 0 ? tzid : undefined;
}

function bareAddressOf(value: unknown): string {
    return typeof value === 'string' ? value.replace(/^mailto:/i, '').trim().toLowerCase() : '';
}

/** The attendees that are not the organizer (a server may add the organizer as an attendee). */
function invitedOf(attendees: string[], organizer: string | undefined): number {
    const own = bareAddressOf(organizer);

    return attendees.filter((address) => bareAddressOf(address) !== own).length;
}

/** A value that goes on the wire as is: printable ASCII only. */
const WIRE_VALUE = /^[\x21-\x7E]+$/;

type StoredEvent = {
    uid: string;
    start: CalendarTime;
    end: CalendarTime;
    invited: number;
};

/**
 * The event this package stored in `data`, as a server may have rewritten it
 * (a TZID, DURATION instead of DTEND, the organizer added as an attendee);
 * undefined when it is no iCalendar or has no VEVENT with a start.
 */
function storedEventOf(data: Uint8Array, zone: string): StoredEvent | undefined {
    try {
        const vevent = new ICAL.Component(ICAL.parse(Buffer.from(data).toString('utf8')) as unknown[]).getFirstSubcomponent('vevent');
        const uid = vevent?.getFirstPropertyValue('uid');

        if (!vevent || typeof uid !== 'string' || !(vevent.getFirstPropertyValue('dtstart') instanceof ICAL.Time)) {
            return undefined;
        }

        const event = new ICAL.Event(vevent);
        const startTzid = tzidOf(vevent, 'dtstart');
        const endTzid = vevent.hasProperty('dtend') ? tzidOf(vevent, 'dtend') ?? startTzid : startTzid;

        return {
            uid,
            start: calendarTimeOf(event.startDate, startTzid, zone),
            end: calendarTimeOf(event.endDate, endTzid, zone),
            invited: invitedOf(
                vevent.getAllProperties('attendee').map((property) => String(property.getFirstValue())),
                stringOrUndefined(vevent.getFirstPropertyValue('organizer')),
            ),
        };
    } catch {
        return undefined;
    }
}

function stringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function resultOf(
    calendar: string,
    name: string,
    etag: string | null | undefined,
    event: StoredEvent,
    zone: string,
): CalendarCreateResult {
    return {
        calendar,
        uid: event.uid,
        ...(etag && {
            event: encodeCalendarEventId({
                calendar, 
                name, 
                etag, 
            }), 
        }),
        start: printTime(event.start, zone),
        end: printTime(event.end, zone),
        allDay: event.start.kind === 'date',
        invited: event.invited,
    };
}

/** GETs the resource `name` of `entry`: its event and ETag, undefined on a 404; any other answer throws. */
async function readStored(
    sessions: CalendarWriteSessions,
    entry: CalendarWriteEntry,
    name: string,
    signal: AbortSignal,
): Promise<{ event: StoredEvent | undefined; etag: string | null } | undefined> {
    const { account } = entry.view;
    const response = await resourceRequest(sessions.fetch, sessions.account(account), {
        method: 'GET',
        url: resourceUrlOf(entry.view, name),
        headers: {},
        signal,
    });

    if (response.status === 404) {
        await discardBody(response);

        return undefined;
    }

    if (response.status !== 200) {
        await discardBody(response);

        throw statusError(TOOL, account, response.status);
    }

    const data = await readResourceBody(response, TOOL, account);

    return { event: storedEventOf(data, sessions.options.timezone), etag: response.headers.get('etag') };
}

/** The ETag of the resource just created, undefined when it cannot be read: nothing throws after the PUT. */
async function etagAfterCreate(
    sessions: CalendarWriteSessions,
    entry: CalendarWriteEntry,
    name: string,
    signal: AbortSignal | undefined,
): Promise<string | undefined> {
    try {
        const found = await sessions.run(TOOL, entry.view.account, signal, (inner) => readStored(sessions, entry, name, inner));

        return found?.etag ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * PUTs `request` as a new resource of its calendar. Any `2xx` created
 * (without an ETag header one GET reads it, its failure leaves `event` out);
 * `412` with our UID at the name is a replay, answered as created; `401`/`403`
 * `not permitted`; anything else `request failed`.
 */
export async function createCalendarEvent(
    sessions: CalendarWriteSessions,
    request: CalendarCreateRequest,
    signal: AbortSignal | undefined,
): Promise<CalendarCreateResult> {
    const account = calendarAccountOf(request.calendar);

    sessions.account(account);

    if (request.attendees.length > 0 && request.organizer === undefined) {
        throw new ValidationError(`${TOOL}: account "${account}" has no calendar address to invite from.`);
    }

    // the tool checked these already; the client is public, so it checks again before anything goes on the wire
    const badAttendee = request.attendees.some((address) => !isCalendarAddress(address));

    if (
        badAttendee ||
        (request.organizer !== undefined && !isCalendarAddress(request.organizer)) ||
        !WIRE_VALUE.test(request.uid) ||
        !WIRE_VALUE.test(request.name)
    ) {
        throw new ValidationError(`${TOOL}: an attendee, the organizer, the uid or the resource name is not a bare value.`);
    }

    const zone = sessions.options.timezone;
    const stamp = Temporal.Instant.fromEpochMilliseconds(sessions.options.clock.now());
    const own: StoredEvent = {
        uid: request.uid,
        start: request.start,
        end: request.end,
        invited: invitedOf(request.attendees, request.organizer),
    };

    const { entry, etag } = await sessions.run(TOOL, account, signal, async (inner) => {
        const found = await sessions.calendar(account, request.calendar, inner);
        const response = await resourceRequest(sessions.fetch, sessions.account(account), {
            method: 'PUT',
            url: resourceUrlOf(found.view, request.name),
            headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
            body: buildEventIcs(request, stamp),
            signal: inner,
        });

        await discardBody(response);

        if (response.status >= 200 && response.status < 300) {
            return { entry: found, etag: response.headers.get('etag') ?? undefined };
        }

        if (response.status !== 412) {
            throw statusError(TOOL, account, response.status);
        }

        const stored = await readStored(sessions, found, request.name, inner);

        if (stored?.event?.uid !== request.uid) {
            throw calendarError(`${TOOL}: ${account}: request failed`);
        }

        return { entry: found, etag: stored.etag ?? undefined };
    });

    // accepted: from here on nothing throws
    const known = etag ?? await etagAfterCreate(sessions, entry, request.name, signal);

    return resultOf(request.calendar, request.name, known, own, zone);
}

/** The event the create with effect key `key` stored in `calendar`, undefined when absent; any other answer throws. */
export async function findCreatedEvent(
    sessions: CalendarWriteSessions,
    calendar: string,
    key: string,
    signal: AbortSignal | undefined,
): Promise<CalendarCreateResult | undefined> {
    const account = calendarAccountOf(calendar);
    const { uid, name } = calendarResourceOf(key);

    sessions.account(account);

    return sessions.run(TOOL, account, signal, async (inner) => {
        const entry = await sessions.calendar(account, calendar, inner);
        const stored = await readStored(sessions, entry, name, inner);

        if (!stored) {
            return undefined;
        }

        if (stored.event?.uid !== uid) {
            throw calendarError(`${TOOL}: ${account}: request failed`);
        }

        return resultOf(calendar, name, stored.etag, stored.event, sessions.options.timezone);
    });
}
