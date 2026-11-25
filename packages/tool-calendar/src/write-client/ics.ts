/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import ICAL from 'ical.js';
import { CALENDAR_PRODID } from './constants.ts';
import type { CalendarCreateRequest, CalendarTime } from './types.ts';

type IcalTime = InstanceType<typeof ICAL.Time>;

/** An instant as a UTC date-time, or a plain date as a DATE value. */
function icalTimeOf(time: CalendarTime | { kind: 'instant'; instant: Temporal.Instant }): IcalTime {
    if (time.kind === 'date') {
        return ICAL.Time.fromData({
            year: time.date.year,
            month: time.date.month,
            day: time.date.day,
            isDate: true,
        });
    }

    const utc = time.instant.toZonedDateTimeISO('UTC');

    return ICAL.Time.fromData({
        year: utc.year,
        month: utc.month,
        day: utc.day,
        hour: utc.hour,
        minute: utc.minute,
        second: utc.second,
    }, ICAL.Timezone.utcTimezone);
}

/** `text` with every CRLF and bare CR as LF: ical.js escapes LF but not a bare CR, which would end the line. */
function textOf(text: string): string {
    return text.replaceAll(/\r\n?/g, '\n');
}

/**
 * The iCalendar of `request`: one VEVENT, times in UTC (or DATE values), no
 * TZID or VTIMEZONE; ical.js escapes TEXT and folds lines. With attendees it
 * names the organizer and each attendee as a required participant asked to
 * answer.
 */
export function buildEventIcs(request: CalendarCreateRequest, stamp: Temporal.Instant): string {
    const vcalendar = new ICAL.Component('vcalendar');
    const vevent = new ICAL.Component('vevent');

    vcalendar.addPropertyWithValue('version', '2.0');
    vcalendar.addPropertyWithValue('prodid', CALENDAR_PRODID);
    vcalendar.addPropertyWithValue('calscale', 'GREGORIAN');

    vevent.addPropertyWithValue('uid', request.uid);
    vevent.addPropertyWithValue('dtstamp', icalTimeOf({ kind: 'instant', instant: stamp }));
    vevent.addPropertyWithValue('dtstart', icalTimeOf(request.start));
    vevent.addPropertyWithValue('dtend', icalTimeOf(request.end));
    vevent.addPropertyWithValue('summary', textOf(request.title));

    if (request.location !== undefined) {
        vevent.addPropertyWithValue('location', textOf(request.location));
    }

    if (request.description !== undefined) {
        vevent.addPropertyWithValue('description', textOf(request.description));
    }

    if (request.attendees.length > 0 && request.organizer !== undefined) {
        vevent.addPropertyWithValue('organizer', `mailto:${request.organizer}`);

        for (const address of request.attendees) {
            const attendee = new ICAL.Property('attendee');

            attendee.setParameter('role', 'REQ-PARTICIPANT');
            attendee.setParameter('partstat', 'NEEDS-ACTION');
            attendee.setParameter('rsvp', 'TRUE');
            attendee.setValue(`mailto:${address}`);
            vevent.addProperty(attendee);
        }
    }

    vcalendar.addSubcomponent(vevent);

    return `${vcalendar.toString()}\r\n`;
}
