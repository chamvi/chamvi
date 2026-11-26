/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/errors';
import { CALENDAR_REQUEST_ERROR_CODE } from '@chamvi/tool-calendar';
import { writeGuardedFetch } from '../../../src/write-client/guard.ts';
import { resourceRequest, resourceUrlOf, statusError } from '../../../src/write-client/resource.ts';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import { weeklyStandup } from '../../utils/ics.ts';

const HOME_URL = 'https://p42-caldav.icloud.com/123/calendars/home/';
const VIEW = {
    calendar: 'icloud:home',
    account: 'icloud',
    name: 'Home',
    url: HOME_URL,
};
const ACCOUNT = {
    id: 'icloud',
    url: FAKE_CALDAV_URL,
    user: 'me@example.com',
    password: 'secret',
};

describe('resourceUrlOf', () => {
    it('gives a direct child of the calendar', () => {
        expect(resourceUrlOf(VIEW, 'event-0.ics')).toBe(`${HOME_URL}event-0.ics`);
        expect(resourceUrlOf(VIEW, 'my%20event.ics')).toBe(`${HOME_URL}my%20event.ics`);
        expect(resourceUrlOf({ ...VIEW, url: HOME_URL.slice(0, -1) }, 'a.ics')).toBe(`${HOME_URL}a.ics`);
    });

    it('refuses anything else before a request', () => {
        for (const name of ['', '.', '..', '%2e%2e', '%2E', 'a/b.ics', 'a?b', 'a#b', 'a\\b', '//evil.test/x', 'x'.repeat(256), '..%2Fwork%2Fx.ics', '%2E%2E%2Fx.ics', 'a%5Cb.ics', '%2fx.ics', '%E0%A4%A.ics', 'a%00b.ics', 'a\u0001b.ics']) {
            expect(() => resourceUrlOf(VIEW, name), name).toThrow(ValidationError);
        }

        // a scheme-like name stays a child of the calendar
        expect(resourceUrlOf(VIEW, 'https:evil.test')).toBe(`${HOME_URL}https:evil.test`);
    });
});

describe('resourceRequest', () => {
    it('sends Basic auth through the guard with redirect: manual', async () => {
        const server = createFakeCalDav([{
            slug: 'home', 
            name: 'Home', 
            objects: [weeklyStandup()], 
        }]);
        const response = await resourceRequest(writeGuardedFetch(server.fetch), ACCOUNT, {
            method: 'GET',
            url: `${HOME_URL}event-0.ics`,
            headers: {},
            signal: new AbortController().signal,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('etag')).toBe('"0"');
        expect(await response.text()).toContain('UID:standup');
        expect(server.requests[0]?.authorization).toBe(`Basic ${Buffer.from('me@example.com:secret').toString('base64')}`);
        expect(server.requests[0]?.redirect).toBe('manual');
    });

    it('does not follow a redirected write', async () => {
        const server = createFakeCalDav([{
            slug: 'home', 
            name: 'Home', 
            objects: [], 
        }]);

        server.fail = {
            method: 'PUT', 
            status: 301, 
            location: 'https://evil.test/x.ics', 
        };

        const response = await resourceRequest(writeGuardedFetch(server.fetch), ACCOUNT, {
            method: 'PUT',
            url: `${HOME_URL}new.ics`,
            headers: { 'If-None-Match': '*', 'Content-Type': 'text/calendar; charset=utf-8' },
            body: 'BEGIN:VCALENDAR',
            signal: new AbortController().signal,
        });

        expect(response.status).toBe(301);
        expect(server.requests).toHaveLength(1);
        expect(server.requests[0]?.redirect).toBe('manual');
        expect(statusError('calendar_create', 'icloud', response.status).message).toBe('calendar_create: icloud: request failed');
    });
});

describe('statusError', () => {
    it('maps 401 and 403 to not permitted, the rest to request failed', () => {
        expect(statusError('calendar_create', 'icloud', 401).message).toBe('calendar_create: icloud: not permitted');
        expect(statusError('calendar_delete', 'icloud', 403).message).toBe('calendar_delete: icloud: not permitted');
        expect(statusError('calendar_create', 'icloud', 302).message).toBe('calendar_create: icloud: request failed');
        expect(statusError('calendar_create', 'icloud', 500).message).toBe('calendar_create: icloud: request failed');
        expect(statusError('calendar_create', 'icloud', 500).code).toBe(CALENDAR_REQUEST_ERROR_CODE);
    });
});
