/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ChamviError } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { CALENDAR_REQUEST_ERROR_CODE, createCalendarWriteClient } from '@chamvi/tool-calendar';
import type { CalendarCreateRequest } from '@chamvi/tool-calendar';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { calendarResourceOf, printTime } from '../../../src/write-client/create.ts';
import { FAKE_CALDAV_URL, createFakeCalDav, fakeObjectsOf } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';
import {
    calendar,
    parseEvent,
    unfold,
    vevent,
} from '../../utils/ics.ts';

const ACCOUNT = {
    id: 'icloud',
    url: FAKE_CALDAV_URL,
    user: 'peter@example.com',
    password: 'secret',
};
const KEY = 'run-1:calendar_create:abc';

function berlin(wall: string): { kind: 'instant'; instant: Temporal.Instant } {
    return { kind: 'instant', instant: Temporal.PlainDateTime.from(wall).toZonedDateTime('Europe/Berlin').toInstant() };
}

function timed(overrides: Partial<CalendarCreateRequest> = {}): CalendarCreateRequest {
    const { uid, name } = calendarResourceOf(KEY);

    return {
        calendar: 'icloud:home',
        uid,
        name,
        title: 'Planning',
        start: berlin('2026-11-05T09:00'),
        end: berlin('2026-11-05T10:30'),
        attendees: [],
        ...overrides,
    };
}

function setup() {
    const server = createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [], 
    }]);
    const clock = new ControllableClock(new Date('2026-11-01T12:00:00Z'));
    const client = createCalendarWriteClient([ACCOUNT], { fetch: server.fetch, clock });

    return { server, client };
}

function stored(server: FakeCalDav): string {
    const objects = fakeObjectsOf(server.calendars[0]!);

    expect(objects).toHaveLength(1);

    return unfold(objects[0]!.ics);
}

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    const error = await promise.then(() => undefined, (e: unknown) => e);

    expect(error).toBeInstanceOf(ChamviError);

    return error as ChamviError;
}

describe('calendarResourceOf', () => {
    it('derives the UID and resource name from the effect key', () => {
        const { uid, name } = calendarResourceOf(KEY);
        const hash = uid.slice(0, 32);

        expect(uid).toMatch(/^[0-9a-f]{32}@chamvi$/);
        expect(name).toBe(`chamvi-${hash}.ics`);
        expect(calendarResourceOf(KEY)).toEqual({ uid, name });
        expect(calendarResourceOf(`${KEY}x`).uid).not.toBe(uid);
    });

    it('prints times as calendar_events does', () => {
        expect(printTime(berlin('2026-11-05T09:00'), 'Europe/Berlin')).toBe('2026-11-05T09:00:00+01:00');
        expect(printTime({ kind: 'date', date: Temporal.PlainDate.from('2026-11-05') }, 'Europe/Berlin')).toBe('2026-11-05');
    });
});

