/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import ICAL from 'ical.js';
import {
    CALENDAR_DESCRIPTION_MAX_CHARS,
    CALENDAR_EXPAND_MAX_ITERATIONS,
    CALENDAR_FIELD_MAX_CHARS,
} from './constants.ts';
import type {
    CalendarEvent,
    CalendarEventAttendees,
    CalendarRange,
    ExpandContext,
} from './types.ts';

type Component = InstanceType<typeof ICAL.Component>;
type IcalEvent = InstanceType<typeof ICAL.Event>;
type IcalTime = InstanceType<typeof ICAL.Time>;

/** The wall time of `time` as a plain date-time (no zone). */
function wallOf(time: IcalTime): Temporal.PlainDateTime {
    return new Temporal.PlainDateTime(time.year, time.month, time.day, time.hour, time.minute, time.second);
}

function inZone(wall: Temporal.PlainDateTime, zone: string): Temporal.Instant | undefined {
    try {
        return wall.toZonedDateTime(zone).toInstant();
    } catch {
        // not a zone Temporal knows (e.g. a Windows name)
        return undefined;
    }
}

/**
 * The instant of `time`. A date is midnight in `zone`. A time with a zone
 * ical.js resolved from a VTIMEZONE, or a floating time with a `tzid`, is read
 * in that zone when it is an IANA id (a non-IANA VTIMEZONE keeps its own
 * rules); any other floating time is read in `zone`. Never the process zone.
 */
function instantOf(time: IcalTime, tzid: string | undefined, zone: string): Temporal.Instant {
    if (time.isDate) {
        return Temporal.PlainDate.from({
            year: time.year,
            month: time.month,
            day: time.day,
        }).toZonedDateTime(zone).toInstant();
    }

    const resolved = time.zone && time.zone.tzid !== 'floating' ? time.zone.tzid : undefined;
    const wall = wallOf(time);
    const id = resolved ?? tzid;

    if (id) {
        const instant = inZone(wall, id);

        if (instant) {
            return instant;
        }

        if (resolved) {
            return Temporal.Instant.fromEpochMilliseconds(time.toUnixTime() * 1000);
        }
    }

    return wall.toZonedDateTime(zone).toInstant();
}

function format(time: IcalTime, tzid: string | undefined, zone: string): string {
    if (time.isDate) {
        return Temporal.PlainDate.from({
            year: time.year,
            month: time.month,
            day: time.day,
        }).toString();
    }

    return instantOf(time, tzid, zone).toZonedDateTimeISO(zone).toString({ timeZoneName: 'never' });
}

function tzidOf(component: Component, name: string): string | undefined {
    const tzid = component.getFirstProperty(name)?.getParameter('tzid');

    return typeof tzid === 'string' && tzid.length > 0 ? tzid : undefined;
}

function textOf(component: Component, name: string): string | undefined {
    const value = component.getFirstPropertyValue(name);

    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function cut(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }

    const code = text.charCodeAt(max - 1);

    return text.slice(0, code >= 0xD800 && code <= 0xDBFF ? max - 1 : max);
}

function addressOf(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return value.replace(/^mailto:/i, '').trim() || undefined;
}

function organizerOf(component: Component): string | undefined {
    const property = component.getFirstProperty('organizer');
    const address = addressOf(property?.getFirstValue());

    if (!property || !address) {
        return undefined;
    }

    const cn = property.getParameter('cn');

    return typeof cn === 'string' && cn.length > 0 ? `${cn} <${address}>` : address;
}

function attendeesOf(component: Component, user: string | undefined): CalendarEventAttendees | undefined {
    const attendees = component.getAllProperties('attendee');

    if (attendees.length === 0) {
        return undefined;
    }

    const own = user ?
        attendees.find((property) => addressOf(property.getFirstValue())?.toLowerCase() === user.toLowerCase()) :
        undefined;

    if (!own) {
        return { count: attendees.length };
    }

    const partstat = own.getParameter('partstat');

    return { count: attendees.length, self: typeof partstat === 'string' ? partstat.toUpperCase() : 'NEEDS-ACTION' };
}

type Occurrence = {
    item: Component;
    start: IcalTime;
    end: IcalTime;
    /** The end was derived from the start (DURATION or no DTEND): read it in the start's zone. */
    derivedEnd: boolean;
    recurrenceId?: { time: IcalTime; tzid: string | undefined };
};

