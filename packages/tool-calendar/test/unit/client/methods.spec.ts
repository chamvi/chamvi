/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ChamviError } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { CALENDAR_REQUEST_ERROR_CODE, createCalendarClient } from '@chamvi/tool-calendar';
import { guardedFetch } from '../../../src/client/guard.ts';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import { BERLIN_VTIMEZONE, weeklyStandup } from '../../utils/ics.ts';

const PASSWORD = 'app-specific-secret';

function account(id = 'me') {
    return {
        id,
        url: FAKE_CALDAV_URL,
        user: 'me@example.com',
        password: PASSWORD,
    };
}

function fakeWithCalendars() {
    return createFakeCalDav([
        {
            slug: 'home',
            name: 'Home',
            color: '#FF0000FF',
            timezone: `BEGIN:VCALENDAR\r\n${BERLIN_VTIMEZONE}\r\nEND:VCALENDAR`,
            objects: [weeklyStandup()],
        },
        {
            slug: 'reminders',
            name: 'Reminders',
            components: ['VTODO'],
            objects: [],
        },
    ]);
}

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    const error = await promise.then(() => undefined, (e: unknown) => e);

    expect(error).toBeInstanceOf(ChamviError);

    return error as ChamviError;
}

describe('createCalendarClient', () => {
    it('lists VEVENT calendars and reads events with PROPFIND, REPORT and GET only', async () => {
        const fake = fakeWithCalendars();
        const client = createCalendarClient([account()], { fetch: fake.fetch });

        expect(await client.calendars()).toEqual([{
            calendar: 'me:home',
            account: 'me',
            name: 'Home',
            color: '#FF0000FF',
            timezone: 'Europe/Berlin',
        }]);

        const { events, truncated } = await client.events({
            from: '2026-10-20',
            to: '2026-12-31',
        });

        expect(truncated).toBe(false);
        expect(events.map((event) => event.start)).toEqual([
            '2026-10-26T09:00:00+01:00',
            '2026-11-09T14:00:00+01:00',
            '2026-11-16T09:00:00+01:00',
            '2026-11-23T09:00:00+01:00',
        ]);
        expect(events[0]?.attendees).toEqual({ count: 2, self: 'ACCEPTED' });

        const methods = new Set(fake.requests.map((request) => request.method));

        expect([...methods].every((method) => ['PROPFIND', 'REPORT', 'GET'].includes(method))).toBe(true);
        expect(methods.has('REPORT')).toBe(true);
        // never the server's expansion
        expect(fake.requests.some((request) => request.body.includes('expand'))).toBe(false);
        expect(fake.requests.every((request) => request.authorization?.startsWith('Basic '))).toBe(true);

        await client.close();
    });

    it('logs in once per account', async () => {
        const fake = fakeWithCalendars();
        const client = createCalendarClient([account()], { fetch: fake.fetch });

        await client.calendars();

        const discovery = fake.requests.filter((request) => request.url.includes('principal')).length;

        await client.calendars();

        expect(fake.requests.filter((request) => request.url.includes('principal')).length).toBe(discovery);
    });

    it('limits and filters events by calendar', async () => {
        const fake = fakeWithCalendars();
        const client = createCalendarClient([account()], { fetch: fake.fetch });
        const { events, truncated } = await client.events({
            from: '2026-10-20T00:00:00Z',
            to: '2026-12-31T00:00:00Z',
            calendar: 'me:home',
            limit: 2,
        });

        expect(events.map((event) => event.title)).toEqual(['Standup', 'Standup moved']);
        expect(truncated).toBe(true);
    });

    it('refuses a bad range or an unknown calendar with a ValidationError', async () => {
        const fake = fakeWithCalendars();
        const client = createCalendarClient([account()], { fetch: fake.fetch });

        for (const input of [
            { from: '2026-11-05', to: '2026-11-05' },
            { from: '2026-11-05', to: '2026-11-04' },
            { from: '2026-01-01', to: '2026-04-04' },
            { from: 'tomorrow', to: '2026-11-05' },
            {
                from: '2026-11-05',
                to: '2026-11-06',
                calendar: 'me:work',
            },
            {
                from: '2026-11-05',
                to: '2026-11-06',
                calendar: 'other:home',
            },
        ]) {
            const error = await rejection(client.events(input));

            expect(error.code).toBe('validation_error');
        }

        // at most 92 days
        await client.events({ from: '2026-01-01', to: '2026-04-03' });
    });

    it('turns a 401 into calendar_request without the password or the server text', async () => {
        const fake = fakeWithCalendars();

        fake.status = 401;

        const client = createCalendarClient([account()], { fetch: fake.fetch });
        const error = await rejection(client.calendars());

        expect(error.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
        expect(error.message).toBe('calendar_list: me: request failed');
        expect(error.message).not.toContain(PASSWORD);
        expect(error.message).not.toContain('denied');
        expect(JSON.stringify(error)).not.toContain(PASSWORD);

        // the next call logs in again
        fake.status = undefined;

        expect(await client.calendars()).toHaveLength(1);
    });

    it('times out on the clock', async () => {
        const fake = fakeWithCalendars();
        const clock = new ControllableClock();

        fake.hang = true;

        const client = createCalendarClient([account()], {
            fetch: fake.fetch,
            clock,
            timeoutMs: 1000,
        });
        const pending = rejection(client.events({ from: '2026-11-05', to: '2026-11-06' }));

        await Promise.resolve();
        clock.advance(999);
        await Promise.resolve();

        let settled = false;

        void pending.then(() => {
            settled = true;
        });
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        expect(settled).toBe(false);

        clock.advance(1);

        const error = await pending;

        expect(error.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
        expect(error.message).toBe('calendar_events: me: timed out');

        // the hung login was aborted, so the next call logs in again
        fake.hang = false;

        expect(await client.calendars()).toHaveLength(1);
    });

    it('refuses bad accounts and options', () => {
        expect(() => createCalendarClient([account(), account()])).toThrow(/unique/);
        expect(() => createCalendarClient([{ ...account(), id: 'Not Valid' }])).toThrow(/id/);
        expect(() => createCalendarClient([{ ...account(), url: 'ftp://x' }])).toThrow(/url/);
        expect(() => createCalendarClient([{ ...account(), password: '' }])).toThrow(/password/);
        expect(() => createCalendarClient([account()], { timezone: 'Mars/Olympus' })).toThrow(/timezone/);
        expect(() => createCalendarClient([account()], { timeoutMs: 0 })).toThrow(/timeoutMs/);
    });
});

describe('guardedFetch', () => {
    it('refuses any method but PROPFIND, REPORT and GET before sending', async () => {
        let calls = 0;
        const inner: typeof fetch = async () => {
            calls++;

            return new Response('');
        };
        const fetch = guardedFetch(inner);

        for (const method of ['PUT', 'DELETE', 'POST', 'MKCALENDAR', 'PROPPATCH', 'MOVE']) {
            const error = await rejection(fetch('https://example.com/', { method }));

            expect(error.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
            expect(error.message).toBe(`calendar: method ${method} is not allowed`);
        }

        expect(calls).toBe(0);

        await fetch('https://example.com/', { method: 'propfind' });
        await fetch('https://example.com/', { method: 'REPORT' });
        await fetch('https://example.com/');

        expect(calls).toBe(3);
    });

    it('checks the method of a Request', async () => {
        let calls = 0;
        const fetch = guardedFetch(async () => {
            calls++;

            return new Response('');
        });

        await rejection(fetch(new Request('https://example.com/', { method: 'PUT', body: 'x' })));

        expect(calls).toBe(0);
    });
});
