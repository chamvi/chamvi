/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    afterAll, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { createCalendarWriteClient } from '@chamvi/tool-calendar';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { calendarResourceOf } from '../../../src/write-client/create.ts';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import { weeklyStandup } from '../../utils/ics.ts';
import type { FakeRequest } from '../../utils/caldav.ts';

const ACCOUNT = {
    id: 'icloud',
    url: FAKE_CALDAV_URL,
    user: 'peter@example.com',
    password: 'secret',
};
const HOME_URL = 'https://p42-caldav.icloud.com/123/calendars/home/';

/** Every request of this file, to check no other method ever appears. */
const all: FakeRequest[] = [];

function isChildOfHome(url: string): boolean {
    return url.startsWith(HOME_URL) && url.length > HOME_URL.length && !url.slice(HOME_URL.length).includes('/');
}

describe('write client methods', () => {
    afterAll(() => {
        expect(all.length).toBeGreaterThan(0);
        expect(all.every((request) => ['PROPFIND', 'GET', 'PUT', 'DELETE'].includes(request.method))).toBe(true);
        expect(all.some((request) => request.method === 'REPORT')).toBe(false);
    });

    it('creates with PROPFIND, GET and PUT only, each PUT a guarded create of a child of the calendar', async () => {
        const server = createFakeCalDav([{
            slug: 'home', 
            name: 'Home', 
            objects: [], 
        }]);
        const client = createCalendarWriteClient([ACCOUNT], { fetch: server.fetch });
        const { uid, name } = calendarResourceOf('run-1:calendar_create:methods');
        const request = {
            calendar: 'icloud:home',
            uid,
            name,
            title: 'Planning',
            start: { kind: 'instant' as const, instant: Temporal.Instant.from('2026-11-05T08:00:00Z') },
            end: { kind: 'instant' as const, instant: Temporal.Instant.from('2026-11-05T09:00:00Z') },
            organizer: 'peter@example.com',
            attendees: ['a@x.test'],
        };

        await client.create(request);
        // the replay takes the 412 path
        await client.create(request);
        await client.findCreated('icloud:home', 'run-1:calendar_create:methods');

        all.push(...server.requests);

        expect(server.requests.every((r) => ['PROPFIND', 'GET', 'PUT'].includes(r.method))).toBe(true);

        const puts = server.requests.filter((r) => r.method === 'PUT');

        expect(puts).toHaveLength(2);

        for (const put of puts) {
            expect(put.headers['if-none-match']).toBe('*');
            expect(put.headers).not.toHaveProperty('if-match');
            expect(put.redirect).toBe('manual');
            expect(isChildOfHome(put.url)).toBe(true);
        }
    });

    it('describes and deletes with PROPFIND, GET and DELETE only, each DELETE carrying the id\'s etag', async () => {
        const server = createFakeCalDav([{
            slug: 'home', 
            name: 'Home', 
            objects: [weeklyStandup()], 
        }]);
        const client = createCalendarWriteClient([ACCOUNT], { fetch: server.fetch });
        const event = encodeCalendarEventId({
            calendar: 'icloud:home', 
            name: 'event-0.ics', 
            etag: '"0"', 
        });

        await client.describe(event);
        await client.remove(event);
        await client.remove(event);

        all.push(...server.requests);

        expect(server.requests.every((r) => ['PROPFIND', 'GET', 'DELETE'].includes(r.method))).toBe(true);

        const deletes = server.requests.filter((r) => r.method === 'DELETE');

        expect(deletes).toHaveLength(2);

        for (const request of deletes) {
            expect(request.headers['if-match']).toBe('"0"');
            expect(request.redirect).toBe('manual');
            expect(isChildOfHome(request.url)).toBe(true);
        }
    });
});