function eventOf(
    occurrence: Occurrence,
    range: CalendarRange,
    zone: string,
    context: ExpandContext,
): CalendarEvent | undefined {
    const { item } = occurrence;
    const startTzid = tzidOf(item, 'dtstart');
    const endTzid = occurrence.derivedEnd ? startTzid : tzidOf(item, 'dtend') ?? startTzid;
    const start = instantOf(occurrence.start, startTzid, zone);
    const end = instantOf(occurrence.end, endTzid, zone);

    if (Temporal.Instant.compare(end, range.from) <= 0 || Temporal.Instant.compare(start, range.to) >= 0) {
        return undefined;
    }

    const location = textOf(item, 'location');
    const description = textOf(item, 'description');
    const status = textOf(item, 'status');
    const organizer = organizerOf(item);
    const attendees = attendeesOf(item, context.user);

    return {
        calendar: context.calendar ?? '',
        uid: textOf(item, 'uid') ?? '',
        ...(occurrence.recurrenceId && { recurrenceId: format(occurrence.recurrenceId.time, occurrence.recurrenceId.tzid, zone) }),
        title: cut(textOf(item, 'summary') ?? '', CALENDAR_FIELD_MAX_CHARS),
        start: format(occurrence.start, startTzid, zone),
        end: format(occurrence.end, endTzid, zone),
        allDay: occurrence.start.isDate,
        ...(location && { location: cut(location, CALENDAR_FIELD_MAX_CHARS) }),
        ...(description && { description: cut(description, CALENDAR_DESCRIPTION_MAX_CHARS) }),
        ...(status && { status: status.toUpperCase() }),
        ...(organizer && { organizer: cut(organizer, CALENDAR_FIELD_MAX_CHARS) }),
        ...(attendees && { attendees }),
    };
}

/** One non-recurring event (or an exception without its master). */
function single(component: Component): Occurrence {
    const event = new ICAL.Event(component);
    const recurrenceId = component.getFirstProperty('recurrence-id');

    return {
        item: component,
        start: event.startDate,
        end: event.endDate,
        derivedEnd: !component.hasProperty('dtend'),
        ...(recurrenceId && {
            recurrenceId: {
                time: recurrenceId.getFirstValue() as IcalTime,
                tzid: tzidOf(component, 'recurrence-id'),
            },
        }),
    };
}

/** The occurrences of a recurring event that start before `to`, at most CALENDAR_EXPAND_MAX_ITERATIONS. */
function* occurrences(event: IcalEvent, range: CalendarRange, zone: string): Generator<Occurrence> {
    const masterTzid = tzidOf(event.component, 'dtstart');
    const iterator = event.iterator();
    let count = 0;

    for (let next = iterator.next(); next; next = iterator.next()) {
        count++;

        if (count > CALENDAR_EXPAND_MAX_ITERATIONS || Temporal.Instant.compare(instantOf(next, masterTzid, zone), range.to) >= 0) {
            return;
        }

        const details = event.getOccurrenceDetails(next);
        const exception = details.item !== event;

        yield {
            item: details.item.component,
            start: details.startDate,
            end: details.endDate,
            derivedEnd: !exception || !details.item.component.hasProperty('dtend'),
            recurrenceId: { time: details.recurrenceId, tzid: masterTzid },
        };
    }
}

function componentsOf(ics: string): Component[] {
    const parsed: unknown = ICAL.parse(ics);
    const list = Array.isArray(parsed) && Array.isArray(parsed[0]) ? parsed : [parsed];

    return list.flatMap((jcal) => new ICAL.Component(jcal as unknown[]).getAllSubcomponents('vevent'));
}

/**
 * The events of one iCalendar resource within `range` (an event is in it
 * when it ends after `from` and starts before `to`). Recurring events are
 * expanded from DTSTART with EXDATE and RECURRENCE-ID exceptions honoured;
 * cancelled ones are kept with `status`. Times are given in `zone`. Throws
 * on text that is not iCalendar.
 */
export function expandEvents(ics: string, range: CalendarRange, zone: string, context: ExpandContext = {}): CalendarEvent[] {
    const vevents = componentsOf(ics);
    const masters: Component[] = [];
    const exceptions = new Map<string, Component[]>();

    for (const vevent of vevents) {
        if (vevent.hasProperty('recurrence-id')) {
            const uid = textOf(vevent, 'uid') ?? '';

            exceptions.set(uid, [...exceptions.get(uid) ?? [], vevent]);
        } else {
            masters.push(vevent);
        }
    }

    const found: Occurrence[] = [];
    const paired = new Set<string>();

    for (const master of masters) {
        const uid = textOf(master, 'uid') ?? '';
        const event = new ICAL.Event(master, { exceptions: exceptions.get(uid) ?? [] });

        if (event.isRecurring()) {
            paired.add(uid);
            found.push(...occurrences(event, range, zone));
        } else {
            found.push(single(master));
        }
    }

    for (const [uid, list] of exceptions) {
        if (!paired.has(uid)) {
            found.push(...list.map(single));
        }
    }

    return found
        .map((occurrence) => eventOf(occurrence, range, zone, context))
        .filter((event): event is CalendarEvent => event !== undefined);
}
