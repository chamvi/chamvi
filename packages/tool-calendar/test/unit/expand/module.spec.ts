/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { CALENDAR_FIELD_MAX_CHARS } from '../../../src/expand/constants.ts';
import { expandEvents } from '../../../src/expand/module.ts';
import { calendar, vevent, weeklyStandup } from '../../utils/ics.ts';

const ZONE = 'Europe/Berlin';

function range(from: string, to: string) {
    return { from: Temporal.Instant.from(from), to: Temporal.Instant.from(to) };
}

describe('expandEvents', () => {
    let tz: string | undefined;

    beforeAll(() => {
        // The output must not depend on the process zone.
        tz = process.env.TZ;
        process.env.TZ = 'America/New_York';
    });

    afterAll(() => {
        if (tz === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = tz;
        }
    });

    for (const withTimezone of [true, false]) {
        it(`expands a weekly series with EXDATE, a moved and a cancelled exception (VTIMEZONE ${withTimezone ? 'present' : 'missing'})`, () => {
            const events = expandEvents(
                weeklyStandup(withTimezone),
                range('2026-10-20T00:00:00Z', '2026-12-31T00:00:00Z'),
                ZONE,
                { calendar: 'me:home', user: 'me@example.com' },
            );

            expect(events.map((event) => [event.start, event.end, event.title, event.recurrenceId, event.status])).toEqual([
                ['2026-10-26T09:00:00+01:00', '2026-10-26T10:00:00+01:00', 'Standup', '2026-10-26T09:00:00+01:00', undefined],
                ['2026-11-09T14:00:00+01:00', '2026-11-09T15:00:00+01:00', 'Standup moved', '2026-11-09T09:00:00+01:00', undefined],
                ['2026-11-16T09:00:00+01:00', '2026-11-16T10:00:00+01:00', 'Standup', '2026-11-16T09:00:00+01:00', 'CANCELLED'],
                ['2026-11-23T09:00:00+01:00', '2026-11-23T10:00:00+01:00', 'Standup', '2026-11-23T09:00:00+01:00', undefined],
            ]);
            expect(events[0]).toEqual({
                calendar: 'me:home',
                uid: 'standup',
                recurrenceId: '2026-10-26T09:00:00+01:00',
                title: 'Standup',
                start: '2026-10-26T09:00:00+01:00',
                end: '2026-10-26T10:00:00+01:00',
                allDay: false,
                location: 'Room 1',
                organizer: 'Boss <boss@example.com>',
                attendees: { count: 2, self: 'ACCEPTED' },
            });
        });
    }

    it('stops an old daily series at the end of the window', () => {
        const ics = calendar(vevent(
            'UID:daily',
            'DTSTART:20150101T070000Z',
            'DTEND:20150101T073000Z',
            'RRULE:FREQ=DAILY',
            'SUMMARY:Daily',
        ));
        const events = expandEvents(ics, range('2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'), ZONE);

        expect(events).toHaveLength(7);
        expect(events[0]?.start).toBe('2026-11-02T08:00:00+01:00');
        expect(events[6]?.start).toBe('2026-11-08T08:00:00+01:00');
    });

    it('caps the iterations of a series', () => {
        const ics = calendar(vevent(
            'UID:minutely',
            'DTSTART:20000101T000000Z',
            'DTEND:20000101T000001Z',
            'RRULE:FREQ=MINUTELY',
            'SUMMARY:Tick',
        ));

        expect(expandEvents(ics, range('2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z'), ZONE)).toEqual([]);
    });

    it('reads a floating IANA TZID without VTIMEZONE in that zone', () => {
        const ics = calendar(vevent(
            'UID:floating',
            'DTSTART;TZID=Europe/Berlin:20261105T090000',
            'DTEND;TZID=Europe/Berlin:20261105T100000',
            'SUMMARY:Floating',
        ));
        const [event] = expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE);

        expect(event?.start).toBe('2026-11-05T09:00:00+01:00');
        expect(event?.end).toBe('2026-11-05T10:00:00+01:00');
    });

    it('converts another IANA TZID into the zone', () => {
        const ics = calendar(vevent(
            'UID:tokyo',
            'DTSTART;TZID=Asia/Tokyo:20261105T170000',
            'DTEND;TZID=Asia/Tokyo:20261105T180000',
            'SUMMARY:Tokyo',
        ));
        const [event] = expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE);

        expect(event?.start).toBe('2026-11-05T09:00:00+01:00');
    });

    it('falls back to the zone for a TZID that is not IANA', () => {
        const ics = calendar(vevent(
            'UID:windows',
            'DTSTART;TZID=W. Europe Standard Time:20261105T090000',
            'DTEND;TZID=W. Europe Standard Time:20261105T100000',
            'SUMMARY:Windows',
        ));
        const [event] = expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE);

        expect(event?.start).toBe('2026-11-05T09:00:00+01:00');
    });

    it('treats a time without TZID as floating in the zone', () => {
        const ics = calendar(vevent(
            'UID:local',
            'DTSTART:20261105T090000',
            'DTEND:20261105T100000',
            'SUMMARY:Local',
        ));
        const [event] = expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE);

        expect(event?.start).toBe('2026-11-05T09:00:00+01:00');
    });

    it('gives all-day events as plain dates with an exclusive end', () => {
        const ics = calendar(vevent(
            'UID:holiday',
            'DTSTART;VALUE=DATE:20261105',
            'DTEND;VALUE=DATE:20261106',
            'SUMMARY:Holiday',
        ));
        const events = expandEvents(ics, range('2026-11-05T12:00:00Z', '2026-11-05T13:00:00Z'), ZONE);

        expect(events).toEqual([{
            calendar: '',
            uid: 'holiday',
            title: 'Holiday',
            start: '2026-11-05',
            end: '2026-11-06',
            allDay: true,
        }]);
    });

    it('drops an all-day event that ends at the start of the window in the zone', () => {
        const ics = calendar(vevent(
            'UID:holiday',
            'DTSTART;VALUE=DATE:20261105',
            'SUMMARY:Holiday',
        ));

        // 2026-11-06 00:00 Berlin is 2026-11-05 23:00Z.
        expect(expandEvents(ics, range('2026-11-05T23:00:00Z', '2026-11-07T00:00:00Z'), ZONE)).toEqual([]);
        expect(expandEvents(ics, range('2026-11-05T22:59:00Z', '2026-11-07T00:00:00Z'), ZONE)).toHaveLength(1);
    });

    it('gives an orphan exception as a single event', () => {
        const ics = calendar(vevent(
            'UID:invite',
            'RECURRENCE-ID:20261105T080000Z',
            'DTSTART:20261105T100000Z',
            'DTEND:20261105T110000Z',
            'SUMMARY:Moved invite',
        ));

        expect(expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE)).toEqual([{
            calendar: '',
            uid: 'invite',
            recurrenceId: '2026-11-05T09:00:00+01:00',
            title: 'Moved invite',
            start: '2026-11-05T11:00:00+01:00',
            end: '2026-11-05T12:00:00+01:00',
            allDay: false,
        }]);
    });

    it('cuts the description and keeps the end of a single event exclusive', () => {
        const ics = calendar(vevent(
            'UID:long',
            'DTSTART:20261105T080000Z',
            'DTEND:20261105T090000Z',
            'SUMMARY:Long',
            `DESCRIPTION:${'x'.repeat(2500)}`,
        ));

        const [event] = expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE);

        expect(event?.description).toHaveLength(2000);
        expect(expandEvents(ics, range('2026-11-05T09:00:00Z', '2026-11-06T00:00:00Z'), ZONE)).toEqual([]);
        expect(expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-05T08:00:00Z'), ZONE)).toEqual([]);
    });

    it('cuts the title, location and organizer of every occurrence of a recurring invite', () => {
        const huge = 'y'.repeat(2 * 1024 * 1024);
        const ics = calendar(vevent(
            'UID:spam',
            'DTSTART:20261001T080000Z',
            'DTEND:20261001T090000Z',
            'RRULE:FREQ=DAILY',
            `SUMMARY:${huge}`,
            `LOCATION:${huge}`,
            `ORGANIZER;CN=${huge}:mailto:spam@example.com`,
        ));

        const events = expandEvents(ics, range('2026-11-01T00:00:00Z', '2027-01-31T00:00:00Z'), ZONE);

        expect(events.length).toBeGreaterThan(90);

        for (const event of events) {
            expect(event.title).toHaveLength(CALENDAR_FIELD_MAX_CHARS);
            expect(event.location).toHaveLength(CALENDAR_FIELD_MAX_CHARS);
            expect(event.organizer).toHaveLength(CALENDAR_FIELD_MAX_CHARS);
        }

        expect(JSON.stringify(events).length).toBeLessThan(events.length * 4 * CALENDAR_FIELD_MAX_CHARS);
    });

    it('never cuts a title inside a surrogate pair', () => {
        const ics = calendar(vevent(
            'UID:emoji',
            'DTSTART:20261105T080000Z',
            'DTEND:20261105T090000Z',
            `SUMMARY:${'a'.repeat(CALENDAR_FIELD_MAX_CHARS - 1)}😀`,
        ));

        const [event] = expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE);

        expect(event?.title).toBe('a'.repeat(CALENDAR_FIELD_MAX_CHARS - 1));
    });

    it('takes the end from DURATION', () => {
        const ics = calendar(vevent(
            'UID:duration',
            'DTSTART:20261105T080000Z',
            'DURATION:PT90M',
            'SUMMARY:Duration',
        ));

        expect(expandEvents(ics, range('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), ZONE)[0]?.end)
            .toBe('2026-11-05T10:30:00+01:00');
    });
});
