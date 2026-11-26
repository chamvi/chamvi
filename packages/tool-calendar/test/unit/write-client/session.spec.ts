/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ChamviError, ValidationError } from '@chamvi/errors';
import { ControllableClock } from '@chamvi/test-kit';
import { CALENDAR_REQUEST_ERROR_CODE, createCalendarWriteClient } from '@chamvi/tool-calendar';
import { createUnconfiguredCalendarWriteClient } from '../../../src/write-client/unconfigured.ts';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import { weeklyStandup } from '../../utils/ics.ts';

const PASSWORD = 'app-specific-secret';
const UNKNOWN = 'calendar is unknown: take one from calendar_list.';
const HOME_URL = 'https://p42-caldav.icloud.com/123/calendars/home/';

function account(id = 'icloud', user = 'me@example.com') {
    return {
        id,
        url: FAKE_CALDAV_URL,
        user,
        password: PASSWORD,
    };
}

function fake() {
    return createFakeCalDav([
        {
            slug: 'home',
            name: 'Home',
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

describe('createCalendarWriteClient: lookups', () => {
    it('looks up a listed VEVENT calendar', async () => {
        const server = fake();
        const client = createCalendarWriteClient([account()], { fetch: server.fetch, timezone: 'UTC' });

        expect(client.timezone).toBe('UTC');
        expect(await client.calendar('icloud:home')).toEqual({
            calendar: 'icloud:home',
            account: 'icloud',
            name: 'Home',
            url: HOME_URL,
        });
    });

    it('refuses an unknown account, calendar or a VTODO list', async () => {
        const client = createCalendarWriteClient([account()], { fetch: fake().fetch });

        for (const id of ['other:home', 'icloud:work', 'icloud:reminders', 'icloud', '', 'icloud:']) {
            const error = await rejection(client.calendar(id));

            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toBe(UNKNOWN);
        }
    });

    it('takes the organizer from the calendar user addresses, else an address-shaped user', async () => {
        const server = fake();

        server.addresses = ['urn:uuid:1234', '/123/principal/', 'mailto:Peter@Example.com', 'mailto:other@example.com'];

        const client = createCalendarWriteClient([account(), account('work', 'peter')], { fetch: server.fetch });

        expect(await client.organizer('icloud')).toBe('Peter@Example.com');

        const plain = fake();
        const fallback = createCalendarWriteClient([account(), account('work', 'peter')], { fetch: plain.fetch });

        expect(await fallback.organizer('icloud')).toBe('me@example.com');
        expect(await fallback.organizer('work')).toBeUndefined();

        const error = await rejection(fallback.organizer('other'));

        expect(error).toBeInstanceOf(ValidationError);
    });

    it('discovers once per session and sends PROPFIND only', async () => {
        const server = fake();
        const client = createCalendarWriteClient([account()], { fetch: server.fetch });

        await client.calendar('icloud:home');
        await client.organizer('icloud');

        const count = server.requests.length;

        await client.calendar('icloud:home');
        await client.organizer('icloud');

        expect(server.requests).toHaveLength(count);
        expect(server.requests.filter((request) => request.body.includes('calendar-user-address-set'))).toHaveLength(1);
        expect(server.requests.length).toBeGreaterThan(0);
        expect(server.requests.every((request) => request.method === 'PROPFIND')).toBe(true);

        // close forgets the session: the next call logs in again
        await client.close();
        await client.calendar('icloud:home');

        expect(server.requests.length).toBeGreaterThan(count);
    });

    it('turns a 401 into calendar_request without the server text or the password', async () => {
        const server = fake();

        server.status = 401;

        const client = createCalendarWriteClient([account()], { fetch: server.fetch });
        const error = await rejection(client.calendar('icloud:home'));

        expect(error.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
        expect(error.message).toBe('calendar_create: icloud: request failed');
        expect(JSON.stringify(error)).not.toContain('denied');
        expect(JSON.stringify(error)).not.toContain(PASSWORD);

        server.status = undefined;

        expect((await client.calendar('icloud:home')).name).toBe('Home');
    });

    it('times out on the clock and logs in again on the next call', async () => {
        const server = fake();
        const clock = new ControllableClock();

        server.hang = true;

        const client = createCalendarWriteClient([account()], {
            fetch: server.fetch,
            clock,
            timeoutMs: 1000,
        });
        const pending = rejection(client.calendar('icloud:home'));

        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        clock.advance(1000);

        const error = await pending;

        expect(error.code).toBe(CALENDAR_REQUEST_ERROR_CODE);
        expect(error.message).toBe('calendar_create: icloud: timed out');

        server.hang = false;

        const before = server.requests.length;

        expect((await client.calendar('icloud:home')).name).toBe('Home');
        expect(server.requests.slice(before).some((request) => request.url.includes('principal'))).toBe(true);
    });

    it('stops with the caller\'s signal', async () => {
        const server = fake();

        server.hang = true;

        const client = createCalendarWriteClient([account()], { fetch: server.fetch });
        const controller = new AbortController();
        const pending = client.calendar('icloud:home', controller.signal).then(() => undefined, (e: unknown) => e);
        const reason = new Error('cancelled');

        controller.abort(reason);

        expect(await pending).toBe(reason);
    });
});

describe('createUnconfiguredCalendarWriteClient', () => {
    it('refuses every call with the connection error', async () => {
        const client = createUnconfiguredCalendarWriteClient('calendar');

        expect(client.configured).toBe(false);
        expect(client.timezone).toBe('Europe/Berlin');
        expect((await rejection(client.calendar('icloud:home'))).code).toBe('connection_not_configured');
        expect((await rejection(client.organizer('icloud'))).code).toBe('connection_not_configured');
        await client.close();
    });
});