describe('createCalendarWriteClient: create', () => {
    it('stores a timed event in UTC and prints it in the zone', async () => {
        const { server, client } = setup();
        const request = timed();
        const result = await client.create(request);
        const ics = stored(server);

        expect(ics).toContain('\r\nDTSTART:20261105T080000Z\r\n');
        expect(ics).toContain('\r\nDTEND:20261105T093000Z\r\n');
        expect(ics).toContain('\r\nDTSTAMP:20261101T120000Z\r\n');
        expect(ics).toContain('PRODID:-//chamvi//tool-calendar//EN');
        expect(ics).not.toContain('TZID');
        expect(ics).not.toContain('ORGANIZER');
        expect(ics).not.toContain('ATTENDEE');
        expect(parseEvent(ics)).toMatchObject({ uid: request.uid, title: 'Planning' });
        expect(server.requests.find((r) => r.method === 'PUT')?.url).toBe(`https://p42-caldav.icloud.com/123/calendars/home/${request.name}`);
        expect(result).toEqual({
            calendar: 'icloud:home',
            uid: request.uid,
            event: encodeCalendarEventId({
                calendar: 'icloud:home', 
                name: request.name, 
                etag: '"w1"', 
            }),
            start: '2026-11-05T09:00:00+01:00',
            end: '2026-11-05T10:30:00+01:00',
            allDay: false,
            invited: 0,
        });
    });

    it('stores an all-day event as dates', async () => {
        const { server, client } = setup();
        const result = await client.create(timed({
            start: { kind: 'date', date: Temporal.PlainDate.from('2026-11-05') },
            end: { kind: 'date', date: Temporal.PlainDate.from('2026-11-06') },
        }));
        const ics = stored(server);

        expect(ics).toContain('\r\nDTSTART;VALUE=DATE:20261105\r\n');
        expect(ics).toContain('\r\nDTEND;VALUE=DATE:20261106\r\n');
        expect(result).toMatchObject({
            start: '2026-11-05', 
            end: '2026-11-06', 
            allDay: true, 
        });
    });

    it('escapes text so it round-trips', async () => {
        const { server, client } = setup();
        const title = 'Plan, review; check \\ done';
        const description = `Line one\nLine two, with; marks\n${'long '.repeat(40)}`;

        await client.create(timed({
            title, 
            description, 
            location: 'Room 1, floor 2', 
        }));

        expect(parseEvent(fakeObjectsOf(server.calendars[0]!)[0]!.ics)).toMatchObject({
            title,
            description,
            location: 'Room 1, floor 2',
        });
    });

    it('invites from the organizer', async () => {
        const { server, client } = setup();
        const result = await client.create(timed({
            organizer: 'peter@example.com',
            attendees: ['a@x.test', 'b@y.test'],
        }));
        const ics = stored(server);

        expect(ics).toContain('\r\nORGANIZER:mailto:peter@example.com\r\n');
        expect(ics).toContain('\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:a@x.test\r\n');
        expect(ics).toContain('\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:b@y.test\r\n');
        expect(parseEvent(ics).attendees).toHaveLength(2);
        expect(result.invited).toBe(2);
    });

    it('answers a replay from the 412 path without a second object', async () => {
        const { server, client } = setup();
        const request = timed({ organizer: 'peter@example.com', attendees: ['a@x.test'] });
        const first = await client.create(request);
        const second = await client.create(request);

        expect(second).toEqual(first);
        expect(fakeObjectsOf(server.calendars[0]!)).toHaveLength(1);
        expect(server.requests.filter((r) => r.method === 'PUT')).toHaveLength(2);
    });

    it('refuses a 412 on a name holding another event', async () => {
        const { server, client } = setup();
        const request = timed();

        server.calendars[0]!.objects = [{
            name: request.name, 
            ics: calendar(vevent('UID:other', 'DTSTART:20261105T080000Z', 'SUMMARY:x')), 
            etag: '"x"', 
        }];

        const error = await rejection(client.create(request));

        expect(error.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
        expect(error.message).toBe('calendar_create: icloud: request failed');
    });

    it('reads the ETag with one GET when the PUT gave none, and never throws after the PUT', async () => {
        const { server, client } = setup();
        const request = timed();

        server.putEtag = false;

        const result = await client.create(request);

        expect(server.requests.filter((r) => r.method === 'GET')).toHaveLength(1);
        expect(result.event).toBe(encodeCalendarEventId({
            calendar: 'icloud:home', 
            name: request.name, 
            etag: '"w1"', 
        }));

        const other = setup();

        other.server.putEtag = false;
        other.server.fail = { method: 'GET', status: 500 };

        const without = await other.client.create(request);

        expect(without).not.toHaveProperty('event');
        expect(without.uid).toBe(request.uid);
    });

    it('maps a 403 to not permitted and never follows a redirect', async () => {
        const { server, client } = setup();

        server.fail = { method: 'PUT', status: 403 };
        expect((await rejection(client.create(timed()))).message).toBe('calendar_create: icloud: not permitted');

        const moved = setup();

        moved.server.fail = {
            method: 'PUT', 
            status: 301, 
            location: 'https://evil.test/x.ics', 
        };
        expect((await rejection(moved.client.create(timed()))).message).toBe('calendar_create: icloud: request failed');
        expect(moved.server.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);
        expect(moved.server.requests.some((r) => r.url.includes('evil.test'))).toBe(false);
        expect(fakeObjectsOf(moved.server.calendars[0]!)).toHaveLength(0);
    });

    it('refuses an unknown calendar before any PUT', async () => {
        const { server, client } = setup();
        const error = await rejection(client.create(timed({ calendar: 'icloud:work' })));

        expect(error.code).toBe('validation_error');
        expect(server.requests.some((r) => r.method === 'PUT')).toBe(false);
    });
});

describe('createCalendarWriteClient: findCreated', () => {
    it('finds the created resource by its key', async () => {
        const { server, client } = setup();
        const request = timed({ organizer: 'peter@example.com', attendees: ['a@x.test'] });
        const created = await client.create(request);

        expect(await client.findCreated('icloud:home', KEY)).toEqual(created);
        expect(await client.findCreated('icloud:home', `${KEY}-other`)).toBeUndefined();

        server.fail = { method: 'GET', status: 500 };

        expect((await rejection(client.findCreated('icloud:home', KEY))).message).toBe('calendar_create: icloud: request failed');
    });
});

describe('createCalendarWriteClient: create, hostile text and stored variants', () => {
    function wireLines(ics: string): string[] {
        return unfold(ics).split('\r\n');
    }

    it('keeps a bare CR in text on one line', async () => {
        for (const attendees of [[], ['a@x.test']]) {
            const { server, client } = setup();
            const title = 'One\rATTENDEE:mailto:evil@x.org';
            const description = 'Two\r\nATTENDEE:mailto:x@y.z\rMETHOD:CANCEL\nORGANIZER:mailto:evil@x.org';

            await client.create(timed({
                title,
                description,
                location: 'Room\rATTENDEE:mailto:evil@x.org',
                ...(attendees.length > 0 && { organizer: 'peter@example.com' }),
                attendees,
            }));

            const { ics } = (fakeObjectsOf(server.calendars[0]!)[0]!);
            const parsed = parseEvent(ics);

            expect(parsed.attendees.map((attendee) => attendee.address)).toEqual(attendees.map((address) => `mailto:${address}`));
            expect(parsed.title).toBe('One\nATTENDEE:mailto:evil@x.org');
            expect(parsed.description).toBe('Two\nATTENDEE:mailto:x@y.z\nMETHOD:CANCEL\nORGANIZER:mailto:evil@x.org');
            expect(ics).not.toMatch(/\r(?!\n)/);

            const own = wireLines(ics).filter((line) => /^(?:ATTENDEE|ORGANIZER|METHOD)\b/.test(line));

            expect(own).toEqual(attendees.length > 0 ? [
                'ORGANIZER:mailto:peter@example.com',
                'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:a@x.test',
            ] : []);
        }
    });

    it('refuses an address, uid or name that is not a bare value before any request', async () => {
        const { server, client } = setup();

        for (const overrides of [
            { organizer: 'peter@example.com', attendees: ['p@x.org\r\nATTENDEE:mailto:evil@x.org'] },
            { organizer: 'p@x.org\r\nATTENDEE:mailto:evil@x.org', attendees: ['a@x.test'] },
            { organizer: 'Peter <p@x.org>', attendees: ['a@x.test'] },
            { uid: 'a b@chamvi' },
            { uid: 'a\r\nX:1' },
            { name: 'chamvi x.ics' },
        ]) {
            const error = await rejection(client.create(timed(overrides as Partial<CalendarCreateRequest>)));

            expect(error.code).toBe('validation_error');
        }

        expect(server.requests).toHaveLength(0);
    });

    it('counts any 2xx answer to the PUT as created', async () => {
        const { server } = setup();
        const writer = createCalendarWriteClient([ACCOUNT], {
            fetch: async (input, init) => {
                const response = await server.fetch(input, init);

                return init?.method === 'PUT' ? new Response(null, { status: 200, headers: response.headers }) : response;
            },
        });

        expect(await writer.create(timed())).toMatchObject({ uid: timed().uid, event: expect.any(String) });
        expect(fakeObjectsOf(server.calendars[0]!)).toHaveLength(1);
    });

    it('reads a stored event the server rewrote as the create gave it', async () => {
        const { server, client } = setup();
        const request = timed({ organizer: 'peter@example.com', attendees: ['a@x.test'] });

        server.calendars[0]!.objects = [{
            name: request.name,
            etag: '"s"',
            ics: calendar(vevent(
                `UID:${request.uid}`,
                'DTSTAMP:20261101T120000Z',
                'DTSTART;TZID=Europe/Berlin:20261105T090000',
                'DURATION:PT1H30M',
                'SUMMARY:Planning',
                'ORGANIZER:mailto:peter@example.com',
                'ATTENDEE;PARTSTAT=ACCEPTED:mailto:Peter@example.com',
                'ATTENDEE:mailto:a@x.test',
            )),
        }];

        const expected = {
            calendar: 'icloud:home',
            uid: request.uid,
            event: encodeCalendarEventId({
                calendar: 'icloud:home', 
                name: request.name, 
                etag: '"s"', 
            }),
            start: '2026-11-05T09:00:00+01:00',
            end: '2026-11-05T10:30:00+01:00',
            allDay: false,
            invited: 1,
        };

        expect(await client.findCreated('icloud:home', KEY)).toEqual(expected);
        // the 412 path answers the same
        expect(await client.create(request)).toEqual(expected);
    });
});

