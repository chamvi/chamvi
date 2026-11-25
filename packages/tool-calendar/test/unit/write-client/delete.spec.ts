/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ChamviError, ValidationError } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { CALENDAR_CHANGED_MESSAGE, CALENDAR_REQUEST_ERROR_CODE, createCalendarWriteClient } from '@chamvi/tool-calendar';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { FAKE_CALDAV_URL, createFakeCalDav, fakeObjectsOf } from '../../utils/caldav.ts';
import type { FakeObject } from '../../utils/caldav.ts';
import { calendar, vevent, weeklyStandup } from '../../utils/ics.ts';

const ACCOUNT = {
    id: 'icloud',
    url: FAKE_CALDAV_URL,
    user: 'me@example.com',
    password: 'secret',
};

function object(name: string, ...lines: string[]): FakeObject {
    return {
        name, 
        ics: calendar(vevent(...lines)), 
        etag: `"${name}"`, 
    };
}

function idOf(name: string, etag = `"${name}"`): string {
    return encodeCalendarEventId({
        calendar: 'icloud:home', 
        name, 
        etag, 
    });
}

const ONE = object(
    'one.ics',
    'UID:one',
    'DTSTART:20261105T080000Z',
    'DTEND:20261105T090000Z',
    'SUMMARY:One',
    'ORGANIZER:mailto:me@example.com',
    'ATTENDEE:mailto:ME@example.com',
);

function setup(extra: FakeObject[] = []) {
    const server = createFakeCalDav([{
        slug: 'home',
        name: 'Home',
        objects: [
            ONE,
            object(
                'boss.ics',
                'UID:boss',
                'DTSTART;VALUE=DATE:20261105',
                'DTEND;VALUE=DATE:20261106',
                'SUMMARY:Boss',
                'ORGANIZER:mailto:boss@example.com',
            ),
            object(
                'alias.ics',
                'UID:alias',
                'DTSTART:20261105T080000Z',
                'DTEND:20261105T090000Z',
                'SUMMARY:Alias',
                'ATTENDEE:mailto:peter@example.com',
            ),
            {
                name: 'standup.ics', 
                ics: weeklyStandup(), 
                etag: '"standup"', 
            },
            object(
                'moved.ics',
                'UID:moved',
                'RECURRENCE-ID:20261105T080000Z',
                'DTSTART:20261105T100000Z',
                'DTEND:20261105T110000Z',
                'SUMMARY:Moved',
            ),
            ...extra,
        ],
    }]);
    const clock = new ControllableClock(new Date('2026-11-01T12:00:00Z'));

    server.addresses = ['mailto:peter@example.com'];

    const client = createCalendarWriteClient([ACCOUNT], { fetch: server.fetch, clock });

    return {
        server, 
        clock, 
        client, 
    };
}

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    const error = await promise.then(() => undefined, (e: unknown) => e);

    expect(error).toBeInstanceOf(ChamviError);

    return error as ChamviError;
}

