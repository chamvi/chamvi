/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import ICAL from 'ical.js';

export type ParsedAttendee = {
    address: string;
    role?: string;
    partstat?: string;
    rsvp?: string;
};

export type ParsedEvent = {
    uid?: string;
    title?: string;
    location?: string;
    description?: string;
    organizer?: string;
    attendees: ParsedAttendee[];
};

function stringOf(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** The first VEVENT of `ics` as ical.js reads it (TEXT values unescaped). */
export function parseEvent(ics: string): ParsedEvent {
    const vevent = new ICAL.Component(ICAL.parse(ics) as unknown[]).getFirstSubcomponent('vevent');

    if (!vevent) {
        throw new TypeError('no VEVENT');
    }

    return {
        uid: stringOf(vevent.getFirstPropertyValue('uid')),
        title: stringOf(vevent.getFirstPropertyValue('summary')),
        location: stringOf(vevent.getFirstPropertyValue('location')),
        description: stringOf(vevent.getFirstPropertyValue('description')),
        organizer: stringOf(vevent.getFirstPropertyValue('organizer')),
        attendees: vevent.getAllProperties('attendee').map((property) => ({
            address: String(property.getFirstValue()),
            role: stringOf(property.getParameter('role')),
            partstat: stringOf(property.getParameter('partstat')),
            rsvp: stringOf(property.getParameter('rsvp')),
        })),
    };
}

/** `ics` with its folded lines joined. */
export function unfold(ics: string): string {
    return ics.replaceAll(/\r\n[ \t]/g, '');
}

/** A VCALENDAR of the given lines (CRLF). */
export function calendar(...lines: string[]): string {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//chamvi//test//EN', ...lines, 'END:VCALENDAR', ''].join('\r\n');
}

/** A VEVENT of the given property lines. */
export function vevent(...lines: string[]): string {
    return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

export const BERLIN_VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'DTSTART:19810329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'TZNAME:CEST',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'DTSTART:19961027T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'TZNAME:CET',
    'END:STANDARD',
    'END:VTIMEZONE',
].join('\r\n');

/**
 * A weekly standup from 2026-10-19 09:00 Berlin (COUNT=6): EXDATE 11-02,
 * 11-09 moved to 14:00, 11-16 cancelled.
 */
export function weeklyStandup(withTimezone = true): string {
    return calendar(
        ...(withTimezone ? [BERLIN_VTIMEZONE] : []),
        vevent(
            'UID:standup',
            'DTSTART;TZID=Europe/Berlin:20261019T090000',
            'DTEND;TZID=Europe/Berlin:20261019T100000',
            'RRULE:FREQ=WEEKLY;COUNT=6',
            'EXDATE;TZID=Europe/Berlin:20261102T090000',
            'SUMMARY:Standup',
            'LOCATION:Room 1',
            'ORGANIZER;CN=Boss:mailto:boss@example.com',
            'ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com',
            'ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:other@example.com',
        ),
        vevent(
            'UID:standup',
            'RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000',
            'DTSTART;TZID=Europe/Berlin:20261109T140000',
            'DTEND;TZID=Europe/Berlin:20261109T150000',
            'SUMMARY:Standup moved',
        ),
        vevent(
            'UID:standup',
            'RECURRENCE-ID;TZID=Europe/Berlin:20261116T090000',
            'DTSTART;TZID=Europe/Berlin:20261116T090000',
            'DTEND;TZID=Europe/Berlin:20261116T100000',
            'STATUS:CANCELLED',
            'SUMMARY:Standup',
        ),
    );
}