describe('createCalendarWriteClient: describe', () => {
    it('describes a one-off event of the account\'s own', async () => {
        const { client } = setup();
        const item = await client.describe(idOf('one.ics'));

        expect(item).toEqual({
            event: idOf('one.ics'),
            calendar: 'icloud:home',
            calendarName: 'Home',
            name: 'one.ics',
            etag: '"one.ics"',
            title: 'One',
            start: '2026-11-05T09:00:00+01:00',
            end: '2026-11-05T10:00:00+01:00',
            allDay: false,
            attendees: 1,
            others: false,
            notified: [],
            shared: false,
            recurring: false,
            ended: false,
            data: new Uint8Array(Buffer.from(ONE.ics)),
        });
        expect(Buffer.from(item!.data).toString('utf8')).toBe(ONE.ics);
    });

    it('counts a calendar user address as self and a foreign organizer as others', async () => {
        const { client } = setup();

        expect((await client.describe(idOf('alias.ics')))?.others).toBe(false);
        expect(await client.describe(idOf('boss.ics'))).toMatchObject({
            others: true,
            notified: ['boss@example.com'],
            allDay: true,
            start: '2026-11-05',
            end: '2026-11-06',
            attendees: 0,
        });
    });

    it('marks a series and a lone exception as recurring', async () => {
        const { client } = setup();

        expect(await client.describe(idOf('standup.ics'))).toMatchObject({
            recurring: true,
            title: 'Standup',
            start: '2026-10-19T09:00:00+02:00',
            others: true,
        });
        expect((await client.describe(idOf('moved.ics')))?.recurring).toBe(true);
    });

    it('says ended by the client clock', async () => {
        const { client, clock } = setup();

        expect((await client.describe(idOf('one.ics')))?.ended).toBe(false);
        expect((await client.describe(idOf('boss.ics')))?.ended).toBe(false);

        clock.advance(Date.parse('2026-11-05T23:00:00Z') - clock.now());

        expect((await client.describe(idOf('one.ics')))?.ended).toBe(true);
        // an all-day event ends at midnight in the zone
        expect((await client.describe(idOf('boss.ics')))?.ended).toBe(true);
    });

    it('cuts the title', async () => {
        const { client } = setup([object(
            'long.ics',
            'UID:long',
            'DTSTART:20261105T080000Z',
            'DTEND:20261105T090000Z',
            `SUMMARY:${'x'.repeat(10_000)}`,
        )]);

        expect((await client.describe(idOf('long.ics')))?.title).toHaveLength(500);
    });

    it('gives undefined for a missing event and refuses what it cannot show', async () => {
        const { server, client } = setup([
            {
                name: 'huge.ics', 
                ics: calendar(vevent('UID:huge', 'DTSTART:20261105T080000Z', `DESCRIPTION:${'x'.repeat(2 * 1024 * 1024)}`)), 
                etag: '"huge"', 
            },
            {
                name: 'todo.ics', 
                ics: calendar('BEGIN:VTODO', 'UID:t', 'END:VTODO'), 
                etag: '"todo"', 
            },
            {
                name: 'junk.ics', 
                ics: 'not a calendar', 
                etag: '"junk"', 
            },
        ]);

        expect(await client.describe(idOf('gone.ics'))).toBeUndefined();

        const large = await rejection(client.describe(idOf('huge.ics')));

        expect(large.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
        expect(large.message).toBe('calendar_delete: icloud: too large');

        for (const name of ['todo.ics', 'junk.ics']) {
            const error = await rejection(client.describe(idOf(name)));

            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toBe('calendar_delete: the resource holds no event; nothing was deleted.');
        }

        server.etagOnGet = false;
        expect((await rejection(client.describe(idOf('one.ics')))).message).toBe('calendar_delete: icloud: request failed');
    });

    it('refuses a malformed id, an unknown account or a bad name without a request', async () => {
        const { server, client } = setup();

        for (const id of [
            'nonsense',
            encodeCalendarEventId({
                calendar: 'other:home', 
                name: 'one.ics', 
                etag: '"one.ics"', 
            }),
            encodeCalendarEventId({
                calendar: 'icloud:home', 
                name: '..', 
                etag: '"x"', 
            }),
            encodeCalendarEventId({
                calendar: 'icloud:home', 
                name: '%2e%2e', 
                etag: '"x"', 
            }),
        ]) {
            expect(await rejection(client.describe(id))).toBeInstanceOf(ValidationError);
            expect(await rejection(client.remove(id))).toBeInstanceOf(ValidationError);
        }

        expect(server.requests).toHaveLength(0);
    });

    it('refuses an id of an unknown calendar of the account', async () => {
        const { server, client } = setup();
        const id = encodeCalendarEventId({
            calendar: 'icloud:work', 
            name: 'one.ics', 
            etag: '"one.ics"', 
        });

        expect(await rejection(client.describe(id))).toBeInstanceOf(ValidationError);
        expect(server.requests.some((request) => request.method === 'GET')).toBe(false);
    });
});

describe('createCalendarWriteClient: remove', () => {
    it('deletes once, then answers missing', async () => {
        const { server, client } = setup();

        expect(await client.remove(idOf('one.ics'))).toBe('deleted');
        expect(fakeObjectsOf(server.calendars[0]!).some((item) => item.name === 'one.ics')).toBe(false);
        expect(await client.remove(idOf('one.ics'))).toBe('missing');
    });

    it('refuses an event changed since the id was read and keeps it', async () => {
        const { server, client } = setup();
        const changed = await rejection(client.remove(idOf('one.ics', '"old"')));

        expect(changed).toBeInstanceOf(ValidationError);
        expect(changed.message).toBe(CALENDAR_CHANGED_MESSAGE);
        expect(CALENDAR_CHANGED_MESSAGE).toBe('calendar_delete: the event changed since calendar_events read it: read it again and use its new id; nothing was deleted.');
        expect(fakeObjectsOf(server.calendars[0]!).some((item) => item.name === 'one.ics')).toBe(true);
    });

    it('maps 403 to not permitted and a redirect to request failed', async () => {
        const { server, client } = setup();

        server.fail = { method: 'DELETE', status: 403 };
        expect((await rejection(client.remove(idOf('one.ics')))).message).toBe('calendar_delete: icloud: not permitted');

        server.fail = {
            method: 'DELETE', 
            status: 301, 
            location: 'https://evil.test/', 
        };
        expect((await rejection(client.remove(idOf('one.ics')))).message).toBe('calendar_delete: icloud: request failed');
        expect(server.requests.filter((request) => request.method === 'DELETE')).toHaveLength(2);
        expect(server.requests.some((request) => request.url.includes('evil.test'))).toBe(false);
    });
});
